CREATE TABLE public.equipo_roles (email text NOT NULL, rol text NOT NULL CHECK (rol IN ('admin')), PRIMARY KEY (email, rol));
GRANT ALL ON public.equipo_roles TO service_role;
ALTER TABLE public.equipo_roles ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.es_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.es_equipo() AND EXISTS (SELECT 1 FROM public.equipo_roles WHERE lower(email) = lower(auth.jwt()->>'email') AND rol = 'admin')
$$;
REVOKE ALL ON FUNCTION public.es_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.es_admin() TO authenticated;
GRANT SELECT ON public.config TO authenticated;
GRANT UPDATE (valor, actualizado_en) ON public.config TO authenticated;
CREATE POLICY "admin lee perfil editorial" ON public.config FOR SELECT TO authenticated USING (clave = 'perfil_editorial' AND public.es_admin());
CREATE POLICY "admin edita perfil editorial" ON public.config FOR UPDATE TO authenticated USING (clave = 'perfil_editorial' AND public.es_admin()) WITH CHECK (clave = 'perfil_editorial' AND public.es_admin());