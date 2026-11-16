-- REGISTRADO como migración en drizzle/migrations/0016_registrar_cambios_manuales.sql (16 nov 2026). Este archivo queda como referencia.
-- ESTADO: PENDIENTE de aplicar a mano en el editor de SQL de Lovable (después de subir el código que acepta el motivo 'ya_en_discover').
-- Después, registrarlo como migración en el próximo mensaje de base de datos a Lovable. Es idempotente (create or replace).
-- Orden de aplicación: migración 0015 → supabase/fusion-reglas-v2.sql → este archivo → supabase/cruce-snoop-cron.sql (una sola vez).

-- v3: cruce con Snoop. Funciones nuevas datos_discover y cruzar_snoop, y las dos funciones de guardado actualizadas.
-- Sin artículos recientes de Snoop no cambia nada. Se aplica DESPUÉS de combinar_alertas_v2.

-- 3b) CRUCE CON SNOOP. Snoop envía los artículos que están entrando en Discover (tabla snoop_articulos).
--     datos_discover(): para un tema, cuántos medios distintos lo han publicado en las últimas 3 horas, cuáles y con
--     qué titulares. "Snoop vivo" = ha llegado algún artículo en las últimas 2 horas; si no, no sabemos nada y no se toca.
--     Un titular habla del tema si contiene su nombre completo, o su apellido (solo si el tema tiene varias palabras,
--     el apellido tiene 5 o más letras y no es uno muy común).
create or replace function public.datos_discover(nombre text, instante timestamptz)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  clave text := public.clave_entidad(coalesce(nombre, ''));
  vacias constant text[] := array['de','del','la','el','los','las','y','e','en','con','por','para','al'];
  comunes constant text[] := array['sanchez','garcia','lopez','martinez','gonzalez','rodriguez','fernandez','perez','gomez','martin','jimenez','ruiz','hernandez','diaz','moreno','alvarez','munoz','romero','alonso','gutierrez','navarro','torres','dominguez','vazquez','ramos','ramirez','serrano','blanco','suarez','molina','morales','ortega','delgado','castro','ortiz','rubio','marin','nunez','medina','garrido','santos','castillo','cortes','lozano','guerrero','prieto','mendez','calvo','gallego','vidal','herrera','flores','iglesias'];
  tokens text[];
  apellido text;
  vivo boolean;
  lista text[];
  titulares jsonb;
  total integer;
begin
  vivo := exists (select 1 from public.snoop_articulos s where s.recibido_en >= instante - interval '2 hours');
  if not vivo or clave = '' or left(clave, 1) = '#' then
    return jsonb_build_object('vivo', vivo, 'medios', 0, 'lista', '[]'::jsonb, 'titulares', '[]'::jsonb);
  end if;
  select coalesce(array_agg(t order by pos), '{}'::text[]) into tokens
    from unnest(string_to_array(clave, ' ')) with ordinality as u(t, pos)
    where length(t) >= 3 and t <> all (vacias);
  if cardinality(tokens) >= 2 then
    apellido := tokens[cardinality(tokens)];
    if length(apellido) < 5 or apellido = any (comunes) then apellido := null; end if;
  end if;
  with c as (
    select s.medio, s.titular, s.recibido_en
    from public.snoop_articulos s
    where s.recibido_en >= instante - interval '3 hours'
      and (position(' ' || clave || ' ' in ' ' || public.clave_entidad(coalesce(s.titular, '')) || ' ') > 0
        or (apellido is not null
            and position(' ' || apellido || ' ' in ' ' || public.clave_entidad(coalesce(s.titular, '')) || ' ') > 0))
  ), medios as (
    select medio, min(recibido_en) as primero from c group by medio
  ), ultimos as (
    select distinct on (medio) medio, titular, recibido_en from c order by medio, recibido_en desc
  )
  select
    coalesce((select array_agg(m.medio order by m.primero) from (select medio, primero from medios order by primero limit 12) m), '{}'::text[]),
    coalesce((select jsonb_agg(jsonb_build_object('medio', u.medio, 'titular', u.titular) order by u.recibido_en desc)
              from (select medio, titular, recibido_en from ultimos order by recibido_en desc limit 3) u), '[]'::jsonb),
    (select count(*) from medios)::integer
  into lista, titulares, total;
  return jsonb_build_object('vivo', true, 'medios', total, 'lista', to_jsonb(lista), 'titulares', titulares);
end;
$$;

--     cruzar_snoop(): revisa las alertas de las últimas 24 h y les añade lo que Snoop haya enviado desde entonces
--     (nunca baja el número de medios), les quita la etiqueta [SIN DISCOVER] y sube a prioridad alta las que tienen señal en X
--     y 0-2 medios. Si Snoop no está vivo no toca nada. Pensada para ejecutarse cada 15 minutos con pg_cron.
create or replace function public.cruzar_snoop(instante timestamptz default clock_timestamp())
returns jsonb language plpgsql set search_path = '' as $$
declare
  a record;
  d jsonb;
  vivo boolean;
  medios_nuevo integer;
  lista_nueva text[];
  titulares_nuevo jsonb;
  prioridad_nueva text;
  revisadas integer := 0;
  actualizadas integer := 0;
begin
  perform pg_catalog.pg_advisory_xact_lock(734210, 1);
  vivo := exists (select 1 from public.snoop_articulos s where s.recibido_en >= instante - interval '2 hours');
  if not vivo then
    return jsonb_build_object('snoop_vivo', false, 'revisadas', 0, 'actualizadas', 0);
  end if;
  for a in
    select id, entidad, medios_discover, medios_lista, titulares_seo, x_posicion, prioridad
    from public.alertas where creada_en >= instante - interval '24 hours' order by id
  loop
    revisadas := revisadas + 1;
    d := public.datos_discover(a.entidad, instante);
    medios_nuevo := greatest(a.medios_discover, (d->>'medios')::integer);
    lista_nueva := (a.medios_lista || array(
      select m.valor from jsonb_array_elements_text(d->'lista') as m(valor) where m.valor <> all (a.medios_lista)))[1:12];
    titulares_nuevo := coalesce((
      select jsonb_agg(u.e order by u.o, u.ord) from (
        select e, 1 as o, ord from jsonb_array_elements(a.titulares_seo) with ordinality as x(e, ord)
        union all
        select e, 2 as o, ord from jsonb_array_elements(coalesce(d->'titulares', '[]'::jsonb)) with ordinality as y(e, ord)
          where not exists (select 1 from jsonb_array_elements(a.titulares_seo) as z(e2) where z.e2->>'medio' = e->>'medio')
        order by o, ord limit 3
      ) u), '[]'::jsonb);
    prioridad_nueva := case when a.prioridad = 'media' and a.x_posicion is not null and medios_nuevo <= 2 then 'alta' else a.prioridad end;
    update public.alertas t set
      medios_discover = medios_nuevo,
      medios_lista = lista_nueva,
      titulares_seo = titulares_nuevo,
      entidad = regexp_replace(t.entidad, '^\[SIN DISCOVER\]\s*', '', 'i'),
      prioridad = prioridad_nueva
    where t.id = a.id
      and (t.medios_discover <> medios_nuevo
        or t.medios_lista is distinct from lista_nueva
        or t.titulares_seo is distinct from titulares_nuevo
        or t.entidad ~* '^\[SIN DISCOVER\]'
        or t.prioridad is distinct from prioridad_nueva);
    if found then actualizadas := actualizadas + 1; end if;
  end loop;
  return jsonb_build_object('snoop_vivo', true, 'revisadas', revisadas, 'actualizadas', actualizadas);
end;
$$;

-- 4) Trends y X: ahora combina antes de decidir si crea una alerta nueva.
create or replace function public.guardar_alertas_trends_atomicas(candidatas jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  instante timestamptz;
  inicio_dia timestamptz;
  fin_dia timestamptz;
  hora numeric;
  inicio numeric;
  fin numeric;
  maximo integer;
  ajustes jsonb;
  total_antes integer;
  fila jsonb;
  nombre text;
  motivo text;
  fusion jsonb;
  creada record;
  valor_x_desde timestamptz;
  datos jsonb;
  creadas jsonb := '[]'::jsonb;
  combinadas jsonb := '[]'::jsonb;
  descartadas jsonb := '[]'::jsonb;
begin
  if candidatas is null or jsonb_typeof(candidatas) <> 'array' then
    raise exception 'Las candidatas deben ser una lista';
  end if;
  if jsonb_array_length(candidatas) > 40 then
    raise exception 'Máximo cuarenta candidatas por ejecución';
  end if;
  -- One transaction covers the lock, fresh checks and the complete batch.
  perform pg_catalog.pg_advisory_xact_lock(734210, 1);
  instante := clock_timestamp();
  inicio_dia := date_trunc('day', instante at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';
  fin_dia := (date_trunc('day', instante at time zone 'Europe/Madrid') + interval '1 day') at time zone 'Europe/Madrid';
  hora := extract(epoch from (instante at time zone 'Europe/Madrid')::time) / 3600;
  select jsonb_object_agg(c.clave, c.valor) into ajustes
  from (select clave, valor from public.config
        where clave in ('max_alertas_dia', 'hora_inicio', 'hora_fin') for share) c;
  if ajustes is null or not (ajustes ?& array['max_alertas_dia','hora_inicio','hora_fin'])
     or coalesce(trim(ajustes->>'max_alertas_dia'), '') = ''
     or coalesce(trim(ajustes->>'hora_inicio'), '') = ''
     or coalesce(trim(ajustes->>'hora_fin'), '') = '' then
    raise exception 'Configuración de horario o máximo diario no válida';
  end if;
  maximo := (ajustes->>'max_alertas_dia')::numeric::integer;
  inicio := (ajustes->>'hora_inicio')::numeric;
  fin := (ajustes->>'hora_fin')::numeric;
  if (ajustes->>'max_alertas_dia')::numeric <> maximo or maximo < 0 or maximo > 100000
     or inicio < 0 or inicio >= 24 or fin <= 0 or fin > 24
     or inicio = 'NaN'::numeric or fin = 'NaN'::numeric then
    raise exception 'Configuración de horario o máximo diario no válida';
  end if;
  select count(*) into total_antes from public.alertas
    where creada_en >= inicio_dia and creada_en < fin_dia;
  for fila in select value from jsonb_array_elements(candidatas) loop
    nombre := trim(regexp_replace(coalesce(fila->>'entidad', ''), '^\[(PRUEBA|SIN DISCOVER)\]\s*', '', 'i'));
    motivo := null;
    if public.clave_entidad(nombre) = '' then
      motivo := 'sin_termino';
    else
      -- Combinar no crea alertas nuevas: se permite aunque sea fuera de horario o se haya llegado al tope.
      fusion := public.fusionar_alerta_reciente(fila, instante);
      if fusion is not null then
        if fusion->>'resultado' = 'combinada' then
          combinadas := combinadas || jsonb_build_array(jsonb_build_object(
            'id', (fusion->>'id')::bigint,
            'entidad', (select a.entidad from public.alertas a where a.id = (fusion->>'id')::bigint),
            'candidata', nombre, 'fuentes', fusion->'fuentes'));
          continue;
        end if;
        motivo := 'ya_avisada';
      else
        datos := public.datos_discover(nombre, instante);
        if (datos->>'vivo')::boolean and (datos->>'medios')::integer >= 6 then
          -- Con Snoop vivo y 6 o más medios ya en Discover llegaríamos tarde: no se crea, solo se registra.
          motivo := 'ya_en_discover';
        elsif not (case when inicio <= fin then hora >= inicio and hora < fin else hora >= inicio or hora < fin end) then
          motivo := 'fuera_de_horario';
        elsif total_antes + jsonb_array_length(creadas) >= maximo then
          motivo := 'tope_diario';
        elsif jsonb_array_length(creadas) >= 3 then
          motivo := 'limite_ejecucion';
        end if;
      end if;
    end if;
    if motivo is not null then
      descartadas := descartadas || jsonb_build_array(jsonb_build_object('termino', nombre, 'motivo', motivo));
      continue;
    end if;
    -- Hora de entrada en X: solo una fecha ISO válida con zona horaria; si falla la conversión, queda vacía.
    valor_x_desde := null;
    if fila->>'x_desde' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}:?[0-9]{2})$' then
      begin
        valor_x_desde := (fila->>'x_desde')::timestamptz;
      exception when others then
        valor_x_desde := null;
      end;
    end if;
    insert into public.alertas (creada_en, entidad, contexto, prioridad, trends_activo, trends_crecimiento,
      x_posicion, x_desde, medios_discover, medios_lista, titulares_seo, angulo, seccion_sugerida, motivo_afinidad, estado)
    values (instante, case when (datos->>'vivo')::boolean then regexp_replace(fila->>'entidad', '^\[SIN DISCOVER\]\s*', '', 'i') else fila->>'entidad' end, coalesce(fila->>'contexto', ''), case when (datos->>'vivo')::boolean and fila->>'x_posicion' ~ '^[0-9]{1,3}$' and (datos->>'medios')::integer <= 2 then 'alta' else 'media' end,
      case when fila->>'trends_activo' = 'false' then false else true end,
      fila->>'trends_crecimiento',
      case when fila->>'x_posicion' ~ '^[0-9]{1,3}$' then (fila->>'x_posicion')::int else null end,
      valor_x_desde,
      (datos->>'medios')::integer, array(select jsonb_array_elements_text(datos->'lista')), datos->'titulares', coalesce(fila->>'angulo', ''),
      coalesce(fila->>'seccion_sugerida', ''), coalesce(fila->>'motivo_afinidad', ''), 'pendiente')
    returning id, entidad, contexto into creada;
    creadas := creadas || jsonb_build_array(to_jsonb(creada));
  end loop;
  return jsonb_build_object('creadas', creadas, 'combinadas', combinadas, 'descartadas', descartadas,
    'total_hoy_antes', total_antes, 'total_hoy_despues', total_antes + jsonb_array_length(creadas), 'max_alertas_dia', maximo);
end;
$$;

-- 5) Wikipedia: igual que Trends (mismo bloqueo, mismo tope diario, misma combinación).
create or replace function public.guardar_alertas_wikipedia_atomicas(candidatas jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  instante timestamptz;
  inicio_dia timestamptz;
  fin_dia timestamptz;
  hora numeric;
  inicio numeric;
  fin numeric;
  maximo integer;
  ajustes jsonb;
  total_antes integer;
  fila jsonb;
  nombre text;
  motivo text;
  fusion jsonb;
  creada record;
  datos jsonb;
  creadas jsonb := '[]'::jsonb;
  combinadas jsonb := '[]'::jsonb;
  descartadas jsonb := '[]'::jsonb;
begin
  if candidatas is null or jsonb_typeof(candidatas) <> 'array' then
    raise exception 'Las candidatas deben ser una lista';
  end if;
  if jsonb_array_length(candidatas) > 40 then
    raise exception 'Máximo cuarenta candidatas por ejecución';
  end if;
  -- Same lock as Trends: both sources share the daily cap and deduplication.
  perform pg_catalog.pg_advisory_xact_lock(734210, 1);
  instante := clock_timestamp();
  inicio_dia := date_trunc('day', instante at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';
  fin_dia := (date_trunc('day', instante at time zone 'Europe/Madrid') + interval '1 day') at time zone 'Europe/Madrid';
  hora := extract(epoch from (instante at time zone 'Europe/Madrid')::time) / 3600;
  select jsonb_object_agg(c.clave, c.valor) into ajustes
  from (select clave, valor from public.config
    where clave in ('max_alertas_dia', 'hora_inicio', 'hora_fin') for share) c;
  if ajustes is null or not (ajustes ?& array['max_alertas_dia','hora_inicio','hora_fin'])
    or coalesce(trim(ajustes->>'max_alertas_dia'), '') = ''
    or coalesce(trim(ajustes->>'hora_inicio'), '') = ''
    or coalesce(trim(ajustes->>'hora_fin'), '') = '' then
    raise exception 'Configuración de horario o máximo diario no válida';
  end if;
  maximo := (ajustes->>'max_alertas_dia')::numeric::integer;
  inicio := (ajustes->>'hora_inicio')::numeric;
  fin := (ajustes->>'hora_fin')::numeric;
  if (ajustes->>'max_alertas_dia')::numeric <> maximo or maximo < 0 or maximo > 100000
    or inicio < 0 or inicio >= 24 or fin <= 0 or fin > 24
    or inicio = 'NaN'::numeric or fin = 'NaN'::numeric then
    raise exception 'Configuración de horario o máximo diario no válida';
  end if;
  select count(*) into total_antes from public.alertas
    where creada_en >= inicio_dia and creada_en < fin_dia;
  for fila in select value from jsonb_array_elements(candidatas) loop
    nombre := trim(regexp_replace(coalesce(fila->>'entidad', ''), '^\[(PRUEBA|SIN DISCOVER)\]\s*', '', 'i'));
    motivo := null;
    if public.clave_entidad(nombre) = '' then
      motivo := 'sin_termino';
    else
      fusion := public.fusionar_alerta_reciente(fila, instante);
      if fusion is not null then
        if fusion->>'resultado' = 'combinada' then
          combinadas := combinadas || jsonb_build_array(jsonb_build_object(
            'id', (fusion->>'id')::bigint,
            'entidad', (select a.entidad from public.alertas a where a.id = (fusion->>'id')::bigint),
            'candidata', nombre, 'fuentes', fusion->'fuentes'));
          continue;
        end if;
        motivo := 'ya_avisada';
      else
        datos := public.datos_discover(nombre, instante);
        if (datos->>'vivo')::boolean and (datos->>'medios')::integer >= 6 then
          -- Con Snoop vivo y 6 o más medios ya en Discover llegaríamos tarde: no se crea, solo se registra.
          motivo := 'ya_en_discover';
        elsif not (case when inicio <= fin then hora >= inicio and hora < fin else hora >= inicio or hora < fin end) then
          motivo := 'fuera_de_horario';
        elsif total_antes + jsonb_array_length(creadas) >= maximo then
          motivo := 'tope_diario';
        elsif jsonb_array_length(creadas) >= 3 then
          motivo := 'limite_ejecucion';
        end if;
      end if;
    end if;
    if motivo is not null then
      descartadas := descartadas || jsonb_build_array(jsonb_build_object('termino', nombre, 'motivo', motivo));
      continue;
    end if;
    insert into public.alertas (creada_en, entidad, contexto, prioridad, trends_activo, trends_crecimiento,
      wikipedia_visitas, wikipedia_ratio,
      x_posicion, x_desde, medios_discover, medios_lista, titulares_seo, angulo, seccion_sugerida, motivo_afinidad, estado)
    values (instante, case when (datos->>'vivo')::boolean then regexp_replace(fila->>'entidad', '^\[SIN DISCOVER\]\s*', '', 'i') else fila->>'entidad' end, coalesce(fila->>'contexto', ''), 'media', false, null,
      (fila->>'wikipedia_visitas')::integer, (fila->>'wikipedia_ratio')::numeric,
      null, null, (datos->>'medios')::integer, array(select jsonb_array_elements_text(datos->'lista')), datos->'titulares', coalesce(fila->>'angulo', ''),
      coalesce(fila->>'seccion_sugerida', ''), coalesce(fila->>'motivo_afinidad', ''), 'pendiente')
    returning id, entidad, contexto into creada;
    creadas := creadas || jsonb_build_array(to_jsonb(creada));
  end loop;
  return jsonb_build_object('creadas', creadas, 'combinadas', combinadas, 'descartadas', descartadas,
    'total_hoy_antes', total_antes, 'total_hoy_despues', total_antes + jsonb_array_length(creadas), 'max_alertas_dia', maximo);
end;
$$;

-- 6) Permisos: solo la clave de servicio (las funciones del servidor) puede ejecutarlas.
revoke all on function public.datos_discover(text, timestamptz) from public, anon, authenticated;
revoke all on function public.cruzar_snoop(timestamptz) from public, anon, authenticated;
revoke all on function public.clave_entidad(text) from public, anon, authenticated;
revoke all on function public.parentesis_entidad(text) from public, anon, authenticated;
revoke all on function public.entidades_equivalentes(text, text) from public, anon, authenticated;
revoke all on function public.fusionar_alerta_reciente(jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.guardar_alertas_trends_atomicas(jsonb) from public, anon, authenticated;
revoke all on function public.guardar_alertas_wikipedia_atomicas(jsonb) from public, anon, authenticated;
grant execute on function public.datos_discover(text, timestamptz) to service_role;
grant execute on function public.cruzar_snoop(timestamptz) to service_role;
grant execute on function public.clave_entidad(text) to service_role;
grant execute on function public.parentesis_entidad(text) to service_role;
grant execute on function public.entidades_equivalentes(text, text) to service_role;
grant execute on function public.fusionar_alerta_reciente(jsonb, timestamptz) to service_role;
grant execute on function public.guardar_alertas_trends_atomicas(jsonb) to service_role;
grant execute on function public.guardar_alertas_wikipedia_atomicas(jsonb) to service_role;
