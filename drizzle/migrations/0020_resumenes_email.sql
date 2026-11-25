-- Registro de los resúmenes de alertas por email. Solo lo usa el servidor (service_role).
CREATE TABLE IF NOT EXISTS public.resumenes_email (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo text NOT NULL DEFAULT 'programado' CHECK (tipo IN ('programado', 'prueba')),
  franja text,
  enviado_en timestamptz NOT NULL DEFAULT now(),
  desde timestamptz NOT NULL,
  hasta timestamptz NOT NULL,
  num_alertas integer NOT NULL DEFAULT 0,
  ok boolean,
  error text
);
-- Una sola fila por franja programada (p. ej. '2026-11-25 08'): evita dobles envíos aunque la tarea se ejecute dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS resumenes_email_franja_unica ON public.resumenes_email (franja) WHERE tipo = 'programado';
REVOKE ALL ON public.resumenes_email FROM anon, authenticated;
GRANT ALL ON public.resumenes_email TO service_role;
ALTER TABLE public.resumenes_email ENABLE ROW LEVEL SECURITY;
