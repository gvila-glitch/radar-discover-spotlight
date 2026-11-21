-- ESTADO: PENDIENTE de aplicar a mano en el editor de SQL (17 nov 2026) y de registrar como migración. Se puede
-- ejecutar más de una vez.
--
-- AUTORIDAD EN DISCOVER: nuestras piezas que han tenido tráfico de Discover, según las exportaciones de Search Console
-- (Rendimiento → Discover → Páginas → Exportar → Descargar CSV). Con ellas, la ficha de cada alerta dice si tenemos
-- autoridad en ese tema (src/lib/autoridad.ts). Una fila por pieza y exportación; cada exportación cubre unas fechas
-- (desde–hasta), normalmente un mes.
--
-- Cómo se carga: las exportaciones NO van al repo (son datos de tráfico de la empresa). Se convierten fuera del repo en
-- un bloque de SQL que borra las exportaciones que se solapan con esas fechas e inserta las filas nuevas, y se pega en
-- el editor de SQL. Ninguna función programada escribe en esta tabla.
--
-- Seguridad: RLS activado y sin políticas, y sin permisos para anon ni authenticated: el navegador no puede leer ni
-- escribir. Solo la lee la función del servidor leerAutoridad (clave de servicio), que antes comprueba es_equipo().

create table if not exists public.autoridad_discover (
  id bigint generated always as identity primary key,
  url text not null check (url ~ '^https://' and length(url) <= 2000),
  clics integer not null check (clics >= 0),
  desde date not null,
  hasta date not null,
  cargado_en timestamptz not null default now(),
  check (hasta >= desde),
  unique (url, desde, hasta)
);

alter table public.autoridad_discover enable row level security;
revoke all on public.autoridad_discover from public, anon, authenticated;
grant all on public.autoridad_discover to service_role;
grant usage, select on sequence public.autoridad_discover_id_seq to service_role;

-- Comprobación: debe salir rls_activo = true y filas = 0 la primera vez.
-- select (select relrowsecurity from pg_class where oid = 'public.autoridad_discover'::regclass) as rls_activo,
--        (select count(*) from public.autoridad_discover) as filas;
-- ESTADO: APLICADO A MANO en el editor de SQL el 17 nov 2026. PENDIENTE de registrar como migración y de añadir a los
-- tipos generados. Se puede ejecutar más de una vez.
--
-- MOTIVO DEL RUIDO Y «LO QUE NO CUBRIMOS»
-- 1) motivo_ruido: al marcar una alerta como ruido, el equipo puede decir por qué (opcional). Solo «no es nuestro tema»
--    es un fallo del filtro editorial; «llegamos tarde», «ya lo teníamos» y «nombre confundido» son de otras partes del
--    radar. El panel lo escribe con la sesión de quien valora (RLS: solo el equipo; permiso solo para esta columna).
-- 2) no_cubrimos, no_cubrimos_por, no_cubrimos_en: cuando un administrador añade la alerta a «lo que no cubrimos»
--    (un criterio en las excepciones de la IA o el nombre en las reglas de «no»), qué línea se añadió, quién y cuándo.
--    Solo lo escribe la función del servidor anadirNoCubrimos, que antes comprueba es_admin(); el navegador no puede.

alter table public.alertas add column if not exists motivo_ruido text;
alter table public.alertas drop constraint if exists alertas_motivo_ruido_check;
alter table public.alertas add constraint alertas_motivo_ruido_check
  check (motivo_ruido is null or motivo_ruido in ('no_es_tema', 'tarde', 'ya_lo_teniamos', 'nombre_confundido'));

alter table public.alertas add column if not exists no_cubrimos text check (no_cubrimos is null or length(no_cubrimos) <= 300);
alter table public.alertas add column if not exists no_cubrimos_por text;
alter table public.alertas add column if not exists no_cubrimos_en timestamptz;

-- El equipo ya puede cambiar (estado, pieza_url, estado_actualizado_en, estado_por); se añade solo motivo_ruido.
grant update (motivo_ruido) on public.alertas to authenticated;

-- Comprobación: deben salir las cuatro columnas nuevas.
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'alertas'
--   and column_name in ('motivo_ruido', 'no_cubrimos', 'no_cubrimos_por', 'no_cubrimos_en');
