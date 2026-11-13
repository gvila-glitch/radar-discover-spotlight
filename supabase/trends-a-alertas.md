# Trends a alertas

- HTTP boundary: `POST /api/public/trends-a-alertas`, empty JSON object; no schedule created.
- The managed cron authentication helper verifies the private bearer credential before imports, reads or writes. Missing credentials return 401; ordinary user tokens do not authorize the job.
- This modern project uses a TanStack server route, not a new Edge Function under `supabase/functions`.
- Rules and tests: `src/lib/trendsAlertas.ts` and `src/lib/trendsAlertas.test.ts`. Privileged orchestration: `src/lib/trendsAlertas.server.ts`; all alert reads and writes remain in `src/lib/alertasRepo.ts`.
- Reads 30-minute snapshots, falling back to two hours only if there are no snapshots in the first window. Keeps the latest reading per exact term, with ID as tie-breaker.
- Applies active topic exclusions, 24-hour normalized entity deduplication, Madrid hours and the Madrid calendar-day cap. All statuses and test alerts count toward the daily cap. Missing/invalid configuration fails closed.
- Creates at most three rows in one batch, ordered by numeric traffic band, preserving the original volume text. Reports discards by reason; `limite_ejecucion` is separate from `tope_diario`. Repeated snapshots are reported separately from discarded unique terms.
- Opening hour is inclusive and closing hour exclusive; 24 means midnight. Overnight windows are supported. Madrid midnight is resolved using its own offset, including DST transition days.
- Sequential manual calls are deduplicated. With the requested unchanged schema there is no database lock or uniqueness constraint: overlapping calls or other simultaneous writers cannot be guaranteed against duplicates or cap races. Keep this unscheduled and serialize manual calls; before scheduling, add transactional database locking with approval.
- No tokens or private keys are written to files. Publish the app to make this new HTTP path available on the published URL; publishing also ships other pending application changes.