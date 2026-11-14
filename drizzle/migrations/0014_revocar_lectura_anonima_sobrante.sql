-- subscriptions está retirada y wikipedia_picos solo la usa el servicio interno:
-- ninguna de las dos debe ser legible por el rol anónimo.
revoke select on public.subscriptions from anon;
revoke select on public.wikipedia_picos from anon;