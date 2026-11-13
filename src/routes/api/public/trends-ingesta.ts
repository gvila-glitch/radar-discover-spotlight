import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';
import { ingestTrends } from '@/lib/trendsIngesta';
export const Route = createFileRoute('/api/public/trends-ingesta')({
  server: { handlers: {
    POST: async ({ request }) => {
      const denied = await authenticateCronRequest(request);
      if (denied) return denied;
      try {
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const result = await ingestTrends(async rows => {
          // One atomic batch; capturado_en uses the database default.
          const { error } = await supabaseAdmin.from('trends').insert(rows);
          if (error) throw new Error('No se pudo guardar la lectura de Google Trends.');
        });
        console.info(`[trends-ingesta] ${result.filas_guardadas} filas guardadas.`);
        return Response.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const safe = /^(Google Trends|No se pudo)/.test(message) ? message : 'No se pudo completar la lectura de Google Trends.';
        console.error(`[trends-ingesta] ${safe}`);
        return Response.json({ error: safe }, { status: 502 });
      }
    },
    GET: async () => new Response('Unauthorized', { status: 401 }),
  } },
});
