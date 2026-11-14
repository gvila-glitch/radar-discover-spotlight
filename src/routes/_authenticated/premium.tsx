import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery, queryOptions } from '@tanstack/react-query';
import { useCallback, useState, lazy, Suspense } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { LockKeyhole, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PaymentTestModeBanner } from '@/components/payments/PaymentTestModeBanner';
import { consultarPremium, cancelarPremium } from '@/lib/premium.functions';
import { pagosDePruebaDisponibles } from '@/lib/stripe';
import { suscripcionVigente } from '@/lib/premium';
const Checkout = lazy(() => import('@/components/payments/PremiumCheckout'));
const premiumQuery = (sessionId?: string) => queryOptions({
  queryKey: ['premium', sessionId ?? null], queryFn: async () => {
    const result = await consultarPremium({ data: { environment: 'sandbox', sessionId } });
    if ('error' in result) throw new Error(result.error);
    return result.subscription;
  },
});
export const Route = createFileRoute('/_authenticated/premium')({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { session_id?: string | undefined } => ({ session_id: typeof s['session_id'] === 'string' && /^cs_test_[a-zA-Z0-9_]+$/.test(s['session_id']) ? s['session_id'] : undefined }),
  loaderDeps: ({ search }) => ({ sessionId: search.session_id }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(premiumQuery(deps.sessionId)),
  head: () => ({ meta: [
    { title: 'Premium · IA Advisor · Radar Discover' },
    { name: 'description', content: 'Suscripción Premium de prueba de Radar Discover. IA Advisor todavía no está disponible.' },
    { property: 'og:title', content: 'Premium · IA Advisor · Radar Discover' },
    { property: 'og:description', content: 'Premium a 10 € al mes en pruebas, sin activar IA Advisor.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }), component: PremiumPage,
});
function PremiumPage() {
  const { session_id } = Route.useSearch();
  const { data: sub, refetch } = useSuspenseQuery(premiumQuery(session_id));
  const [checkout, setCheckout] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = useServerFn(cancelarPremium);
  const complete = useCallback(() => { setCheckout(false); void refetch(); }, [refetch]);
  const active = sub && suscripcionVigente(sub.status, sub.current_period_end);
  async function cancelar() {
    setBusy(true); setError(null);
    try { const result = await cancel({ data: { environment: 'sandbox' } }); if ('error' in result) throw new Error(result.error); await refetch(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cancelar.'); }
    finally { setBusy(false); }
  }
  return <div className="min-h-screen">
    <PaymentTestModeBanner />
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <Button variant="ghost" size="sm" asChild><Link to="/"><ArrowLeft />Alertas</Link></Button>
      <div className="mt-8 flex items-center gap-3"><LockKeyhole className="size-6 text-muted-foreground" /><h1 className="tracking-tight text-3xl font-semibold">IA Advisor · Premium</h1></div>
      <p className="mt-3 text-sm text-muted-foreground">Próximamente. IA Advisor todavía no está disponible y ningún pago activa el servicio.</p>
      <div className="my-6 border-y py-5"><span className="font-mono text-4xl">10 €</span><span className="text-muted-foreground"> / mes</span>
        <p className="mt-2 text-sm text-muted-foreground">Suscripción recurrente mensual de prueba. El formulario muestra el total y los impuestos aplicables antes de confirmar.</p>
      </div>
      {active ? <section className="space-y-4">
        <h2 className="tracking-tight text-xl">Premium de prueba activo</h2><p className="text-sm">Tu suscripción no activa IA Advisor. No se ha cobrado dinero real.</p>
        {sub.cancel_at_period_end ? <p className="text-sm">Cancelada la renovación{ sub.current_period_end ? ` · Finaliza el ${new Date(sub.current_period_end).toLocaleDateString('es-ES')}` : ''}.</p> : <Button variant="outline" disabled={busy} onClick={cancelar}>{busy ? 'Cancelando…' : 'Cancelar renovación'}</Button>}
      </section> : <>
        {sub && <p className="mb-4 text-sm text-muted-foreground">Estado de la suscripción: {sub.status === 'incomplete' ? 'pago pendiente' : sub.status === 'canceled' ? 'cancelada' : sub.status}.</p>}
        {!checkout && <Button disabled={!pagosDePruebaDisponibles()} onClick={() => setCheckout(true)}>Probar suscripción Premium</Button>}
        {checkout && <div className="mt-4"><Button variant="ghost" size="sm" onClick={() => setCheckout(false)}>Cerrar pago</Button><Suspense fallback={<p className="py-8 text-sm text-muted-foreground">Cargando pago seguro…</p>}><Checkout onComplete={complete} /></Suspense></div>}
      </>}
      {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    </main>
  </div>;
}
