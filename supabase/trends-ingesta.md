# Google Trends España

- Endpoint: `POST /api/public/trends-ingesta`.
- Authorization: the generated `authenticateCronRequest` verifies the managed cron bearer credential using a timing-safe comparison. Ordinary user sessions and unauthenticated calls are not accepted. This proves possession of the private cron credential, not network origin; it is not a claim that HTTP itself identifies the scheduler.
- Parsing and ingestion logic: `src/lib/trendsIngesta.ts`; HTTP boundary: `src/routes/api/public/trends-ingesta.ts`.
- Managed job: `radar-trends-ingesta`, `*/15 * * * *`, JSON body `{}`. Recreate through the managed schedule tool, never interpolate a credential into SQL.
- Cleanup DDL: `drizzle/migrations/0002_0004_cron_trends.sql` (the migration tool owns this location). Apply this portable PostgreSQL function before `programar_limpieza_trends.sql`; the latter refers to this installation's existing cleanup job ID 1.
- Daily cleanup stays at 03:00 UTC and calls `limpiar_snoop()` followed by `limpiar_trends()` in the same job.
- Each successful read inserts all titled trends in a single atomic batch; repeats remain distinct readings. No alerts are generated and the panel is unchanged.
- Google timeout covers both response headers and RSS body: 10 seconds. HTTP errors, invalid XML, invalid dates and no titled items do not insert anything.
- Only termino, volumen, empezo_en and noticias are inserted. capturado_en uses the database default. No pictures, descriptions or RSS links are stored.
- Deploy by publishing the application before expecting the managed scheduler to reach the new production endpoint.