CREATE TABLE public.subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
 stripe_subscription_id text NOT NULL, stripe_customer_id text NOT NULL,
 price_id text NOT NULL, status text NOT NULL,
 current_period_end timestamptz, cancel_at_period_end boolean NOT NULL DEFAULT false,
 environment text NOT NULL CHECK (environment IN ('sandbox','live')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (environment,stripe_subscription_id)
);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_own_read ON public.subscriptions FOR SELECT TO authenticated USING (user_id = (select auth.uid()) AND public.es_equipo());
CREATE INDEX subscriptions_user_env ON public.subscriptions(user_id,environment);
