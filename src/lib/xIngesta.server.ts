import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { inicioDiaMadrid } from './trendsAlertas';
import { ingestX } from './xIngesta';
import { conBloqueoRadar } from './jobLock.server';

export async function ingestarX(client: SupabaseClient<Database>, ignorarHorario = false, now = new Date()) {
  return conBloqueoRadar(client, 'x-ingesta', () => ejecutarX(client, ignorarHorario, now));
}

async function ejecutarX(client: SupabaseClient<Database>, ignorarHorario: boolean, now: Date) {
  const { data: settings, error: configError } = await client.from('config').select('clave,valor').in('clave', ['hora_inicio', 'hora_fin']);
  if (configError) throw new Error('No se pudo leer la configuración. No se llamó a Apify.');
  const since = new Date(Math.min(inicioDiaMadrid(now).getTime(), now.getTime() - 45 * 60_000));
  const capturas: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from('x_tendencias').select('capturado_en').gte('capturado_en', since.toISOString()).lte('capturado_en', now.toISOString()).order('id', { ascending: true }).range(offset, offset + 999);
    if (error) throw new Error('No se pudieron comprobar las capturas anteriores. No se llamó a Apify.');
    for (const row of data ?? []) if (row.capturado_en) capturas.push(row.capturado_en);
    if (!data || data.length < 1000) break;
  }
  return ingestX({ now, capturas, config: Object.fromEntries((settings ?? []).map(row => [row.clave, row.valor])), ignorarHorario,
    token: () => process.env['APIFY_TOKEN'],
    save: async rows => {
      // Atomic batch, identical database-default capture timestamp for all rows.
      const { error } = await client.from('x_tendencias').insert(rows);
      if (error) throw new Error('No se pudo guardar la captura de X.');
    },
  });
}