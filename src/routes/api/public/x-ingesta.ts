import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';
export const Route = createFileRoute('/api/public/x-ingesta')({
  server: { handlers: {
    POST: async ({ request }) => {
      const denied = await authenticateCronRequest(request);
      if (denied) return denied;
      let input: { ignorar_horario?: boolean | undefined };
      try {
        const text = await request.text();
        if (text.length > 1024) return Response.json({ error: 'Solicitud demasiado grande.' }, { status: 400 });
        input = z.object({ ignorar_horario: z.boolean().optional() }).strict().parse(text.trim() ? JSON.parse(text) : {});
      } catch { return Response.json({ error: 'JSON no válido. Solo se admite ignorar_horario como booleano.' }, { status: 400 }); }
      try {
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { ingestarX } = await import('@/lib/xIngesta.server');
        const result = await ingestarX(supabaseAdmin, input.ignorar_horario === true);
        console.info(`[x-ingesta] ${result.saltada ? result.mensaje : `${result.filas_guardadas} filas guardadas.`}`);
        return Response.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const safe = /^(Apify respondió con HTTP \d+\.|Apify devolvió|Apify excedió|No se pudo|No se pudieron)/.test(message) ? message : 'No se pudo completar la lectura de X.';
        console.error(`[x-ingesta] ${safe}`);
        return Response.json({ error: safe }, { status: 502 });
      }
    },
    GET: async () => new Response('Unauthorized', { status: 401 }),
  } },
});