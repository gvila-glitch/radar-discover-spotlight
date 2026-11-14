import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { PREMIUM, exigirPruebas } from './premium';

const input = z.object({ environment: z.literal('sandbox') });
export const consultarPremium = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.extend({ sessionId: z.string().regex(/^cs_test_[a-zA-Z0-9_]+$/).optional() }).parse(data))
  .handler(async ({ data, context }) => {
    const { createStripeClient, getStripeErrorMessage } = await import('./stripe.server');
    try {
      const { data: equipo, error } = await context.supabase.rpc('es_equipo');
      if (error || !equipo) throw new Error('Tu cuenta no tiene acceso a este panel.');
      exigirPruebas(data.environment);
      const stripe = createStripeClient(data.environment);
      const { syncSubscription } = await import('./premium.server');
      if (data.sessionId) {
        const session = await stripe.checkout.sessions.retrieve(data.sessionId);
        if (session.metadata?.['userId'] !== context.userId) throw new Error('No tienes acceso a este pago.');
        if (typeof session.subscription === 'string') await syncSubscription(await stripe.subscriptions.retrieve(session.subscription), data.environment);
      }
      const { data: rows, error: readError } = await context.supabase.from('subscriptions').select('status,current_period_end,cancel_at_period_end')
        .eq('user_id', context.userId).eq('environment', data.environment).eq('price_id', PREMIUM.priceId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (readError) throw new Error('No se pudo consultar tu suscripción.');
      return { subscription: rows };
    } catch (error) { return { error: getStripeErrorMessage(error) }; }
  });

export const iniciarPremium = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data)).handler(async ({ data, context }) => {
    const { createStripeClient, getStripeErrorMessage } = await import('./stripe.server');
    try {
      exigirPruebas(data.environment);
      const { data: equipo, error } = await context.supabase.rpc('es_equipo');
      if (error || !equipo) throw new Error('Tu cuenta no tiene acceso a este panel.');
      const { data: { user } } = await context.supabase.auth.getUser();
      const stripe = createStripeClient(data.environment);
      const { resolveOrCreateCustomer } = await import('./premium.server');
      const customer = await resolveOrCreateCustomer(stripe, { userId: context.userId, ...(user?.email && { email: user.email }) });
      const subscriptions = await stripe.subscriptions.list({ customer, status: 'all', limit: 100 });
      if (subscriptions.data.some(s => ['active','trialing','past_due','incomplete','unpaid','paused'].includes(s.status) && s.items.data.some(i => i.price.lookup_key === PREMIUM.priceId))) throw new Error('Ya tienes una suscripción o un pago pendiente.');
      const openSessions = await stripe.checkout.sessions.list({ customer, status: 'open', limit: 100 });
      const previous = openSessions.data.find(s => s.metadata?.['priceId'] === PREMIUM.priceId);
      if (previous?.client_secret) return { clientSecret: previous.client_secret };
      const prices = await stripe.prices.list({ lookup_keys: [PREMIUM.priceId], active: true, limit: 1 });
      const price = prices.data[0];
      if (!price || price.unit_amount !== PREMIUM.amount || price.currency !== PREMIUM.currency || price.recurring?.interval !== PREMIUM.interval) throw new Error('La cuota Premium no está configurada correctamente.');
      const origin = new URL(getRequest().url).origin;
      const session = await stripe.checkout.sessions.create({
        customer, line_items: [{ price: price.id, quantity: 1 }], mode: 'subscription', ui_mode: 'embedded_page',
        return_url: `${origin}/premium?session_id={CHECKOUT_SESSION_ID}`, locale: 'es',
        automatic_tax: { enabled: true }, customer_update: { address: 'auto' },
        metadata: { userId: context.userId, priceId: PREMIUM.priceId }, subscription_data: { metadata: { userId: context.userId } },
      }, { idempotencyKey: `premium-${context.userId}-${Math.floor(Date.now() / 300000)}` });
      if (!session.client_secret) throw new Error('El pago no devolvió un formulario.');
      return { clientSecret: session.client_secret };
    } catch (error) { return { error: getStripeErrorMessage(error) }; }
  });

export const cancelarPremium = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data)).handler(async ({ data, context }) => {
    const { createStripeClient, getStripeErrorMessage } = await import('./stripe.server');
    try {
      exigirPruebas(data.environment);
      const { data: equipo } = await context.supabase.rpc('es_equipo');
      if (!equipo) throw new Error('Sin acceso al panel.');
      const { data: sub } = await context.supabase.from('subscriptions').select('stripe_subscription_id')
        .eq('user_id', context.userId).eq('environment', data.environment).eq('price_id', PREMIUM.priceId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!sub) throw new Error('No tienes una suscripción.');
      const stripe = createStripeClient(data.environment);
      const current = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
      if (current.metadata['userId'] !== context.userId) throw new Error('Sin acceso a esta suscripción.');
      const updated = await stripe.subscriptions.update(current.id, { cancel_at_period_end: true });
      const { syncSubscription } = await import('./premium.server');
      await syncSubscription(updated, data.environment);
      return { ok: true };
    } catch (error) { return { error: getStripeErrorMessage(error) }; }
  });
