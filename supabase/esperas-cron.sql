-- NO va en las migraciones (el sistema de migraciones de Lovable no gestiona tareas programadas): queda aplicado en la base de datos y documentado aquí.
-- Tiempo de espera de las tareas programadas que llaman a la web (pg_net). Por defecto pg_net deja de esperar a los
-- 5 segundos; si la tarea tarda más, la respuesta se pierde y, a veces, el trabajo se corta a medias.
-- Solo añade «timeout_milliseconds» a la llamada; no toca la dirección, la autorización ni el horario.
-- Se puede ejecutar más de una vez (solo cambia las tareas que aún no lo tienen).
-- OJO: estas tareas llevan la marca /* lovable:authenticated-cron:v1 */; si Lovable las regenera (por ejemplo al cambiar
-- la clave de las tareas), habría que volver a ejecutar esto.

-- 1) APLICADO el 15 nov 2026: lectura de X (llama a Apify, tarda ~10 s) y picos de Wikipedia: hasta 150 s.
select jobname,
       cron.alter_job(jobid, command := replace(command,
         'body := ''{}''::jsonb)',
         'body := ''{}''::jsonb, timeout_milliseconds := 150000)'))
from cron.job
where jobname in ('radar-x-ingesta', 'wikipedia-a-alertas')
  and command not like '%timeout_milliseconds%';

-- 2) APLICADO el 16 nov 2026: creación de alertas de X y Trends, que ahora busca un titular en Google Noticias para las
--    que vienen solo de X: hasta 60 s.
select jobname,
       cron.alter_job(jobid, command := replace(command,
         'body := ''{}''::jsonb)',
         'body := ''{}''::jsonb, timeout_milliseconds := 60000)'))
from cron.job
where jobname = 'radar-trends-a-alertas'
  and command not like '%timeout_milliseconds%';

-- Comprobación: las tres deben salir con true.
-- select jobname, command like '%timeout_milliseconds%' as espera_ampliada from cron.job
-- where jobname in ('radar-x-ingesta', 'wikipedia-a-alertas', 'radar-trends-a-alertas');
