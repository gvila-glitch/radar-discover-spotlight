// @vitest-environment node
// Run only against an isolated disposable PostgreSQL database, never the managed DB.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { readFile } from "node:fs/promises";
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { conBloqueoRadar } from './jobLock.server';
import { ingestX } from './xIngesta';
import { vi } from 'vitest';

const url = process.env["RADAR_TEST_DATABASE_URL"];
if (url) {
  const target = new URL(url);
  if (target.hostname !== "127.0.0.1" || target.port !== "55432") {
    throw new Error("Concurrency tests require the disposable local database on 127.0.0.1:55432.");
  }
}
describe.skipIf(!url)("transactional Trends concurrency (real PostgreSQL)", () => {
  const db = postgres(url ?? "postgres://localhost/unused", { max: 4, ssl: false });
  const candidates = (names: string[]) =>
      names.map((entidad) => ({
        entidad,
        contexto: "Titular de ejemplo de concurrencia",
        trends_crecimiento: "2000+",
      }));
  beforeAll(async () => {
    await db.unsafe(`DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
      END $$;
      create table public.config (clave text primary key, valor text);
      create table public.alertas (
        id bigint generated always as identity primary key, creada_en timestamptz default now(),
        entidad text not null, contexto text, prioridad text, trends_activo boolean, trends_crecimiento text,
        x_posicion integer, x_desde timestamptz, medios_discover integer, medios_lista text[], titulares_seo jsonb,
        angulo text, seccion_sugerida text, motivo_afinidad text, estado text);
      insert into public.config values ('max_alertas_dia','8'), ('hora_inicio','0'), ('hora_fin','24');`);
    await db.unsafe(await readFile("supabase/migrations/0005_trends_alertas_atomicas.sql", "utf8"));
    await db.unsafe(await readFile('drizzle/migrations/0005_bloqueos_ejecuciones_radar.sql', 'utf8'));
  });
  beforeEach(async () => {
    await db`delete from public.alertas`;
    await db`delete from public.config where clave like '__job_lock_%'`;
  });
  afterAll(async () => {
    await db.end();
  });

  // Deliberately hold the real lock; confirm both sessions are waiting before release.
  async function overlap(first: string[], second: string[]) {
    let release: () => void = () => {};
    let ready: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const blocker = db.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(734210, 1)`;
      ready();
      await gate;
    });
    await locked;
    const one =
      db`select public.guardar_alertas_trends_atomicas(${db.json(candidates(first))}::jsonb) as result`.execute();
    const two =
      db`select public.guardar_alertas_trends_atomicas(${db.json(candidates(second))}::jsonb) as result`.execute();
    let waiting = 0;
    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        const rows =
          await db`select count(*)::int as count from pg_locks where locktype = 'advisory' and not granted and classid = 734210 and objid = 1`;
        waiting = rows[0]?.["count"] ?? 0;
        if (waiting === 2) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } finally {
      release();
    }
    const results = await Promise.all([one, two]);
    await blocker;
    expect(waiting).toBe(2);
    return results.map((rows) => rows[0]?.["result"]);
  }

  it("two overlapping executions cannot duplicate a normalized entity", async () => {
    const results = await overlap(["[PRUEBA] Debate Ficticio"], ["DEBATE FICTICIO"]);
    expect(results.map((r) => r.creadas.length).sort()).toEqual([0, 1]);
    expect(results.flatMap((r) => r.descartadas).map((d) => d.motivo)).toEqual(["ya_avisada"]);
    const count = await db`select count(*)::int as total from public.alertas`;
    expect(count[0]?.["total"]).toBe(1);
  });
  it("two overlapping executions cannot exceed max_alertas_dia=8 with one place left", async () => {
    await db`insert into public.alertas (entidad) select 'Existente ' || n from generate_series(1,7) n`;
    const results = await overlap(["[PRUEBA] Tema A"], ["[PRUEBA] Tema B"]);
    expect(results.map((r) => r.creadas.length).sort()).toEqual([0, 1]);
    expect(results.flatMap((r) => r.descartadas).map((d) => d.motivo)).toEqual(["tope_diario"]);
    const count = await db`select count(*)::int as total from public.alertas`;
    expect(count[0]?.["total"]).toBe(8);
  });
  it("rollback releases the lock and removes the entire failed batch", async () => {
    const batch = [{ entidad: "[PRUEBA] Válida" }, { entidad: null }];
    // Null is discarded, so provoke a SQL error by passing a non-array, then call again.
    await expect(db`select public.guardar_alertas_trends_atomicas('{}'::jsonb)`).rejects.toThrow();
    await db
      .begin(async (tx) => {
        await tx`select public.guardar_alertas_trends_atomicas(${tx.json(batch)}::jsonb)`;
        throw new Error("forced rollback");
      })
      .catch((error) => {
        expect(error.message).toBe("forced rollback");
      });
    const rows =
      await db`select public.guardar_alertas_trends_atomicas(${db.json(candidates(["[PRUEBA] Válida"]))}::jsonb) as result`;
    expect(rows[0]?.["result"].creadas).toHaveLength(1);
    const count = await db`select count(*)::int as total from public.alertas`;
    expect(count[0]?.["total"]).toBe(1);
  });
  it("ordinary users and anonymous callers cannot execute the privileged RPC", async () => {
    const rows =
      await db`select has_function_privilege('anon', 'public.guardar_alertas_trends_atomicas(jsonb)', 'EXECUTE') as anon,
      has_function_privilege('authenticated', 'public.guardar_alertas_trends_atomicas(jsonb)', 'EXECUTE') as usuario,
      has_function_privilege('service_role', 'public.guardar_alertas_trends_atomicas(jsonb)', 'EXECUTE') as interno`;
    expect(rows[0]).toMatchObject({ anon: false, usuario: false, interno: true });
  });

  // Adapter to the real applied PostgreSQL RPCs, never a managed database or Apify.
  const client = { rpc: async (fn: string, args: { trabajo: string; propietario: string }) => {
    const rows = fn === 'adquirir_bloqueo_radar'
      ? await db`select public.adquirir_bloqueo_radar(${args.trabajo}, ${args.propietario}::uuid) as result`
      : await db`select public.liberar_bloqueo_radar(${args.trabajo}, ${args.propietario}::uuid) as result`;
    return { data: rows[0]?.['result'], error: null };
  } } as unknown as SupabaseClient<Database>;

  async function twoExecutions(trabajo: 'x-ingesta' | 'trends-a-alertas', action: () => Promise<unknown>) {
    let release: () => void = () => {}; let entered: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const one = conBloqueoRadar(client, trabajo, async () => { entered(); await gate; return action(); });
    await started;
    let second: unknown;
    try { second = await conBloqueoRadar(client, trabajo, action); } finally { release(); }
    return [await one, second];
  }

  it('X simultaneous executions make exactly one simulated Apify call and one save', async () => {
    const fetchApify = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ rank: 1, name: 'Tema simulado' }])));
    const save = vi.fn().mockResolvedValue(undefined);
    const results = await twoExecutions('x-ingesta', () => ingestX({
      now: new Date(), config: { hora_inicio: '0', hora_fin: '24' }, capturas: [],
      token: () => 'mock-not-real', save, fetchApify,
    }));
    expect(fetchApify).toHaveBeenCalledTimes(1); expect(save).toHaveBeenCalledTimes(1);
    expect(results[1]).toMatchObject({ saltada: true, motivo: 'ejecucion_en_curso', filas_guardadas: 0 });
    const locks = await db`select count(*)::int as total from public.config where clave like '__job_lock_%'`;
    expect(locks[0]?.['total']).toBe(0);
  });

  it('Trends simultaneous executions act once, create no duplicate and keep max_alertas_dia=8', async () => {
    await db`insert into public.alertas (entidad) select 'Existente ' || n from generate_series(1,7) n`;
    const action = vi.fn(async () => {
      const rows = await db`select public.guardar_alertas_trends_atomicas(${db.json(candidates(['[PRUEBA] Tema único', '[PRUEBA] Tema único']))}::jsonb) as result`;
      return rows[0]?.['result'];
    });
    const results = await twoExecutions('trends-a-alertas', action);
    expect(action).toHaveBeenCalledTimes(1);
    expect(results[1]).toMatchObject({ saltada: true, motivo: 'ejecucion_en_curso', alertas_creadas: 0 });
    const rows = await db`select count(*)::int as total, count(*) filter (where entidad='[PRUEBA] Tema único')::int as nuevas from public.alertas`;
    expect(rows[0]).toMatchObject({ total: 8, nuevas: 1 });
  });

  it('failed execution releases ownership; another owner cannot unlock; no unsafe automatic expiry', async () => {
    await expect(conBloqueoRadar(client, 'x-ingesta', async () => { throw new Error('simulated failure'); })).rejects.toThrow('simulated failure');
    const owner = crypto.randomUUID(); const other = crypto.randomUUID();
    expect((await client.rpc('adquirir_bloqueo_radar', { trabajo: 'x-ingesta', propietario: owner })).data).toBe(true);
    expect((await client.rpc('liberar_bloqueo_radar', { trabajo: 'x-ingesta', propietario: other })).data).toBe(false);
    expect((await client.rpc('adquirir_bloqueo_radar', { trabajo: 'x-ingesta', propietario: other })).data).toBe(false);
    expect((await client.rpc('liberar_bloqueo_radar', { trabajo: 'x-ingesta', propietario: owner })).data).toBe(true);
  });

  it('execution lock RPCs reject anonymous and ordinary users', async () => {
    const rows = await db`select has_function_privilege('anon', 'public.adquirir_bloqueo_radar(text,uuid)', 'EXECUTE') as anon,
      has_function_privilege('authenticated', 'public.liberar_bloqueo_radar(text,uuid)', 'EXECUTE') as usuario,
      has_function_privilege('service_role', 'public.adquirir_bloqueo_radar(text,uuid)', 'EXECUTE') as interno`;
    expect(rows[0]).toMatchObject({ anon: false, usuario: false, interno: true });
  });
});
