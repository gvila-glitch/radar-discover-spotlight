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
