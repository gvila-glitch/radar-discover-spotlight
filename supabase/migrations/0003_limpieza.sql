-- pg_cron is available. Runs daily at 03:00 UTC.
create extension if not exists pg_cron;
select cron.schedule('radar-limpiar-snoop', '0 3 * * *', 'select public.limpiar_snoop();');
