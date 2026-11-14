import { useCallback, useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { getStripe } from '@/lib/stripe';
import { iniciarPremium } from '@/lib/premium.functions';
export default function PremiumCheckout({ onComplete }: { onComplete: () => void }) {
  const create = useServerFn(iniciarPremium);
  const [error, setError] = useState<string | null>(null);
  const fetchClientSecret = useCallback(async () => {
    const result = await create({ data: { environment: 'sandbox' } });
    if ('error' in result) { setError(result.error); throw new Error(result.error); }
    return result.clientSecret;
  }, [create]);
  const options = useMemo(() => ({ fetchClientSecret, onComplete }), [fetchClientSecret, onComplete]);
  if (error) return <p role="alert" className="border border-destructive p-4 text-sm text-destructive">{error}</p>;
  return <EmbeddedCheckoutProvider stripe={getStripe()} options={options}><EmbeddedCheckout /></EmbeddedCheckoutProvider>;
}
