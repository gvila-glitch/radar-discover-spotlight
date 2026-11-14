DROP POLICY "admin lee perfil editorial" ON public.config;
DROP POLICY "admin edita perfil editorial" ON public.config;
CREATE POLICY "admin lee ajustes" ON public.config FOR SELECT TO authenticated USING (clave IN ('perfil_editorial','ambito','excepciones','max_alertas_dia','umbral_alta_medios','umbral_media_medios') AND public.es_admin());
CREATE POLICY "admin edita ajustes" ON public.config FOR UPDATE TO authenticated USING (clave IN ('perfil_editorial','ambito','excepciones','max_alertas_dia','umbral_alta_medios','umbral_media_medios') AND public.es_admin()) WITH CHECK (clave IN ('perfil_editorial','ambito','excepciones','max_alertas_dia','umbral_alta_medios','umbral_media_medios') AND public.es_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.medios_referencia TO authenticated;
CREATE POLICY "admin lee medios" ON public.medios_referencia FOR SELECT TO authenticated USING (public.es_admin());
CREATE POLICY "admin crea medios" ON public.medios_referencia FOR INSERT TO authenticated WITH CHECK (public.es_admin());
CREATE POLICY "admin edita medios" ON public.medios_referencia FOR UPDATE TO authenticated USING (public.es_admin()) WITH CHECK (public.es_admin());
CREATE POLICY "admin borra medios" ON public.medios_referencia FOR DELETE TO authenticated USING (public.es_admin());