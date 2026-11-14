-- Premium retirado: la pasarela de Stripe se ha desconectado y la app ya no
-- consulta esta tabla. Se marca como retirada; ningún código la usa.
comment on table public.subscriptions is 'DEPRECATED: Premium retirado junto con la integración de Stripe; la aplicación ya no lee ni escribe esta tabla.';