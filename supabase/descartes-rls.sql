-- Descartes IA con la sesión del usuario (sin clave de servicio).
GRANT SELECT ON public.descartes_ia TO authenticated;
ALTER TABLE public.descartes_ia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "equipo lee descartes" ON public.descartes_ia;
CREATE POLICY "equipo lee descartes" ON public.descartes_ia FOR SELECT TO authenticated USING (public.es_equipo());

CREATE OR REPLACE FUNCTION public.marcar_descarte(p_id bigint, p_marcar boolean, p_nota text)
RETURNS public.descartes_ia LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fila public.descartes_ia; v_nota text;
BEGIN
  IF public.es_equipo() IS NOT TRUE THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  IF p_marcar THEN
    v_nota := nullif(left(btrim(regexp_replace(coalesce(p_nota, ''), '\s+', ' ', 'g')), 500), '');
    UPDATE public.descartes_ia SET veredicto = 'deberia_pasar', veredicto_por = lower(auth.jwt()->>'email'),
      veredicto_en = now(), nota = v_nota WHERE id = p_id RETURNING * INTO fila;
  ELSE
    UPDATE public.descartes_ia SET veredicto = NULL, veredicto_por = NULL, veredicto_en = NULL, nota = NULL
      WHERE id = p_id RETURNING * INTO fila;
  END IF;
  IF fila.id IS NULL THEN RAISE EXCEPTION 'Descarte no encontrado'; END IF;
  RETURN fila;
END $$;

CREATE OR REPLACE FUNCTION public.anadir_excepcion_descarte(p_id bigint, p_tipo text, p_linea text)
RETURNS public.descartes_ia LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fila public.descartes_ia; v_clave text; v_linea text; v_actual text; v_valor text;
BEGIN
  IF public.es_admin() IS NOT TRUE THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  IF p_tipo NOT IN ('criterio', 'nombre') THEN RAISE EXCEPTION 'Tipo no válido'; END IF;
  IF p_linea IS NULL OR char_length(p_linea) < 1 OR char_length(p_linea) > 300 THEN RAISE EXCEPTION 'Línea no válida'; END IF;
  PERFORM 1 FROM public.descartes_ia WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Descarte no encontrado'; END IF;
  v_clave := CASE WHEN p_tipo = 'nombre' THEN 'reglas_si' ELSE 'excepciones' END;
  v_linea := CASE WHEN p_tipo = 'nombre' THEN p_linea ELSE '- ' || p_linea END;
  SELECT valor INTO v_actual FROM public.config WHERE clave = v_clave FOR UPDATE;
  v_actual := rtrim(coalesce(v_actual, ''), E' \t\r\n');
  IF EXISTS (SELECT 1 FROM regexp_split_to_table(v_actual, E'\r?\n') l WHERE lower(btrim(l)) = lower(btrim(v_linea))) THEN
    v_valor := v_actual;
  ELSIF v_actual = '' THEN v_valor := v_linea;
  ELSE v_valor := v_actual || E'\n' || v_linea;
  END IF;
  INSERT INTO public.config (clave, valor, actualizado_en) VALUES (v_clave, v_valor, now())
    ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = EXCLUDED.actualizado_en;
  UPDATE public.descartes_ia SET excepcion = p_linea, excepcion_tipo = p_tipo,
    excepcion_por = lower(auth.jwt()->>'email'), excepcion_en = now() WHERE id = p_id RETURNING * INTO fila;
  RETURN fila;
END $$;

REVOKE ALL ON FUNCTION public.marcar_descarte(bigint, boolean, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.anadir_excepcion_descarte(bigint, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.marcar_descarte(bigint, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.anadir_excepcion_descarte(bigint, text, text) TO authenticated;
