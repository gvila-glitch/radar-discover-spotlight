import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';

export const Route = createFileRoute('/api/public/wikipedia-a-alertas')({
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
        const { wikipediaAAlertas } = await import('@/lib/wikipediaPicos.server');
        return Response.json(await wikipediaAAlertas(supabaseAdmin));
      } catch {
        return Response.json({ error: 'No se pudo completar la lectura de picos de Wikipedia.' }, { status: 502 });
      }
    },
    GET: async () => new Response('Unauthorized', { status: 401 }),
  } },
});