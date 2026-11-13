-- Five-minute leases; expiry is evaluated by PostgreSQL, not worker clocks.
CREATE OR REPLACE FUNCTION public.adquirir_bloqueo_radar(trabajo text, propietario uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE llave text; instante timestamptz;
BEGIN
  IF trabajo NOT IN ('x-ingesta', 'trends-a-alertas') OR propietario IS NULL THEN RAISE EXCEPTION 'Trabajo no permitido'; END IF;
  llave := '__job_lock_' || trabajo;
  IF NOT pg_try_advisory_xact_lock(734211, CASE WHEN trabajo = 'x-ingesta' THEN 1 ELSE 2 END) THEN RETURN false; END IF;
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
  IF trabajo NOT IN ('x-ingesta', 'trends-a-alertas') OR propietario IS NULL THEN RAISE EXCEPTION 'Trabajo no permitido'; END IF;
  DELETE FROM public.config WHERE clave = '__job_lock_' || trabajo
    AND CASE WHEN left(valor, 1) = '{' THEN valor::jsonb->>'propietario' ELSE valor END = propietario::text;
  RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.adquirir_bloqueo_radar(text, uuid), public.liberar_bloqueo_radar(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adquirir_bloqueo_radar(text, uuid), public.liberar_bloqueo_radar(text, uuid) TO service_role;
COMMENT ON FUNCTION public.adquirir_bloqueo_radar(text, uuid) IS 'Non-waiting five-minute lease. An expired lease cannot block a new execution; atomic takeover uses database time. Owner-checked release cannot remove a replacement lease.';