CREATE OR REPLACE FUNCTION public.adquirir_bloqueo_radar(trabajo text, propietario uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE llave text;
BEGIN
  IF trabajo NOT IN ('x-ingesta', 'trends-a-alertas') OR propietario IS NULL THEN RAISE EXCEPTION 'Trabajo no permitido'; END IF;
  llave := '__job_lock_' || trabajo;
  IF NOT pg_try_advisory_xact_lock(734211, CASE WHEN trabajo = 'x-ingesta' THEN 1 ELSE 2 END) THEN RETURN false; END IF;
  INSERT INTO public.config(clave, valor) VALUES (llave, propietario::text) ON CONFLICT (clave) DO NOTHING;
  RETURN FOUND;
END; $$;
CREATE OR REPLACE FUNCTION public.liberar_bloqueo_radar(trabajo text, propietario uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF trabajo NOT IN ('x-ingesta', 'trends-a-alertas') OR propietario IS NULL THEN RAISE EXCEPTION 'Trabajo no permitido'; END IF;
  DELETE FROM public.config WHERE clave = '__job_lock_' || trabajo AND valor = propietario::text;
  RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.adquirir_bloqueo_radar(text, uuid), public.liberar_bloqueo_radar(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adquirir_bloqueo_radar(text, uuid), public.liberar_bloqueo_radar(text, uuid) TO service_role;
COMMENT ON FUNCTION public.adquirir_bloqueo_radar(text, uuid) IS 'Durable non-waiting execution lock in reserved config rows. No expiry: crashed executions require verified manual recovery, never unsafe automatic takeover.';