import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/api/public/payments/webhook')({ server: { handlers: {
  POST: async ({ request }) => {
    if (new URL(request.url).searchParams.get('env') !== 'sandbox') return new Response('Test only', { status: 400 });
    const { verificarEvento, syncSubscription } = await import('@/lib/premium.server');
    let event;
    try { event = await verificarEvento(request); }
    catch { return new Response('Invalid signature', { status: 400 }); }
    try {
      if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
        const { createStripeClient } = await import('@/lib/stripe.server');
        // Reconcile current provider state, not an old/replayed event payload.
        const current = await createStripeClient('sandbox').subscriptions.retrieve(event.data.object.id);
        await syncSubscription(current, 'sandbox');
      }
      return Response.json({ received: true });
    } catch { return new Response('Subscription sync failed', { status: 500 }); }
  },
} } });
