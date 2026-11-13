-- Run after 0004_cron_trends. Preserve the existing daily cleanup job.
select cron.alter_job(1, command := 'select public.limpiar_snoop(); select public.limpiar_trends();');
