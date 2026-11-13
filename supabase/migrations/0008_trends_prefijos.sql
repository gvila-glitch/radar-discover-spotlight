create or replace function public.guardar_alertas_trends_atomicas(candidatas jsonb)
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
  normalizada text;
  motivo text;
  creada record;
  creadas jsonb := '[]'::jsonb;
  descartadas jsonb := '[]'::jsonb;
begin
  if candidatas is null or jsonb_typeof(candidatas) <> 'array' then
    raise exception 'Las candidatas deben ser una lista';
  end if;
  if jsonb_array_length(candidatas) > 3 then
    raise exception 'Máximo tres candidatas por ejecución';
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
    normalizada := lower(trim(regexp_replace(coalesce(fila->>'entidad', ''), '^\[(PRUEBA|SIN DISCOVER)\]\s*', '', 'i')));
    motivo := null;
    if normalizada = '' then
      motivo := 'sin_termino';
    elsif exists (select 1 from public.alertas a
      where a.creada_en >= instante - interval '24 hours'
      and lower(trim(regexp_replace(a.entidad, '^\[(PRUEBA|SIN DISCOVER)\]\s*', '', 'i'))) = normalizada) then
      motivo := 'ya_avisada';
    elsif not (case when inicio <= fin then hora >= inicio and hora < fin else hora >= inicio or hora < fin end) then
      motivo := 'fuera_de_horario';
    elsif total_antes + jsonb_array_length(creadas) >= maximo then
      motivo := 'tope_diario';
    end if;
    if motivo is not null then
      descartadas := descartadas || jsonb_build_array(jsonb_build_object(
        'termino', trim(regexp_replace(coalesce(fila->>'entidad', ''), '^\[(PRUEBA|SIN DISCOVER)\]\s*', '', 'i')), 'motivo', motivo));
      continue;
    end if;
    insert into public.alertas (creada_en, entidad, contexto, prioridad, trends_activo, trends_crecimiento,
      x_posicion, x_desde, medios_discover, medios_lista, titulares_seo, angulo, seccion_sugerida, motivo_afinidad, estado)
    values (instante, fila->>'entidad', coalesce(fila->>'contexto', ''), 'media', true, fila->>'trends_crecimiento',
      null, null, 0, '{}'::text[], '[]'::jsonb, coalesce(fila->>'angulo', ''),
      coalesce(fila->>'seccion_sugerida', ''), coalesce(fila->>'motivo_afinidad', ''), 'pendiente')
    returning id, entidad, contexto into creada;
    creadas := creadas || jsonb_build_array(to_jsonb(creada));
  end loop;
  return jsonb_build_object('creadas', creadas, 'descartadas', descartadas,
    'total_hoy_antes', total_antes, 'total_hoy_despues', total_antes + jsonb_array_length(creadas), 'max_alertas_dia', maximo);
end;
$$;
revoke all on function public.guardar_alertas_trends_atomicas(jsonb) from public, anon, authenticated;
grant execute on function public.guardar_alertas_trends_atomicas(jsonb) to service_role;