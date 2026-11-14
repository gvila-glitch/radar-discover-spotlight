-- ESTADO: PENDIENTE de aplicar (una sola vez), después de supabase/cruce-snoop-v3.sql.

-- Ejecuta el cruce con Snoop cada 15 minutos (pg_cron, igual que las limpiezas). Se aplica una sola vez.
select cron.schedule('radar-cruzar-snoop', '*/15 * * * *', 'select public.cruzar_snoop();');
