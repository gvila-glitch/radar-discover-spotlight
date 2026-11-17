<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Source-fusion SQL integration tests use only a guarded disposable local PostgreSQL database, so test fixtures never affect live alerts or provider costs.
- All alert reads and writes go through src/lib/alertasRepo.ts; keep its listAlertas and valorar contract to isolate the data provider.
- The authenticated layout owns session and team gating; RLS and column grants enforce access independently of the UI.
- Keep canonical portable SQL in supabase/migrations; Lovable applies schema through its migration tool and data-only SQL through the query tool.
- Password invitations and recovery use a public reset route and the managed auth session; the root owns recovery events so protected routes never swallow password links.
- Scheduled RSS ingestion uses a TanStack public route with authenticateCronRequest and a managed HTTP schedule; credentials stay platform-managed and XML parsing is isolated for portability and tests.
- Trends conversion uses a cron-authenticated public route, pure tested selection rules and a server-only orchestrator; privileged alert access remains in alertasRepo so the provider contract and panel access stay isolated.
- Trends conversion commits through a service-role-only PostgreSQL RPC with a transaction-scoped advisory lock and fresh deduplication/day-cap/hour checks; a worker-local mutex cannot serialize distributed executions.
- X ingestion isolates parsing/cost preflight in tested pure logic and privileged orchestration in a server-only module; use the explicitly requested plain provider secret, never retry paid calls automatically, and append cleanup to the existing SQL job.
- Both X ingestion and Trends conversion acquire a service-role-only non-waiting five-minute lease in reserved config rows before acting; PostgreSQL time and atomic takeover allow crash recovery without scheduling cleanup, and owner-checked release in finally cannot delete a replacement lease. Keep the conversion's transactional cap/deduplication RPC as defense in depth.
- Admin-only settings use the separate equipo_roles table and es_admin(); config RLS exposes only the editable perfil_editorial row to admins, never through user-editable metadata.
- Wikipedia spikes use the same pattern as Trends conversion (cron route, pure tested rules, server-only orchestrator, five-minute lease) and a sibling RPC sharing the Trends transaction lock so all sources share one daily cap and deduplication.
- Base de datos con cambios aplicados a mano en el editor de SQL (15–16 nov 2026). Las funciones y la tabla ya están REGISTRADAS en drizzle/migrations/0016_registrar_cambios_manuales.sql; las tareas programadas (cruce-snoop-cron, horarios-cron, esperas-cron) no van en migraciones y siguen documentadas en supabase/. Antes de cualquier cambio que toque estas funciones o tareas, parte de estos archivos (son la versión que está funcionando). Orden en que se aplicaron: 0015 → v2 → v3 → v4 → horarios → esperas → prioridad → descartes.
  - `supabase/fusion-reglas-v2.sql`: clave_entidad, parentesis_entidad, entidades_equivalentes, fusionar_alerta_reciente.
  - `supabase/cruce-snoop-v3.sql` y después `supabase/cruce-snoop-v4.sql` (donde coinciden, manda v4): datos_discover, datos_discover_desde, cruzar_snoop, guardar_alertas_trends_atomicas, guardar_alertas_wikipedia_atomicas.
  - `supabase/cruce-snoop-cron.sql` y `supabase/horarios-cron.sql`: horarios de radar-trends-ingesta, wikipedia-a-alertas, radar-cruzar-snoop y la tarea nueva radar-trends-a-alertas. La autorización de radar-trends-a-alertas se copió dentro de la base de datos desde radar-trends-ingesta: no la recrees desde el repo ni pongas credenciales en archivos.
  - `supabase/prioridad-puntos.sql` (16 nov 2026, después de lo anterior): volumen_numerico, puntuar_alerta y el disparador alertas_prioridad_por_puntos, que fija la prioridad de cada alerta con la fórmula de puntos al crearla y cuando cambian sus datos; la misma fórmula está en src/lib/prioridad.ts y deben coincidir. No lo quites ni vuelvas a calcular la prioridad en otras funciones.
  - `supabase/prioridad-puntos.sql` v2 (16 nov): la fórmula también entiende «Encaja (IA, alto)» (+3) y «Encaja (IA, medio)» (+1).
  - `supabase/esperas-cron.sql`: radar-x-ingesta, wikipedia-a-alertas y radar-trends-a-alertas llevan `timeout_milliseconds` en su llamada (si no, pg_net corta a los 5 s y se pierde el trabajo). Si regeneras estas tareas, conserva esa espera.
  - `supabase/descartes-ia.sql` (16 nov): tabla descartes_ia (temas que la IA dejó fuera, para revisarlos en el panel). RLS sin políticas y sin permisos para anon/authenticated: solo la usan funciones del servidor que comprueban es_equipo / es_admin.
- Autoridad en Discover (17 nov): `supabase/autoridad-discover.sql` crea la tabla autoridad_discover (APLICADA A MANO; pendiente de registrar como migración y de añadir a los tipos generados). Guarda las exportaciones de Search Console (Discover → Páginas) que la propietaria carga a mano cada mes con un SQL generado fuera del repo; ninguna tarea programada escribe en ella y los datos nunca van al repo. RLS sin políticas y sin permisos para anon/authenticated: solo la lee `leerAutoridad` (src/lib/autoridad.functions.ts) tras comprobar es_equipo. La lógica (cómo se busca el tema, niveles alta ≥3 / media 1–2 / tema nuevo) está en src/lib/autoridad.ts con pruebas; la autoridad solo se enseña y no suma puntos.
- Usuarios: gestión de admins y usuarios solo vía server functions que verifican es_admin() antes de usar el cliente privilegiado; equipo/equipo_roles siguen sin políticas para el navegador.
- Payments use authenticated team-only server functions, gateway-only Stripe access and sandbox-only checkout; IA Advisor has no analysis endpoint, so subscribing cannot activate it. Subscription reads are owner-scoped through RLS and environment-filtered; signed webhooks reconcile current provider state rather than replaying event snapshots.
- IA: el criterio editorial (src/lib/ia.ts e ia.server.ts) llama a Gemini directamente con la clave propia GEMINI_API_KEY (secreto) y su nivel gratuito, sin pasar por la pasarela de IA de Lovable. Es una excepción DELIBERADA de la propietaria para no gastar créditos: no la migres a la pasarela sin que lo pida. Solo se envía información pública (temas, titulares, fuentes) y el perfil/ámbito/excepciones de config. Si la IA falla, deciden las reglas; no debe impedir crear alertas.
