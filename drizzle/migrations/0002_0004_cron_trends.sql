-- HTTP ingestion uses the managed schedule tool: radar-trends-ingesta,
-- */15 * * * *, /api/public/trends-ingesta, body {}. No credentials in SQL.
create or replace function public.limpiar_trends()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.trends where capturado_en < now() - interval '30 days';
$$;
revoke all on function public.limpiar_trends() from public, anon, authenticated;
grant execute on function public.limpiar_trends() to service_role;