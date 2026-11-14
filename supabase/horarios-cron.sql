-- Horarios de las tareas programadas (pg_cron, en hora UTC), tal como quedaron el 15 nov 2026.
-- Aplicados a mano en el editor de SQL de Lovable; pendientes de registrar como migración.
-- Ninguna línea contiene claves: la tarea nueva copia la autorización de la de Trends dentro de la base de datos.

-- Lectura de Google Trends: cada hora, en el minuto 5 (antes, cada 15 minutos).
select cron.alter_job(jobid, schedule := '5 * * * *') from cron.job where jobname = 'radar-trends-ingesta';

-- Creación de alertas de Wikipedia: dos veces al día, 9:30 y 15:30 en Madrid en invierno (antes, cada hora).
select cron.alter_job(jobid, schedule := '30 8,14 * * *') from cron.job where jobname = 'wikipedia-a-alertas';

-- Puesta al día con Snoop: 4 veces al día, 8:10, 13:10, 18:10 y 23:10 en Madrid en invierno (antes, cada 15 minutos).
select cron.alter_job(jobid, schedule := '10 7,12,17,22 * * *') from cron.job where jobname = 'radar-cruzar-snoop';

-- Creación de alertas de X y Trends: cada hora, en el minuto 15 (antes no estaba programada).
select cron.schedule('radar-trends-a-alertas', '15 * * * *', replace(command, '/trends-ingesta', '/trends-a-alertas'))
from cron.job where jobname = 'radar-trends-ingesta';

-- Sin cambios: radar-x-ingesta (cada hora, minuto 0) y radar-limpiar-snoop (3:00 UTC).
