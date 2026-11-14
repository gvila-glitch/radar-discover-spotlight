CREATE TABLE public.wikipedia_picos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dia date NOT NULL,
  articulo text NOT NULL,
  visitas integer NOT NULL,
  media_previa numeric NOT NULL,
  ratio numeric NOT NULL,
  capturado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dia, articulo)
);
GRANT ALL ON public.wikipedia_picos TO service_role;
ALTER TABLE public.wikipedia_picos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas ADD COLUMN wikipedia_visitas integer, ADD COLUMN wikipedia_ratio numeric;
CREATE OR REPLACE FUNCTION public.limpiar_wikipedia_picos()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ DELETE FROM public.wikipedia_picos WHERE capturado_en < now() - interval '30 days'; $$;
REVOKE ALL ON FUNCTION public.limpiar_wikipedia_picos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limpiar_wikipedia_picos() TO service_role;

CREATE OR REPLACE FUNCTION public.adquirir_bloqueo_radar(trabajo text, propietario uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE llave text; instante timestamptz;
BEGIN
  IF trabajo NOT IN ('x-ingesta', 'trends-a-alertas', 'wikipedia-a-alertas') OR propietario IS NULL THEN RAISE EXCEPTION 'Trabajo no permitido'; END IF;
  llave := '__job_lock_' || trabajo;
  IF NOT pg_try_advisory_xact_lock(734211, CASE trabajo WHEN 'x-ingesta' THEN 1 WHEN 'trends-a-alertas' THEN 2 ELSE 3 END) THEN RETURN false; END IF;
  instante := clock_timestamp();
  INSERT INTO public.config AS c(clave, valor)
  VALUES (llave, jsonb_build_object('propietario', propietario, 'expira_en', instante + interval '5 minutes')::text)
  ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor
  WHERE CASE WHEN left(c.valor, 1) = '{'
    THEN (c.valor::jsonb->>'expira_en')::timestamptz <= instante
    ELSE true END;
  RETURN FOUND;
END; $$;
CREATE OR REPLACE FUNCTION public.liberar_bloqueo_radar(trabajo text, propietario uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF trabajo NOT IN ('x-ingesta', 'trends-a-alertas', 'wikipedia-a-alertas') OR propietario IS NULL THEN RAISE EXCEPTION 'Trabajo no permitido'; END IF;
  DELETE FROM public.config WHERE clave = '__job_lock_' || trabajo
    AND CASE WHEN left(valor, 1) = '{' THEN valor::jsonb->>'propietario' ELSE valor END = propietario::text;
  RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.adquirir_bloqueo_radar(text, uuid), public.liberar_bloqueo_radar(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adquirir_bloqueo_radar(text, uuid), public.liberar_bloqueo_radar(text, uuid) TO service_role;

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
      wikipedia_visitas, wikipedia_ratio,
      x_posicion, x_desde, medios_discover, medios_lista, titulares_seo, angulo, seccion_sugerida, motivo_afinidad, estado)
    values (instante, fila->>'entidad', coalesce(fila->>'contexto', ''), 'media', false, null,
      (fila->>'wikipedia_visitas')::integer, (fila->>'wikipedia_ratio')::numeric,
      null, null, 0, '{}'::text[], '[]'::jsonb, coalesce(fila->>'angulo', ''),
      coalesce(fila->>'seccion_sugerida', ''), coalesce(fila->>'motivo_afinidad', ''), 'pendiente')
    returning id, entidad, contexto into creada;
    creadas := creadas || jsonb_build_array(to_jsonb(creada));
  end loop;
  return jsonb_build_object('creadas', creadas, 'descartadas', descartadas,
    'total_hoy_antes', total_antes, 'total_hoy_despues', total_antes + jsonb_array_length(creadas), 'max_alertas_dia', maximo);
end;
$$;
revoke all on function public.guardar_alertas_wikipedia_atomicas(jsonb) from public, anon, authenticated;
grant execute on function public.guardar_alertas_wikipedia_atomicas(jsonb) to service_role;