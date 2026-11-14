# Source-fusion verification

Tested on 2026-11-14 using disposable PostgreSQL 17 on localhost, not the managed database. All five function-definition hashes matched the deployed functions exactly. No live data, schedules or application behavior were changed; no Apify or Wikimedia calls were made.

Run `RADAR_FUSION_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55433/postgres bunx vitest run src/lib/fusionAlertas.integration.test.ts src/lib/trendsAlertas.test.ts src/lib/wikipediaPicos.test.ts` against an isolated local cluster only.

## Verified

- X position 7, Google Trends volume `2000+`, and Wikipedia 12,000 visits / ratio 4 enrich one existing alert ID. Three updates create zero new rows. Replaying all three creates zero rows, makes zero further updates and leaves context unchanged.
- At daily maximum 8, all three sources enrich an existing row; the total stays 8. A new unrelated candidate is rejected with `tope_diario`.
- Each source's SQL accepts four enrichments alongside three new alerts. The fourth new alert is rejected with `limite_ejecucion`; total grows from 4 to 7, not 11.
- The real Trends/X and Wikipedia planners pass existing-entity candidates to SQL even at the daily cap.
- Fictional `Marina Valverde` and `Pablo Valverde` stay in separate rows. With both present, surname-only `Valverde` returns no fusion destination; a full exact name updates the correct row. This does not establish that a surname alone is safe when only one matching person is present.

## Reproduced defects — not fixed

- `Juan Valverde` incorrectly combines with `Juan Carlos Valverde` because the shorter token set is contained in the longer one.
- `Marina Valverde (política)` incorrectly combines with `Marina Valverde (cantante)` because normalization removes disambiguating parentheses.
- `MARINA VALVERDE` does not match `Marina Valverde`: the translation mapping removes uppercase letters, producing an empty key for the all-uppercase version.

The suite reports **23 passed and 3 expected failures** across 26 tests. Expected-failure tests capture real defects; they are not evidence of safe behavior. The general claim that different people cannot be merged is therefore false with the current rules.