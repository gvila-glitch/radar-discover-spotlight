-- NO va en las migraciones (el sistema de migraciones de Lovable no gestiona tareas programadas): queda aplicado en la base de datos y documentado aquí.
-- ESTADO: aplicado el 15 nov con '*/15 * * * *'; se cambia a 4 veces al día con cron.alter_job (ver abajo). Al registrar como
-- migración, usar este horario.

-- Ejecuta el cruce con Snoop 4 veces al día: 8:10, 13:10, 18:10 y 23:10 en Madrid en horario de invierno (pg_cron va en UTC).
select cron.schedule('radar-cruzar-snoop', '10 7,12,17,22 * * *', 'select public.cruzar_snoop();');
-- Si la tarea ya existe, basta con cambiar el horario:
-- select cron.alter_job(jobid, schedule := '10 7,12,17,22 * * *') from cron.job where jobname = 'radar-cruzar-snoop';
