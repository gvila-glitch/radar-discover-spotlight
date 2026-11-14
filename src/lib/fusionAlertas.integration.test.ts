// @vitest-environment node
// Real SQL in a disposable database only; no production writes or provider calls.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
import { entidadesEquivalentes, planificarAlertasTrends } from './trendsAlertas';
import { planificarAlertasWikipedia } from './wikipediaPicos';

const url = process.env['RADAR_FUSION_TEST_DATABASE_URL'];
if (url) {
  const target = new URL(url);
  if (target.hostname !== '127.0.0.1' || target.port !== '55433' || target.pathname !== '/postgres') {
    throw new Error('Fusion tests require the disposable database at 127.0.0.1:55433/postgres.');
  }
}

describe.skipIf(!url)('source fusion using the deployed SQL migration', () => {
  const db = postgres(url ?? 'postgres://localhost/unused', { max: 4, ssl: false });
  const rpc = async (source: 'trends' | 'wikipedia', rows: object[]) => {
    const result = source === 'trends'
      ? await db`select public.guardar_alertas_trends_atomicas(${db.json(rows)}::jsonb) as result`
      : await db`select public.guardar_alertas_wikipedia_atomicas(${db.json(rows)}::jsonb) as result`;
    return result[0]?.['result'];
  };
  const seed = async (entidad = '[PRUEBA] Marina Valverde') => {
    const rows = await db`insert into public.alertas(entidad) values (${entidad}) returning id`;
    return rows[0]?.['id'];
  };
  beforeAll(async () => {
    await db.unsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
      END $$;
      DROP TABLE IF EXISTS public.alertas CASCADE;
      DROP TABLE IF EXISTS public.config CASCADE;
      CREATE TABLE public.config(clave text PRIMARY KEY, valor text);
      CREATE TABLE public.alertas(
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, creada_en timestamptz NOT NULL DEFAULT now(),
        entidad text NOT NULL, contexto text NOT NULL DEFAULT 'Contexto original', prioridad text DEFAULT 'media',
        trends_activo boolean NOT NULL DEFAULT false, trends_crecimiento text,
        x_posicion integer, x_desde timestamptz, wikipedia_visitas integer, wikipedia_ratio numeric,
        medios_discover integer DEFAULT 0, medios_lista text[] DEFAULT '{}', titulares_seo jsonb DEFAULT '[]',
        angulo text DEFAULT '', seccion_sugerida text DEFAULT 'Sin sugerir',
        motivo_afinidad text DEFAULT 'Sin clasificar', estado text DEFAULT 'pendiente');
      INSERT INTO public.config VALUES ('max_alertas_dia','8'),('hora_inicio','0'),('hora_fin','24');
    `);
    await db.unsafe(await readFile('drizzle/migrations/0015_fusion_alertas_fuentes.sql', 'utf8'));
  });
  beforeEach(async () => {
    await db`delete from public.alertas`;
    await db`update public.config set valor = case clave when 'max_alertas_dia' then '8' when 'hora_inicio' then '0' else '24' end`;
  });
  afterAll(async () => { await db.end(); });

  it('X, Trends and Wikipedia enrich the same ID; replay creates no duplicate', async () => {
    const id = await seed();
    const x = { entidad: '[SIN DISCOVER] Marina Valverde', x_posicion: 7, x_desde: '2026-11-14T12:00:00Z', trends_activo: false };
    const trends = { entidad: 'Marina Valverde', trends_activo: true, trends_crecimiento: '2000+' };
    const wiki = { entidad: 'Marina Valverde (política)', wikipedia_visitas: 12000, wikipedia_ratio: 4 };
    for (const [source, candidate] of [['trends', x], ['trends', trends], ['wikipedia', wiki]] as const) {
      const result = await rpc(source, [candidate]);
      expect(result.creadas).toHaveLength(0);
      expect(result.combinadas).toHaveLength(1);
      expect(result.combinadas[0].id).toBe(Number(id));
      expect(result.total_hoy_antes).toBe(1);
      expect(result.total_hoy_despues).toBe(1);
    }
    const rows = await db`select * from public.alertas`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id, x_posicion: 7, trends_activo: true, trends_crecimiento: '2000+', wikipedia_visitas: 12000 });
    expect(Number(rows[0]?.['wikipedia_ratio'])).toBe(4);
    const before = rows[0]?.['contexto'];
    for (const [source, candidate] of [['trends', x], ['trends', trends], ['wikipedia', wiki]] as const) {
      const result = await rpc(source, [candidate]);
      expect(result.creadas).toHaveLength(0);
      expect(result.combinadas).toHaveLength(0);
      expect(result.descartadas[0].motivo).toBe('ya_avisada');
    }
    expect((await db`select contexto from public.alertas`)[0]?.['contexto']).toBe(before);
  });

  it('all three sources still merge at max_alertas_dia=8 without using a ninth slot', async () => {
    await seed();
    await db`insert into public.alertas(entidad) select 'Tema ficticio ' || n from generate_series(1,7) n`;
    for (const [source, candidate] of [
      ['trends', { entidad: 'Marina Valverde', x_posicion: 2, trends_activo: false }],
      ['trends', { entidad: 'Marina Valverde', trends_crecimiento: '500+' }],
      ['wikipedia', { entidad: 'Marina Valverde', wikipedia_visitas: 9000, wikipedia_ratio: 3 }],
    ] as const) {
      const result = await rpc(source, [candidate]);
      expect(result.combinadas).toHaveLength(1);
      expect(result.creadas).toHaveLength(0);
      expect(result.total_hoy_despues).toBe(8);
    }
    const blocked = await rpc('trends', [{ entidad: 'Asunto completamente nuevo' }]);
    expect(blocked.descartadas[0].motivo).toBe('tope_diario');
    expect((await db`select count(*)::int as total from public.alertas`)[0]?.['total']).toBe(8);
  });

  for (const source of ['trends', 'wikipedia'] as const) {
    it(`${source}: four combinations plus three creations leave the three-creation limit intact`, async () => {
      for (const name of ['alondra', 'bruma', 'cascada', 'duna']) await seed('existente ' + name);
      await db`update public.config set valor='20' where clave='max_alertas_dia'`;
      const signal = source === 'trends' ? { trends_crecimiento: '2000+' } : { wikipedia_visitas: 12000, wikipedia_ratio: 4 };
      const fresh = ['presupuestos municipales', 'reforma tributaria', 'infraestructuras ferroviarias', 'educacion superior'].map(entidad => ({ entidad, ...signal }));
      const merges = ['alondra', 'bruma', 'cascada', 'duna'].map(name => ({ entidad: 'existente ' + name, ...signal }));
      const result = await rpc(source, [...fresh.slice(0, 3), ...merges, fresh[3] ?? {}]);
      expect(result.creadas).toHaveLength(3);
      expect(result.combinadas).toHaveLength(4);
      expect(result.descartadas).toEqual([{ termino: 'educacion superior', motivo: 'limite_ejecucion' }]);
      expect(result.total_hoy_antes).toBe(4);
      expect(result.total_hoy_despues).toBe(7);
    });
  }

  it('real planning passes existing X, Trends and Wikipedia candidates even when the daily cap is full', async () => {
    const now = new Date();
    const config = { max_alertas_dia: '8', hora_inicio: '0', hora_fin: '24' };
    const plan = planificarAlertasTrends({ now, config, totalHoy: 8, exclusiones: [],
      alertas: [{ entidad: 'Marina Valverde', creada_en: now.toISOString() }],
      trends: [{ id: 1, termino: 'Marina Valverde', volumen: '2000+', capturado_en: now.toISOString(), noticias: [] }],
      xTendencias: [{ id: 1, nombre: 'Marina Valverde', posicion: 7, capturado_en: now.toISOString() }],
    });
    expect(plan.nuevas).toHaveLength(0);
    expect(plan.fusiones).toHaveLength(1);
    expect(plan.fusiones[0]).toMatchObject({ x_posicion: 7, trends_crecimiento: '2000+' });
    const wiki = planificarAlertasWikipedia({ entidadesRecientes: ['Marina Valverde'], exclusiones: [],
      picos: [{ articulo: 'Marina Valverde', visitas: 12000, media_previa: 3000, ratio: 4 }] });
    expect(wiki.nuevas).toHaveLength(0);
    expect(wiki.fusiones).toHaveLength(1);
    await seed();
    const saved = await rpc('trends', plan.fusiones);
    const savedWiki = await rpc('wikipedia', wiki.fusiones);
    expect(saved.combinadas).toHaveLength(1);
    expect(savedWiki.combinadas).toHaveLength(1);
    expect((await db`select count(*)::int as total from public.alertas`)[0]?.['total']).toBe(1);
  });

  it('Marina Valverde and Pablo Valverde remain separate; surname alone is ambiguous', async () => {
    const marina = await seed();
    expect(entidadesEquivalentes('Marina Valverde', 'Pablo Valverde')).toBe(false);
    const result = await rpc('trends', [{ entidad: 'Pablo Valverde', x_posicion: 5, trends_activo: false }]);
    expect(result.creadas).toHaveLength(1);
    expect(result.combinadas).toHaveLength(0);
    const ambiguity = await db`select public.fusionar_alerta_reciente(${db.json({ entidad: 'Valverde', wikipedia_visitas: 10000, wikipedia_ratio: 5 })}::jsonb, clock_timestamp()) as result`;
    expect(ambiguity[0]?.['result']).toBeNull();
    const exact = await rpc('wikipedia', [{ entidad: 'Marina Valverde', wikipedia_visitas: 12000, wikipedia_ratio: 4 }]);
    expect(exact.combinadas[0].id).toBe(Number(marina));
    const rows = await db`select entidad, x_posicion, wikipedia_ratio from public.alertas order by id`;
    expect(rows).toHaveLength(2);
    expect(rows[0]?.['x_posicion']).toBeNull();
    expect(rows[1]?.['wikipedia_ratio']).toBeNull();
  });

  // Expected-failure regressions document existing unsafe behavior, not a fix.
  it.fails('KNOWN DEFECT: uppercase names must match the same entity', async () => {
    await seed();
    const result = await rpc('trends', [{ entidad: 'MARINA VALVERDE', x_posicion: 7, trends_activo: false }]);
    expect(result.combinadas).toHaveLength(1);
    expect(result.creadas).toHaveLength(0);
  });
  it.fails('KNOWN DEFECT: an extra given name must not conflate two distinct people', async () => {
    await seed('Juan Valverde');
    const result = await rpc('wikipedia', [{ entidad: 'Juan Carlos Valverde', wikipedia_visitas: 12000, wikipedia_ratio: 4 }]);
    expect(result.combinadas).toHaveLength(0);
    expect(result.creadas).toHaveLength(1);
  });
  it.fails('KNOWN DEFECT: disambiguating parentheses must not conflate two namesakes', async () => {
    await seed('Marina Valverde (política)');
    const result = await rpc('trends', [{ entidad: 'Marina Valverde (cantante)', x_posicion: 5, trends_activo: false }]);
    expect(result.combinadas).toHaveLength(0);
    expect(result.creadas).toHaveLength(1);
  });
});