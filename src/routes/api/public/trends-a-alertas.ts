import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';

export const Route = createFileRoute('/api/public/trends-a-alertas')({
  server: { handlers: {
    POST: async ({ request }) => {
      const denied = await authenticateCronRequest(request);
      if (denied) return denied;
      const body = await request.text();
      try {
        if (!z.object({}).strict().safeParse(body.trim() ? JSON.parse(body) : {}).success) {
          return Response.json({ error: 'La llamada solo admite un objeto vacío.' }, { status: 400 });
        }
      } catch { return Response.json({ error: 'JSON no válido.' }, { status: 400 }); }
      try {
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { convertirTrendsEnAlertas } = await import('@/lib/trendsAlertas.server');
        return Response.json(await convertirTrendsEnAlertas(supabaseAdmin));
      } catch {
        return Response.json({ error: 'No se pudo completar la conversión de Trends a alertas.' }, { status: 502 });
      }
    },
    GET: async () => new Response('Unauthorized', { status: 401 }),
  } },
});