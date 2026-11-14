-- Daily 03:00 UTC cleanup including Wikipedia spikes.
select cron.alter_job(1, command := 'select public.limpiar_snoop(); select public.limpiar_trends(); select public.limpiar_x_tendencias(); select public.limpiar_wikipedia_picos();');
