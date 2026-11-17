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
