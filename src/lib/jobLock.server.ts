import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export async function conBloqueoRadar<T>(client: SupabaseClient<Database>, trabajo: 'x-ingesta' | 'trends-a-alertas' | 'wikipedia-a-alertas', actuar: () => Promise<T>) {
  // An ownership identifier, not a credential. The service-role-only RPC verifies access.
  const propietario = crypto.randomUUID();
  const { data, error } = await client.rpc('adquirir_bloqueo_radar', { trabajo, propietario });
  if (error) throw new Error('No se pudo adquirir el bloqueo de ejecución. No se ejecutó el trabajo.');
  if (data !== true) return { saltada: true, motivo: 'ejecucion_en_curso', mensaje: 'Ejecución saltada: otra ejecución tiene el bloqueo.', filas_guardadas: 0, alertas_creadas: 0 } as const;
  try { return await actuar(); }
  finally {
    const { data: released, error: releaseError } = await client.rpc('liberar_bloqueo_radar', { trabajo, propietario });
    if (releaseError) {
      console.error(`[${trabajo}] No se pudo liberar el bloqueo; caducará automáticamente a los cinco minutos de su adquisición.`);
      throw new Error('No se pudo liberar el bloqueo; caducará automáticamente a los cinco minutos.');
    }
    if (released !== true) {
      // A previous owner must never release a lease acquired after its expiry.
      console.warn(`[${trabajo}] El bloqueo ya no pertenece a esta ejecución.`);
    }
  }
}