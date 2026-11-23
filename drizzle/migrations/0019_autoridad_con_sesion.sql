GRANT SELECT (id, url, clics, desde, hasta) ON public.autoridad_discover TO authenticated;
ALTER TABLE public.autoridad_discover ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "equipo lee autoridad" ON public.autoridad_discover;
CREATE POLICY "equipo lee autoridad" ON public.autoridad_discover
  FOR SELECT TO authenticated USING (public.es_equipo());