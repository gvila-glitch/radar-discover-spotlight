import type Stripe from 'stripe';
import { createStripeClient } from './stripe.server';
import { PREMIUM } from './premium';

// Customer identity is derived only from the authenticated caller.
export async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId?: string },
): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) throw new Error('Invalid userId');
  if (options.userId) {
    const found = await stripe.customers.search({ query: `metadata['userId']:'${options.userId}'`, limit: 1 });
    const first = found.data[0];
    if (first) return first.id;
  }
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    const customer = existing.data[0];
    if (customer) {
      if (options.userId && customer.metadata?.['userId'] !== options.userId) {
        await stripe.customers.update(customer.id, { metadata: { ...customer.metadata, userId: options.userId } });
      }
      return customer.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }), ...(options.userId && { metadata: { userId: options.userId } }),
  });
  return created.id;
}

export async function syncSubscription(sub: Stripe.Subscription, environment: 'sandbox') {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const item = sub.items.data[0];
  if (!item || item.price.lookup_key !== PREMIUM.priceId || !sub.metadata['userId']) return;
  const { error } = await supabaseAdmin.from('subscriptions').upsert({
    user_id: sub.metadata['userId'], stripe_subscription_id: sub.id,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    price_id: item.price.lookup_key, status: sub.status,
    current_period_end: item.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end, environment, updated_at: new Date().toISOString(),
  }, { onConflict: 'environment,stripe_subscription_id' });
  if (error) throw new Error('No se pudo guardar el estado de la suscripción.');
}

export async function verificarEvento(request: Request): Promise<Stripe.Event> {
  const secret = process.env['PAYMENTS_SANDBOX_WEBHOOK_SECRET'];
  if (!secret) throw new Error('Webhook not configured');
  const signature = request.headers.get('stripe-signature');
  const body = await request.text();
  if (!signature || !body) throw new Error('Missing signature');
  const parts = signature.split(',').map(p => p.trim().split('=', 2));
  const timestamp = parts.find(([k]) => k === 't')?.[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!timestamp || !Number.isFinite(Number(timestamp)) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw new Error('Invalid timestamp');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`));
  const expected = Buffer.from(mac).toString('hex');
  const { timingSafeEqual } = await import('node:crypto');
  if (!signatures.some(s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s) && timingSafeEqual(Buffer.from(s), Buffer.from(expected)))) throw new Error('Invalid signature');
  const event = JSON.parse(body) as Stripe.Event;
  if (event.livemode !== false) throw new Error('Live events disabled');
  return event;
}
