# Descartes IA sin clave de servicio

Objetivo: que la pestaña «Descartes IA» funcione publicada en Cloudflare Workers sin SUPABASE_SERVICE_ROLE_KEY. La interfaz no cambia.

## 1. Migración 0018 (drizzle/migrations)
- descartes_ia: GRANT SELECT a authenticated + política SELECT `USING (public.es_equipo())`. Sin INSERT/UPDATE/DELETE. RLS sigue activo.
- `public.marcar_descarte(p_id, p_marcar, p_nota)` → fila de descartes_ia. SECURITY DEFINER, search_path=public. Sin es_equipo → 'Sin permiso'. Marcar: veredicto 'deberia_pasar', veredicto_por = email del token en minúsculas, veredicto_en now(), nota limpia (espacios unidos, recortada, máx. 500, vacía → null). Desmarcar: las cuatro a null. Solo esas columnas.
- `public.anadir_excepcion_descarte(p_id, p_tipo, p_linea)` → fila. SECURITY DEFINER. Sin es_admin → 'Sin permiso'. Tipo 'criterio'|'nombre'; línea 1–300. Añade a config `reglas_si` (nombre) o `excepciones` (criterio, con «- »), sin duplicar (sin mayúsculas, como anadirLinea), actualiza actualizado_en, crea la clave si falta; luego anota excepcion, excepcion_tipo, excepcion_por (token), excepcion_en. Todo atómico.
- REVOKE ALL FROM public, anon; GRANT EXECUTE a authenticated en ambas.
- Copia portable en supabase/ (regla del proyecto).

## 2. src/lib/descartes.functions.ts
- listarDescartes: misma consulta/orden con context.supabase; mantiene comprobación es_equipo.
- marcarDescarte: limpia la nota y llama rpc marcar_descarte.
- anadirExcepcion: valida (criterioValido, lineaReglaSi) y llama rpc anadir_excepcion_descarte.
- Sin import de client.server ni supabaseAdmin.

## 3. Sin cambios
descartes.server.ts y rutas src/routes/api/public/.

## 4. Pruebas
Actualizar las que fallen y añadir una que verifique que descartes.functions.ts no importa client.server. Regenerar tipos. Sin claves en archivos.
