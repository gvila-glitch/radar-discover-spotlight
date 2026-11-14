# Source-fusion verification

Tested on 2026-11-14 using disposable PostgreSQL 17 on localhost, not the managed database. All five function-definition hashes matched the deployed functions exactly. No live data, schedules or application behavior were changed; no Apify or Wikimedia calls were made.

Run `RADAR_FUSION_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55433/postgres bunx vitest run src/lib/fusionAlertas.integration.test.ts src/lib/trendsAlertas.test.ts src/lib/wikipediaPicos.test.ts` against an isolated local cluster only.

## Verified

- X position 7, Google Trends volume `2000+`, and Wikipedia 12,000 visits / ratio 4 enrich one existing alert ID. Three updates create zero new rows. Replaying all three creates zero rows, makes zero further updates and leaves context unchanged.
- At daily maximum 8, all three sources enrich an existing row; the total stays 8. A new unrelated candidate is rejected with `tope_diario`.
- Each source's SQL accepts four enrichments alongside three new alerts. The fourth new alert is rejected with `limite_ejecucion`; total grows from 4 to 7, not 11.
- The real Trends/X and Wikipedia planners pass existing-entity candidates to SQL even at the daily cap.
- Fictional `Marina Valverde` and `Pablo Valverde` stay in separate rows. With both present, surname-only `Valverde` returns no fusion destination; a full exact name updates the correct row. This does not establish that a surname alone is safe when only one matching person is present.

## Defects found and fixed

The first round of tests reproduced three defects. They are fixed by `supabase/fusion-reglas-v2.sql`, which replaces four functions (`clave_entidad`, `parentesis_entidad`, `entidades_equivalentes`, `fusionar_alerta_reciente`) and is loaded right after migration 0015 in the integration test. The planners in `src/lib/trendsAlertas.ts` use the same rule in TypeScript.

- `Juan Valverde` no longer combines with `Juan Carlos Valverde`: a multi-word short name must appear **contiguously and in order** in the longer one. A one-word short name must be the **last** word of the longer one (a surname) and have at least 5 letters, so `Pedro` does not match `Pedro Sánchez`.
- `Marina Valverde (política)` no longer combines with `Marina Valverde (cantante)`: if both names carry parentheses and they differ, they are different entities. The shortcut for several identical alerts also requires identical parentheses, so a candidate without parentheses is ambiguous between two namesakes and is not combined.
- Uppercase names: the A–Z to a–z step is now a separate ASCII-only `translate`, so it no longer depends on how the database counts accented characters. On the managed database `clave_entidad('MARINA VALVERDE')` already returned `marina valverde` with `UTF8` encoding, so the failure came from the disposable test database; the change makes it robust anyway.

These three scenarios are now ordinary tests (no longer expected failures). Equivalent scenarios, plus a parity test that compares the SQL and TypeScript rules over every pair of 65 names (4,225 pairs), were also run in an embedded PostgreSQL (PGlite) outside this repository.

`supabase/fusion-reglas-v2.sql` was applied by hand in the SQL editor and is **not yet recorded as a migration**; it is idempotent (`create or replace`), so recording it later changes nothing.

## Known limit

A surname alone (`Sánchez`) combines with the single matching alert when only one person with that surname exists in the last 24 hours. With two or more it is ambiguous and is not combined. This is a design decision, not a defect: nothing in the name says it is a different person.
