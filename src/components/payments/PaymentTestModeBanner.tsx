import { pagosDePruebaDisponibles } from '@/lib/stripe';
export function PaymentTestModeBanner() {
  return <div role="status" className="border-b bg-muted px-4 py-2 text-center text-xs text-muted-foreground">
    {pagosDePruebaDisponibles() ? 'Pagos de prueba · No se cobra dinero real · IA Advisor aún no está disponible.' : 'Los pagos están desactivados · IA Advisor aún no está disponible.'}
  </div>;
}
