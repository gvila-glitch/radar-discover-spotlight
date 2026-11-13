import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';

describe.skipIf(!process.env['AGW_URL'])('Alertas ficticias cargadas', () => {
  function rows(sql: string) {
    return JSON.parse(execFileSync('lovable', ['supabase', 'query', '--json', sql], { encoding: 'utf8' })).rows as Record<string, unknown>[];
  }
  it('hay ocho pruebas con el reparto solicitado', () => {
    const data = rows("select estado, count(*)::int as n from public.alertas where entidad like '[PRUEBA] %' group by estado");
    expect(Object.fromEntries(data.map(r => [r['estado'], r['n']]))).toEqual({ pendiente: 3, util: 2, ruido: 1, publicada: 2 });
  });
  it('valores, fechas y señales cumplen los límites de la prueba', () => {
    const data = rows(`select count(*)::int as invalidas from public.alertas where entidad like '[PRUEBA] %' and (
      medios_discover not between 0 and 7 or cardinality(medios_lista) <> medios_discover
      or creada_en < now() - interval '3 days' or creada_en > now()
      or (estado <> 'pendiente' and estado_por is distinct from 'prueba@example.com')
      or (trends_activo and (trends_crecimiento is null or trends_crecimiento !~ '^[0-9]+[+]$'))
      or exists(select 1 from unnest(medios_lista) m where m !~ '^Medio [A-G]$')
      or exists(select 1 from jsonb_array_elements(titulares_seo) t where t->>'titular' not like 'Titular de ejemplo%'))`);
    expect(data[0]?.['invalidas']).toBe(0);
  });
  it('incluye ambas prioridades, señales ausentes y una pieza HTTPS', () => {
    const data = rows(`select count(distinct prioridad)::int as prioridades,
      count(*) filter(where x_posicion is null)::int as sin_x,
      count(*) filter(where not trends_activo)::int as sin_trends,
      count(*) filter(where estado='publicada' and pieza_url like 'https://%')::int as enlaces
      from public.alertas where entidad like '[PRUEBA] %'`);
    expect(data[0]?.['prioridades']).toBe(2);
    expect(Number(data[0]?.['sin_x'])).toBeGreaterThan(0);
    expect(Number(data[0]?.['sin_trends'])).toBeGreaterThan(0);
    expect(data[0]?.['enlaces']).toBe(1);
  });
});
it('la limpieza guardada afecta solo a entidades etiquetadas PRUEBA', () => {
  expect(readFileSync('supabase/limpiar_pruebas.sql', 'utf8')).toContain("delete from alertas where entidad like '[PRUEBA] %';");
});