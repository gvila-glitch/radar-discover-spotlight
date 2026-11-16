-- REGISTRADO como migración en drizzle/migrations/0016_registrar_cambios_manuales.sql (16 nov 2026). Este archivo queda como referencia.
-- ESTADO: APLICADO a mano en el editor de SQL (16 nov 2026); PENDIENTE de registrar como migración. Se puede ejecutar más de una vez.
--
-- DESCARTES DE LA IA: temas que la IA dejó fuera (fuera de línea o noticia de agencia), para revisarlos en el panel
-- (Alertas → «Descartadas por la IA»). Un tema por día: si vuelve a salir, se actualiza la misma fila.
-- Seguridad: RLS activado y sin políticas, y sin permisos para anon ni authenticated: el navegador no puede leer ni
-- escribir. Solo lo hacen las funciones del servidor (clave de servicio), que antes comprueban que quien pregunta es del
-- equipo (y, para añadir excepciones, que es administrador). Lo que tenga más de 30 días lo borra la propia tarea.

create table if not exists public.descartes_ia (
  id bigint generated always as identity primary key,
  dia date not null,                       -- día en Madrid
  clave text not null,                     -- nombre normalizado (para no repetir el tema en el mismo día)
  tema text not null,
  fuente text not null check (fuente in ('x_trends', 'wikipedia')),
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  puntos integer not null default 0,       -- fuerza de la señal, sin contar la línea editorial ni Discover
  fuerte boolean not null default false,   -- lo que se enseña por defecto
  x_posicion integer,
  x_desde timestamptz,
  trends_crecimiento text,
  wikipedia_visitas integer,
  wikipedia_ratio numeric,
  contexto text not null default '',
  motivo_ia text not null default '',
  seccion_ia text not null default '',
  agencia boolean not null default false,
  modelo text not null default '',
  -- Revisión: «Debería haber pasado» (cualquiera del equipo).
  veredicto text check (veredicto is null or veredicto = 'deberia_pasar'),
  veredicto_por text,
  veredicto_en timestamptz,
  nota text check (nota is null or length(nota) <= 500),
  -- Excepción añadida a partir de este descarte (solo administradores).
  excepcion text check (excepcion is null or length(excepcion) <= 500),
  excepcion_tipo text check (excepcion_tipo is null or excepcion_tipo in ('criterio', 'nombre')),
  excepcion_por text,
  excepcion_en timestamptz,
  unique (dia, clave)
);

create index if not exists descartes_ia_dia_puntos on public.descartes_ia (dia desc, puntos desc);

alter table public.descartes_ia enable row level security;
revoke all on public.descartes_ia from public, anon, authenticated;
grant all on public.descartes_ia to service_role;
grant usage, select on sequence public.descartes_ia_id_seq to service_role;

-- Comprobación: debe salir rls_activo = true y filas = 0 la primera vez.
-- select (select relrowsecurity from pg_class where oid = 'public.descartes_ia'::regclass) as rls_activo,
--        (select count(*) from public.descartes_ia) as filas;
