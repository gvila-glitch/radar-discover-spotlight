# Autoridad en Discover con la sesión del equipo

Sin cambios en la interfaz. La lectura pasa del cliente privilegiado a la sesión del usuario, y la base de datos decide quién lee.

## Aviso importante (una desviación necesaria)
La consulta actual ordena por `id` para paginar (`.order("id")`). Con un permiso de columnas que solo incluye `url, clics, desde, hasta`, PostgreSQL rechaza ordenar por `id` («permission denied for column id») y el bloque dejaría de verse. Propuesta: conceder también `id` (es un número interno, no aporta información) y mantener la consulta, la paginación y el cálculo idénticos. Si prefieres solo cuatro columnas, la alternativa es cambiar el orden a `url, desde` — pero eso toca la consulta, que pediste no cambiar.

## 1. Migración `drizzle/migrations/0019_autoridad_con_sesion.sql` (+ copia `supabase/autoridad-rls.sql`)
- `GRANT SELECT (id, url, clics, desde, hasta) ON public.autoridad_discover TO authenticated;`
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` (idempotente, sigue activo)
- `DROP POLICY IF EXISTS` + `CREATE POLICY "equipo lee autoridad" FOR SELECT TO authenticated USING (public.es_equipo());`
- Sin INSERT/UPDATE/DELETE para authenticated; anon sin permisos; service_role intacto.

## 2. `src/lib/autoridad.functions.ts`
- Se mantiene `es_equipo` con error «Sin permiso».
- `leerFilasAutoridad(context.supabase as unknown as LectorAutoridad)`; sin `client.server` ni `supabaseAdmin`.
- Comentario superior actualizado: lee con la sesión del usuario; RLS + permiso de columnas limitan el acceso; al navegador solo llega el resultado por tema.

## 3. `autoridad.ts` / `autoridad.server.ts`
- Sin cambios de lógica; como mucho, actualizar el comentario de `autoridad.server.ts` que dice «RLS sin políticas».

## 4. Pruebas
- Añadir en `src/lib/autoridad.test.ts` una comprobación estática: `autoridad.functions.ts` no contiene `client.server` ni `supabaseAdmin`.
- Ejecutar las pruebas de autoridad y ajustar las que fallen. Tipos: la migración los regenera.
- Sin claves ni tokens en archivos. Commit al terminar.
