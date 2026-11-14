export const PREMIUM = { priceId: 'radar_premium_monthly', amount: 1000, currency: 'eur', interval: 'month', advisorAvailable: false } as const;
export function exigirPruebas(environment: string) {
  if (environment !== 'sandbox') throw new Error('Los cobros reales están desactivados mientras IA Advisor no esté disponible.');
}
export function suscripcionVigente(status: string, end: string | null, now = Date.now()) {
  return ['active', 'trialing', 'past_due'].includes(status) && (end === null || Date.parse(end) > now);
}
