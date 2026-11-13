-- Portable SQL copy; schema applied through managed migration tool.
CREATE OR REPLACE FUNCTION public.limpiar_x_tendencias()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ DELETE FROM public.x_tendencias WHERE capturado_en < now() - interval '30 days'; $$;
REVOKE ALL ON FUNCTION public.limpiar_x_tendencias() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limpiar_x_tendencias() TO service_role;