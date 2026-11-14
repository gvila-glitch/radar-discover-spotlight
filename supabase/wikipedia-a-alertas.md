# wikipedia-a-alertas
POST /api/public/wikipedia-a-alertas, cron-authenticated, scheduled hourly at minute 30.
- Reads the public Wikimedia top-1000 (es.wikipedia) for the last complete UTC day plus the 7 previous days; no key.
- Spike: >= 5000 views and >= 3x the 7-day mean (missing days count at that day's list minimum). Service pages filtered. Up to 20 stored per day in wikipedia_picos (30-day cleanup in the daily job).
- Each run creates up to 3 pending alerts through guardar_alertas_wikipedia_atomicas, which shares the Trends lock, daily cap, hours and 24h deduplication.
