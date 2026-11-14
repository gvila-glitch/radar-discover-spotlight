import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';

const gateway = process.env['AGW_URL'];
describe.skipIf(!gateway)('Permisos reales del panel', () => {
  async function query(sql: string) {
    const result = JSON.parse(execFileSync('lovable', ['supabase', 'query', '--json', sql], { encoding: 'utf8' }));
    return result.rows as Record<string, unknown>[];
  }
  it('las trece tablas tienen RLS y anon no puede leerlas', async () => {
    const rows = await query(`select c.relname, c.relrowsecurity as rls,
      has_table_privilege('anon', c.oid, 'SELECT') as anon_read
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r'`);
    expect(rows).toHaveLength(13);
    for (const row of rows) { expect(row['rls']).toBe(true); expect(row['anon_read']).toBe(false); }
  });
  it('solo las cuatro columnas de valoración pueden actualizarse', async () => {
    const rows = await query(`select column_name from information_schema.columns
      where table_schema='public' and table_name='alertas'
      and has_column_privilege('authenticated', 'public.alertas', column_name, 'UPDATE')
      order by column_name`);
    expect(rows.map(r => r['column_name'])).toEqual(['estado','estado_actualizado_en','estado_por','pieza_url']);
  });
  it('solo alertas, ajustes de config y medios tienen políticas', async () => {
    const rows = await query(`select tablename from pg_policies where schemaname='public' order by tablename`);
    // subscriptions quedó retirada junto con Stripe; conserva su política de solo dueño mientras exista la tabla.
    expect(rows.map(r => r['tablename'])).toEqual(['alertas', 'alertas', 'config', 'config', 'medios_referencia', 'medios_referencia', 'medios_referencia', 'medios_referencia', 'subscriptions']);
  });
  it('equipo se valida mediante el email del JWT, no metadatos editables', async () => {
    const rows = await query(`select prosrc, prosecdef from pg_proc where oid='public.es_equipo()'::regprocedure`);
    expect(rows[0]?.['prosecdef']).toBe(true);
    expect(rows[0]?.['prosrc']).toContain("email = auth.jwt()->>'email'");
  });
  it('config conserva los valores operativos solicitados', async () => {
    const rows = await query("select clave, valor from public.config where clave not like '__job_lock_%' order by clave");
    // config ha crecido con más ajustes editoriales; aquí solo se fijan los operativos.
    expect(Object.fromEntries(rows.map(r => [r['clave'], r['valor']]))).toMatchObject({ max_alertas_dia: '8', hora_inicio: '7', hora_fin: '24', umbral_alta_medios: '2', umbral_media_medios: '5' });
  });
  it('la limpieza elimina solo artículos de más de 30 días', async () => {
    const rows = await query(`select prosrc from pg_proc where oid='public.limpiar_snoop()'::regprocedure`);
    expect(rows[0]?.['prosrc']).toContain("recibido_en < now() - interval '30 days'");
  });
  it('no hay ejemplos antiguos sin la etiqueta PRUEBA', async () => {
    const rows = await query("select count(*)::int as total from public.alertas where entidad in ('Negociación de los Presupuestos', 'IPC adelantado', 'Cambios en la PAU')");
    expect(rows[0]?.['total']).toBe(0);
  });
});