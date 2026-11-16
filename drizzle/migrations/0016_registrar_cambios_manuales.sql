-- ESTADO: aplicado A MANO en el editor de SQL de Lovable el 15 nov 2026 (comprobado: clave 'marina valverde', UTF8).
-- PENDIENTE: registrarlo como migración (pedírselo a Lovable en el próximo cambio de base de datos). Es idempotente
-- (create or replace), así que volver a aplicarlo no cambia nada.
-- Se carga después de drizzle/migrations/0015_fusion_alertas_fuentes.sql en src/lib/fusionAlertas.integration.test.ts.
-- v2: corrige que "Juan Valverde" se combinara con "Juan Carlos Valverde" y "Marina Valverde (política)" con "(cantante)",
-- y hace el paso a minúsculas independiente de la codificación. Solo cambian estas cuatro funciones (la última, para no combinar homónimas ambiguas).

-- 1) Clave de un nombre: sin prefijo [SIN DISCOVER]/[PRUEBA], sin paréntesis "(cantante)", sin tildes ni mayúsculas.
--    Las mayúsculas A-Z se pasan a minúsculas en un paso aparte, solo con caracteres ASCII, para que no dependa de
--    cómo cuente la base de datos los caracteres con tilde.
create or replace function public.clave_entidad(texto text)
returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(regexp_replace(
    translate(
      translate(
        regexp_replace(regexp_replace(coalesce(texto, ''), '^\[(PRUEBA|SIN DISCOVER)\]\s*', '', 'i'), '\s*\([^)]*\)', '', 'g'),
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'),
      'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝàáâãäåçèéêëìíîïðñòóôõöøùúûüýÿĀāĂăĄąĆćĈĉĊċČčĎďĐđĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĨĩĪīĬĭĮįİıĴĵĶķĹĺĻļĽľŁłŃńŅņŇňŌōŎŏŐőŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽž', 'aaaaaaceeeeiiiidnoooooouuuuyaaaaaaceeeeiiiidnoooooouuuuyyaaaaaaccccccccddddeeeeeeeeeegggggggghhiiiiiiiiiijjkkllllllllnnnnnnoooooorrrrrrssssssssttttuuuuuuuuuuuuwwyyyzzzzzz'),
    '[^a-z0-9#]+', ' ', 'g'), '\s+', ' ', 'g'));
$$;

-- 1b) Lo que dicen los paréntesis de un nombre ("cantante", "política"...), normalizado. Vacío si no tiene.
create or replace function public.parentesis_entidad(texto text)
returns text language sql immutable set search_path = '' as $$
  select coalesce(string_agg(public.clave_entidad(m[1]), ' ' order by ord), '')
  from regexp_matches(coalesce(texto, ''), '\(([^)]*)\)', 'g') with ordinality as t(m, ord);
$$;

-- 2) ¿Dos nombres son la misma cosa?
--    - Si los dos llevan paréntesis y dicen cosas distintas ("Marina Valverde (política)" y "(cantante)"): no.
--    - Iguales, o con las mismas palabras (sin artículos ni orden): sí.
--    - Si el corto es UNA palabra, debe ser la última del largo (el apellido: "abascal" en "santiago abascal",
--      pero no "pedro" en "pedro sanchez") y tener al menos 5 letras.
--    - Si el corto tiene varias palabras, deben aparecer SEGUIDAS y en orden en el largo ("isabel diaz" en
--      "isabel diaz ayuso", pero no "juan valverde" en "juan carlos valverde").
create or replace function public.entidades_equivalentes(a text, b text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  ka text := public.clave_entidad(a);
  kb text := public.clave_entidad(b);
  pa text := public.parentesis_entidad(a);
  pb text := public.parentesis_entidad(b);
  vacias constant text[] := array['de','del','la','el','los','las','y','e','en','con','por','para','al'];
  oa text[];
  ob text[];
  ta text[];
  tb text[];
  corto_ord text[];
  largo_ord text[];
  cantidad_corto integer;
  cantidad_largo integer;
  i integer;
begin
  if ka = '' or kb = '' then return false; end if;
  if pa <> '' and pb <> '' and pa <> pb then return false; end if;
  if ka = kb then return true; end if;
  select coalesce(array_agg(t order by pos), '{}'::text[]) into oa
    from unnest(string_to_array(ka, ' ')) with ordinality as u(t, pos) where length(t) >= 3 and t <> all (vacias);
  select coalesce(array_agg(t order by pos), '{}'::text[]) into ob
    from unnest(string_to_array(kb, ' ')) with ordinality as u(t, pos) where length(t) >= 3 and t <> all (vacias);
  select coalesce(array_agg(distinct x), '{}'::text[]) into ta from unnest(oa) as x;
  select coalesce(array_agg(distinct x), '{}'::text[]) into tb from unnest(ob) as x;
  if cardinality(ta) = 0 or cardinality(tb) = 0 then return false; end if;
  if ta @> tb and tb @> ta then return true; end if;
  if cardinality(ta) <= cardinality(tb) then
    corto_ord := oa; largo_ord := ob;
  else
    corto_ord := ob; largo_ord := oa;
  end if;
  cantidad_corto := cardinality(corto_ord);
  cantidad_largo := cardinality(largo_ord);
  if length(array_to_string(corto_ord, '')) < 5 then return false; end if;
  if cantidad_corto = 1 then
    return corto_ord[1] = largo_ord[cantidad_largo];
  end if;
  for i in 1 .. (cantidad_largo - cantidad_corto + 1) loop
    if largo_ord[i : i + cantidad_corto - 1] = corto_ord then return true; end if;
  end loop;
  return false;
end;
$$;

-- 3) Busca una alerta de las últimas 24 h sobre lo mismo y, si la candidata aporta algo nuevo, se lo añade.
--    Devuelve null si no hay coincidencia clara (si hay varias parecidas y ninguna idéntica, es ambigua:
--    no se combina). Devuelve {"resultado":"combinada",...} o {"resultado":"ya_avisada",...}.
create or replace function public.fusionar_alerta_reciente(fila jsonb, instante timestamptz)
returns jsonb language plpgsql set search_path = '' as $$
declare
  nombre text := coalesce(fila->>'entidad', '');
  clave text := public.clave_entidad(coalesce(fila->>'entidad', ''));
  ids bigint[];
  exactas bigint[];
  destino bigint;
  actual public.alertas%rowtype;
  x_pos integer;
  x_des timestamptz;
  trends_vol text;
  w_vis integer;
  w_rat numeric;
  aporta_x boolean := false;
  aporta_trends boolean := false;
  aporta_wiki boolean := false;
  fuentes text[] := '{}'::text[];
begin
  if clave = '' then return null; end if;
  select array_agg(a.id order by a.id) into ids from public.alertas a
    where a.creada_en >= instante - interval '24 hours' and public.entidades_equivalentes(a.entidad, nombre);
  if ids is null then return null; end if;
  -- «Idénticas»: mismo nombre y también los mismos paréntesis. Con dos homónimas ("(política)" y "(cantante)") y una
  -- candidata sin paréntesis no hay ninguna idéntica: es ambiguo y no se combina.
  select array_agg(a.id order by a.id) into exactas from public.alertas a
    where a.id = any (ids) and public.clave_entidad(a.entidad) = clave
      and public.parentesis_entidad(a.entidad) = public.parentesis_entidad(nombre);
  if exactas is not null then
    destino := exactas[cardinality(exactas)];
  elsif cardinality(ids) = 1 then
    destino := ids[1];
  else
    return null;
  end if;
  select * into actual from public.alertas where id = destino for update;

  if (fila->>'x_posicion') ~ '^[0-9]{1,3}$' then x_pos := (fila->>'x_posicion')::integer; end if;
  if (fila->>'x_desde') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}:?[0-9]{2})$' then
    begin
      x_des := (fila->>'x_desde')::timestamptz;
    exception when others then
      x_des := null;
    end;
  end if;
  if x_pos is not null and actual.x_posicion is null then
    aporta_x := true;
    fuentes := array_append(fuentes, 'X (puesto ' || x_pos::text || ')');
  end if;

  trends_vol := nullif(trim(coalesce(fila->>'trends_crecimiento', '')), '');
  if trends_vol is not null and coalesce(fila->>'trends_activo', 'true') <> 'false'
     and (not actual.trends_activo or actual.trends_crecimiento is null) then
    aporta_trends := true;
    fuentes := array_append(fuentes, 'Google Trends (' || trends_vol || ')');
  end if;

  if (fila->>'wikipedia_visitas') ~ '^[0-9]{1,9}$' then w_vis := (fila->>'wikipedia_visitas')::integer; end if;
  if (fila->>'wikipedia_ratio') ~ '^[0-9]{1,6}(\.[0-9]+)?$' then w_rat := (fila->>'wikipedia_ratio')::numeric; end if;
  if w_rat is not null and actual.wikipedia_ratio is null then
    aporta_wiki := true;
    fuentes := array_append(fuentes, 'Wikipedia (×' || w_rat::text || ')');
  end if;

  if not (aporta_x or aporta_trends or aporta_wiki) then
    return jsonb_build_object('resultado', 'ya_avisada', 'id', destino);
  end if;

  update public.alertas a set
    x_posicion = case when aporta_x then x_pos else a.x_posicion end,
    x_desde = case when aporta_x then x_des else a.x_desde end,
    trends_activo = case when aporta_trends then true else a.trends_activo end,
    trends_crecimiento = case when aporta_trends then trends_vol else a.trends_crecimiento end,
    wikipedia_visitas = case when aporta_wiki then coalesce(w_vis, a.wikipedia_visitas) else a.wikipedia_visitas end,
    wikipedia_ratio = case when aporta_wiki then w_rat else a.wikipedia_ratio end,
    contexto = a.contexto || ' · También en ' || array_to_string(fuentes, ', '),
    seccion_sugerida = case
      when coalesce(trim(a.seccion_sugerida), '') in ('', 'Sin sugerir')
       and coalesce(trim(fila->>'seccion_sugerida'), '') not in ('', 'Sin sugerir')
      then fila->>'seccion_sugerida' else a.seccion_sugerida end,
    motivo_afinidad = case
      when a.motivo_afinidad like 'Sin %' and coalesce(fila->>'motivo_afinidad', '') like 'Encaja%'
      then fila->>'motivo_afinidad' else a.motivo_afinidad end
  where a.id = destino;
  return jsonb_build_object('resultado', 'combinada', 'id', destino, 'fuentes', to_jsonb(fuentes));
end;
$$;

revoke all on function public.clave_entidad(text) from public, anon, authenticated;
revoke all on function public.parentesis_entidad(text) from public, anon, authenticated;
revoke all on function public.entidades_equivalentes(text, text) from public, anon, authenticated;
revoke all on function public.fusionar_alerta_reciente(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.clave_entidad(text) to service_role;
grant execute on function public.parentesis_entidad(text) to service_role;
grant execute on function public.entidades_equivalentes(text, text) to service_role;
grant execute on function public.fusionar_alerta_reciente(jsonb, timestamptz) to service_role;
-- ESTADO: PENDIENTE de aplicar a mano en el editor de SQL de Lovable (después de subir el código que acepta el motivo 'ya_en_discover').
-- Después, registrarlo como migración en el próximo mensaje de base de datos a Lovable. Es idempotente (create or replace).
-- Orden de aplicación: migración 0015 → supabase/fusion-reglas-v2.sql → este archivo → supabase/cruce-snoop-tareas.sql (una sola vez).

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
--     y 0-2 medios. Si Snoop no está vivo no toca nada. Pensada para ejecutarse cada 15 minutos .
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
-- ESTADO: PENDIENTE de aplicar a mano en el editor de SQL (después de supabase/cruce-snoop-v3.sql) y de registrar como migración.
-- Idempotente (create or replace).

-- v4: el cruce periódico cuenta los artículos desde 3 h antes de crear cada alerta, para que no se pierda nada
-- aunque se ejecute pocas veces al día. Se aplica DESPUÉS de la v3.

-- 3b) CRUCE CON SNOOP. Snoop envía los artículos que están entrando en Discover (tabla snoop_articulos).
--     datos_discover(): para un tema, cuántos medios distintos lo han publicado en las últimas 3 horas, cuáles y con
--     qué titulares. "Snoop vivo" = ha llegado algún artículo en las últimas 2 horas; si no, no sabemos nada y no se toca.
--     Un titular habla del tema si contiene su nombre completo, o su apellido (solo si el tema tiene varias palabras,
--     el apellido tiene 5 o más letras y no es uno muy común).
create or replace function public.datos_discover_desde(nombre text, desde timestamptz, instante timestamptz)
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
    where s.recibido_en >= desde and s.recibido_en <= instante
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

--     datos_discover(): la llegada al crear una alerta, con los artículos de las últimas 3 horas.
create or replace function public.datos_discover(nombre text, instante timestamptz)
returns jsonb language sql stable set search_path = '' as $$
  select public.datos_discover_desde(nombre, instante - interval '3 hours', instante);
$$;

--     cruzar_snoop(): revisa las alertas de las últimas 24 h y les añade lo que Snoop haya enviado desde entonces
--     (nunca baja el número de medios), les quita la etiqueta [SIN DISCOVER] y sube a prioridad alta las que tienen señal en X
--     y 0-2 medios. Si Snoop no está vivo no toca nada. Se ejecuta con el programador de tareas unas pocas veces al día.
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
    select id, entidad, creada_en, medios_discover, medios_lista, titulares_seo, x_posicion, prioridad
    from public.alertas where creada_en >= instante - interval '24 hours' order by id
  loop
    revisadas := revisadas + 1;
    -- Desde 3 h antes de crear la alerta hasta ahora: así no se pierde nada aunque se ejecute pocas veces al día.
    d := public.datos_discover_desde(a.entidad, a.creada_en - interval '3 hours', instante);
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

revoke all on function public.datos_discover_desde(text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.datos_discover(text, timestamptz) from public, anon, authenticated;
revoke all on function public.cruzar_snoop(timestamptz) from public, anon, authenticated;
grant execute on function public.datos_discover_desde(text, timestamptz, timestamptz) to service_role;
grant execute on function public.datos_discover(text, timestamptz) to service_role;
grant execute on function public.cruzar_snoop(timestamptz) to service_role;
-- NOTA DE REGISTRO: los tres archivos de tareas programadas de supabase/ ya estan aplicados en la
-- base de datos y quedan documentados en el repo; no forman parte de esta migracion porque el
-- sistema de migraciones no puede gestionar tareas programadas. No se modifica ninguna tarea.
-- ESTADO: APLICADO a mano en el editor de SQL (v1 y v2, 16 nov 2026); PENDIENTE de registrar como migración. Idempotente.
--
-- PRIORIDAD POR PUNTOS. Sustituye la regla anterior («alta solo si X y 0–2 medios en Discover») por una puntuación.
-- v2 (16 nov 2026): entiende la opinión de la IA (Encaja (IA, alto) +3; Encaja (IA, medio) +1). Se aplica entero otra vez.
-- La misma fórmula está en src/lib/prioridad.ts (para enseñar el desglose en el panel); si se cambia, en los dos.
--   X: puesto 1–5 +3, 6–15 +2, 16 o más +1; +1 si entró en X como mucho 90 min antes de crearse la alerta.
--   Google Trends: 20.000+ +3, 5.000+ +2, 1.000+ +1.        Wikipedia: ×10 +3, ×5 +2, ×3 +1.
--   Varias fuentes a la vez: dos +1, tres +2.
--   Discover (si hay datos): 0–2 medios +1; 3 o más −2.
--   Encaja con la línea editorial (regla de «sí» o IA «alto») +3; IA «medio» +1; hashtag que no encaja −1.
--   ALTA: 5 puntos o más Y (encaja con la línea editorial O viene de 2 fuentes o más) Y no hay ya 3 o más medios en
--   Discover (alta = «aún llegamos a tiempo»). Si no, media.
-- Un disparador la recalcula al crear la alerta y cada vez que cambian sus datos (al combinar fuentes, en el cruce
-- con Snoop…), así no hay que tocar las funciones que crean o actualizan alertas: lo que pongan en «prioridad» se
-- sustituye por el resultado de la fórmula. Las valoraciones (estado, enlace) no lo activan.

-- Volumen de Trends («2.000+», «20K+», «1,5M+») como número; 0 si no se entiende. Igual que volumenNumerico().
create or replace function public.volumen_numerico(valor text)
returns numeric language sql immutable set search_path = '' as $$
  select coalesce(case
    when m is null then 0
    when m[2] <> '' and m[1] ~ '^[0-9]+([.,][0-9]+)?$' then
      replace(m[1], ',', '.')::numeric * case upper(m[2]) when 'K' then 1000 when 'M' then 1000000 else 1000000000 end
    when m[2] = '' then nullif(regexp_replace(m[1], '[.,]', '', 'g'), '')::numeric
    else 0 end, 0)
  from (select pg_catalog.regexp_match(coalesce(valor, ''), '^\s*([0-9.,]+)\s*([KMBkmb]?)\s*\+?\s*$') as m) s;
$$;

create or replace function public.puntuar_alerta(
  entidad text, creada_en timestamptz, x_posicion integer, x_desde timestamptz, trends_activo boolean,
  trends_crecimiento text, wikipedia_ratio numeric, medios_discover integer, motivo_afinidad text,
  out puntos integer, out prioridad text)
language plpgsql stable set search_path = '' as $$
declare
  volumen numeric;
  fuentes integer;
  afin boolean;
  medio boolean;
begin
  puntos := 0;
  if x_posicion is not null then
    puntos := puntos + case when x_posicion <= 5 then 3 when x_posicion <= 15 then 2 else 1 end;
    if x_desde is not null and creada_en is not null and x_desde >= creada_en - interval '90 minutes' then
      puntos := puntos + 1;
    end if;
  end if;
  volumen := case when coalesce(trends_activo, false) then public.volumen_numerico(trends_crecimiento) else 0 end;
  puntos := puntos + case when volumen >= 20000 then 3 when volumen >= 5000 then 2 when volumen >= 1000 then 1 else 0 end;
  puntos := puntos + case when wikipedia_ratio >= 10 then 3 when wikipedia_ratio >= 5 then 2
                          when wikipedia_ratio >= 3 then 1 else 0 end;
  fuentes := (x_posicion is not null)::integer + coalesce(trends_activo, false)::integer
             + (wikipedia_ratio is not null)::integer;
  if fuentes >= 2 then puntos := puntos + fuentes - 1; end if;
  if coalesce(entidad, '') !~* '^\[SIN DISCOVER\]' then
    puntos := puntos + case when coalesce(medios_discover, 0) <= 2 then 1 else -2 end;
  end if;
  afin := coalesce(motivo_afinidad, '') like 'Encaja por reglas%' or coalesce(motivo_afinidad, '') like 'Encaja (IA, alto)%';
  medio := not afin and coalesce(motivo_afinidad, '') like 'Encaja (IA, medio)%';
  if afin then
    puntos := puntos + 3;
  elsif medio then
    puntos := puntos + 1;
  elsif btrim(regexp_replace(coalesce(entidad, ''), '^\[(PRUEBA|SIN DISCOVER)\]\s*', '', 'i')) like '#%' then
    puntos := puntos - 1;
  end if;
  prioridad := case when puntos >= 5 and (afin or fuentes >= 2)
                          and (coalesce(entidad, '') ~* '^\[SIN DISCOVER\]' or coalesce(medios_discover, 0) <= 2)
                    then 'alta' else 'media' end;
end;
$$;

create or replace function public.alertas_prioridad_por_puntos()
returns trigger language plpgsql set search_path = '' as $$
begin
  select p.prioridad into new.prioridad
  from public.puntuar_alerta(new.entidad, new.creada_en, new.x_posicion, new.x_desde, new.trends_activo,
                              new.trends_crecimiento, new.wikipedia_ratio, new.medios_discover,
                             new.motivo_afinidad) p;
  return new;
end;
$$;

revoke all on function public.volumen_numerico(text) from public, anon;
revoke all on function public.puntuar_alerta(text, timestamptz, integer, timestamptz, boolean, text, numeric, integer, text)
  from public, anon;
revoke all on function public.alertas_prioridad_por_puntos() from public, anon, authenticated;
grant execute on function public.volumen_numerico(text) to authenticated, service_role;
grant execute on function public.puntuar_alerta(text, timestamptz, integer, timestamptz, boolean, text, numeric, integer, text)
  to authenticated, service_role;

drop trigger if exists alertas_prioridad_por_puntos on public.alertas;
create trigger alertas_prioridad_por_puntos
  before insert or update of entidad, creada_en, x_posicion, x_desde, trends_activo, trends_crecimiento,
    wikipedia_ratio, medios_discover, motivo_afinidad, prioridad
  on public.alertas
  for each row execute function public.alertas_prioridad_por_puntos();

-- Recalcula las alertas que ya existen (el disparador se activa al tocar «prioridad»).
update public.alertas set prioridad = prioridad;
-- ESTADO: APLICADO a mano en el editor de SQL (16 nov 2026); PENDIENTE de registrar como migración. Se puede ejecutar más de una vez.
--
-- DESCARTES DE LA IA: temas que la IA dejó fuera (fuera de línea o noticia de agencia), para revisarlos en el panel
-- (Alertas → «Descartadas por la IA»). Un tema por día: si vuelve a salir, se actualiza la misma fila.
-- Seguridad: RLS activado y sin políticas, y sin permisos para anon ni authenticated: el navegador no puede leer ni
-- escribir. Solo lo hacen las funciones del servidor (clave de servicio), que antes comprueban que quien pregunta es del
-- equipo (y, para añadir excepciones, que es administrador). Lo que tenga más de 30 días lo borra la propia tarea.

create table if not exists public.descartes_ia (
  id bigint generated always as identity primary key,
  dia date not null,                       -- día en Madrid
  clave text not null,                     -- nombre normalizado (para no repetir el tema en el mismo día)
  tema text not null,
  fuente text not null check (fuente in ('x_trends', 'wikipedia')),
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  puntos integer not null default 0,       -- fuerza de la señal, sin contar la línea editorial ni Discover
  fuerte boolean not null default false,   -- lo que se enseña por defecto
  x_posicion integer,
  x_desde timestamptz,
  trends_crecimiento text,
  wikipedia_visitas integer,
  wikipedia_ratio numeric,
  contexto text not null default '',
  motivo_ia text not null default '',
  seccion_ia text not null default '',
  agencia boolean not null default false,
  modelo text not null default '',
  -- Revisión: «Debería haber pasado» (cualquiera del equipo).
  veredicto text check (veredicto is null or veredicto = 'deberia_pasar'),
  veredicto_por text,
  veredicto_en timestamptz,
  nota text check (nota is null or length(nota) <= 500),
  -- Excepción añadida a partir de este descarte (solo administradores).
  excepcion text check (excepcion is null or length(excepcion) <= 500),
  excepcion_tipo text check (excepcion_tipo is null or excepcion_tipo in ('criterio', 'nombre')),
  excepcion_por text,
  excepcion_en timestamptz,
  unique (dia, clave)
);

create index if not exists descartes_ia_dia_puntos on public.descartes_ia (dia desc, puntos desc);

alter table public.descartes_ia enable row level security;
revoke all on public.descartes_ia from public, anon, authenticated;
grant all on public.descartes_ia to service_role;
grant usage, select on sequence public.descartes_ia_id_seq to service_role;

-- Comprobación: debe salir rls_activo = true y filas = 0 la primera vez.
-- select (select relrowsecurity from pg_class where oid = 'public.descartes_ia'::regclass) as rls_activo,
--        (select count(*) from public.descartes_ia) as filas;
