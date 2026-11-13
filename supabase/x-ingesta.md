# X ingestion

- POST `/api/public/x-ingesta` requires managed cron bearer authentication before any reads or paid API call. Default body `{}`; manual test `{"ignorar_horario":true}` bypasses only hours.
- Uses explicitly requested plain Cloud `APIFY_TOKEN`, not a connector. Token travels only in Authorization, never in URLs, logs or responses.
- One synchronous Actor call, Spain input, maximum 30 trends, 120-second timeout including response body, no retries. Timeout may leave a paid Actor running on Apify: check Apify before another manual call.
- Preflight: latest successful capture at least 45 minutes old, fewer than 20 distinct capture timestamps today in Madrid, configured Madrid hours unless manual override. Fail closed on read/config errors. Checks do not serialize concurrent X runs; failed attempts do not consume the capture-based cap.
- Strict validation rejects empty/malformed lists. One atomic insertion stores only rank/name/category/postCount mappings; database default gives the batch one capture timestamp.
- 30-day cleanup appended to existing daily 03:00 UTC SQL job. X ingestion remains unscheduled.