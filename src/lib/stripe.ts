import { loadStripe } from '@stripe/stripe-js';
const token = import.meta.env['VITE_PAYMENTS_CLIENT_TOKEN'] as string | undefined;
let promise: ReturnType<typeof loadStripe> | null = null;
export function pagosDePruebaDisponibles() { return token?.startsWith('pk_test_') === true; }
export function getStripe() {
  if (!token || !pagosDePruebaDisponibles()) throw new Error('Solo están disponibles los pagos de prueba; no se admiten cobros reales.');
  promise ??= loadStripe(token);
  return promise;
}
