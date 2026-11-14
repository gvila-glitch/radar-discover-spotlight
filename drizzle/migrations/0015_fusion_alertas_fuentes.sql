-- Combinar alertas de distintas fuentes (X, Google Trends, Wikipedia) cuando hablan de lo mismo.
--
-- Hasta ahora cada fuente decidía si una alerta "ya existía" comparando el nombre exacto, y si existía la descartaba
-- (perdiendo sus datos). Con este cambio, cuando llega una señal sobre algo que ya tiene alerta de las últimas
-- 24 horas, se RELLENAN los huecos de esa alerta (puesto en X, volumen en Google, visitas de Wikipedia) en lugar
-- de crear otra. Todo ocurre dentro de la misma transacción y con el mismo bloqueo que ya compartían las fuentes.

-- 1) Clave de un nombre: sin prefijo [SIN DISCOVER]/[PRUEBA], sin paréntesis "(cantante)", sin tildes ni mayúsculas.
create or replace function public.clave_entidad(texto text)
returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(regexp_replace(
    translate(
      regexp_replace(regexp_replace(coalesce(texto, ''), '^\[(PRUEBA|SIN DISCOVER)\]\s*', '', 'i'), '\s*\([^)]*\)', '', 'g'),
      'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝàáâãäåçèéêëìíîïðñòóôõöøùúûüýÿĀāĂăĄąĆćĈĉĊċČčĎďĐđĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĨĩĪīĬĭĮįİıĴĵĶķĹĺĻļĽľŁłŃńŅņŇňŌōŎŏŐőŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžABCDEFGHIJKLMNOPQRSTUVWXYZ', 'aaaaaaceeeeiiiidnoooooouuuuyaaaaaaceeeeiiiidnoooooouuuuyyaaaaaaccccccccddddeeeeeeeeeegggggggghhiiiiiiiiiijjkkllllllllnnnnnnoooooorrrrrrssssssssttttuuuuuuuuuuuuwwyyyzzzzzzabcdefghijklmnopqrstuvwxyz'),
    '[^a-z0-9#]+', ' ', 'g'), '\s+', ' ', 'g'));
$$;

-- 2) ¿Dos nombres son la misma cosa? Iguales, mismas palabras (sin artículos ni orden), o uno contenido en el otro:
--    - si el corto es UNA palabra, debe ser la última del largo (el apellido: "abascal" en "santiago abascal",
--      pero no "pedro" en "pedro sanchez") y tener al menos 5 letras;
--    - si el corto tiene varias palabras, todas deben estar en el largo.
create or replace function public.entidades_equivalentes(a text, b text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  ka text := public.clave_entidad(a);
  kb text := public.clave_entidad(b);
  vacias constant text[] := array['de','del','la','el','los','las','y','e','en','con','por','para','al'];
  oa text[];
  ob text[];
  ta text[];
  tb text[];
  corto text[];
  largo_ordenado text[];
  largo text[];
begin
  if ka = '' or kb = '' then return false; end if;
  if ka = kb then return true; end if;
  select coalesce(array_agg(t order by n), '{}'::text[]) into oa
    from unnest(string_to_array(ka, ' ')) with ordinality as u(t, n) where length(t) >= 3 and t <> all (vacias);
  select coalesce(array_agg(t order by n), '{}'::text[]) into ob
    from unnest(string_to_array(kb, ' ')) with ordinality as u(t, n) where length(t) >= 3 and t <> all (vacias);
  select coalesce(array_agg(distinct x), '{}'::text[]) into ta from unnest(oa) as x;
  select coalesce(array_agg(distinct x), '{}'::text[]) into tb from unnest(ob) as x;
  if cardinality(ta) = 0 or cardinality(tb) = 0 then return false; end if;
  if ta @> tb and tb @> ta then return true; end if;
  if cardinality(ta) <= cardinality(tb) then
    corto := ta; largo := tb; largo_ordenado := ob;
  else
    corto := tb; largo := ta; largo_ordenado := oa;
  end if;
  if cardinality(corto) = 1 then
    return length(corto[1]) >= 5 and corto[1] = largo_ordenado[cardinality(largo_ordenado)];
  end if;
  return length(array_to_string(corto, '')) >= 5 and corto <@ largo;
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
  select array_agg(a.id order by a.id) into exactas from public.alertas a
    where a.id = any (ids) and public.clave_entidad(a.entidad) = clave;
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
      elsif not (case when inicio <= fin then hora >= inicio and hora < fin else hora >= inicio or hora < fin end) then
        motivo := 'fuera_de_horario';
      elsif total_antes + jsonb_array_length(creadas) >= maximo then
        motivo := 'tope_diario';
      elsif jsonb_array_length(creadas) >= 3 then
        motivo := 'limite_ejecucion';
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
    values (instante, fila->>'entidad', coalesce(fila->>'contexto', ''), 'media',
      case when fila->>'trends_activo' = 'false' then false else true end,
      fila->>'trends_crecimiento',
      case when fila->>'x_posicion' ~ '^[0-9]{1,3}$' then (fila->>'x_posicion')::int else null end,
      valor_x_desde,
      0, '{}'::text[], '[]'::jsonb, coalesce(fila->>'angulo', ''),
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
      elsif not (case when inicio <= fin then hora >= inicio and hora < fin else hora >= inicio or hora < fin end) then
        motivo := 'fuera_de_horario';
      elsif total_antes + jsonb_array_length(creadas) >= maximo then
        motivo := 'tope_diario';
      elsif jsonb_array_length(creadas) >= 3 then
        motivo := 'limite_ejecucion';
      end if;
    end if;
    if motivo is not null then
      descartadas := descartadas || jsonb_build_array(jsonb_build_object('termino', nombre, 'motivo', motivo));
      continue;
    end if;
    insert into public.alertas (creada_en, entidad, contexto, prioridad, trends_activo, trends_crecimiento,
      wikipedia_visitas, wikipedia_ratio,
      x_posicion, x_desde, medios_discover, medios_lista, titulares_seo, angulo, seccion_sugerida, motivo_afinidad, estado)
    values (instante, fila->>'entidad', coalesce(fila->>'contexto', ''), 'media', false, null,
      (fila->>'wikipedia_visitas')::integer, (fila->>'wikipedia_ratio')::numeric,
      null, null, 0, '{}'::text[], '[]'::jsonb, coalesce(fila->>'angulo', ''),
      coalesce(fila->>'seccion_sugerida', ''), coalesce(fila->>'motivo_afinidad', ''), 'pendiente')
    returning id, entidad, contexto into creada;
    creadas := creadas || jsonb_build_array(to_jsonb(creada));
  end loop;
  return jsonb_build_object('creadas', creadas, 'combinadas', combinadas, 'descartadas', descartadas,
    'total_hoy_antes', total_antes, 'total_hoy_despues', total_antes + jsonb_array_length(creadas), 'max_alertas_dia', maximo);
end;
$$;

-- 6) Permisos: solo la clave de servicio (las funciones del servidor) puede ejecutarlas.
revoke all on function public.clave_entidad(text) from public, anon, authenticated;
revoke all on function public.entidades_equivalentes(text, text) from public, anon, authenticated;
revoke all on function public.fusionar_alerta_reciente(jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.guardar_alertas_trends_atomicas(jsonb) from public, anon, authenticated;
revoke all on function public.guardar_alertas_wikipedia_atomicas(jsonb) from public, anon, authenticated;
grant execute on function public.clave_entidad(text) to service_role;
grant execute on function public.entidades_equivalentes(text, text) to service_role;
grant execute on function public.fusionar_alerta_reciente(jsonb, timestamptz) to service_role;
grant execute on function public.guardar_alertas_trends_atomicas(jsonb) to service_role;
grant execute on function public.guardar_alertas_wikipedia_atomicas(jsonb) to service_role;