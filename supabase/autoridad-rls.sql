-- Autoridad en Discover con la sesión del equipo (23 nov 2026). Se puede ejecutar más de una vez.
-- authenticated solo puede LEER las columnas necesarias (id se usa para paginar) y solo si es del equipo.
-- Sin INSERT/UPDATE/DELETE para authenticated; anon sin permisos; service_role conserva los suyos.
GRANT SELECT (id, url, clics, desde, hasta) ON public.autoridad_discover TO authenticated;
ALTER TABLE public.autoridad_discover ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "equipo lee autoridad" ON public.autoridad_discover;
CREATE POLICY "equipo lee autoridad" ON public.autoridad_discover
  FOR SELECT TO authenticated USING (public.es_equipo());
