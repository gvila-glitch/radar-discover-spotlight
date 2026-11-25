// «Enviar resumen de prueba ahora» (solo administradores): comprueba es_admin() con la sesión y solo entonces usa el cliente privilegiado.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: { rpc: (f: "es_admin") => PromiseLike<{ data: unknown; error: unknown }> } };

export const enviarResumenDePrueba = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin, error } = await (context as unknown as Ctx).supabase.rpc("es_admin");
    if (error || admin !== true) throw new Error("Sin permiso");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enviarResumenPrueba } = await import("./resumenEmail.server");
    const r = await enviarResumenPrueba(supabaseAdmin);
    return r.enviado ? { ok: true as const, mensaje: `Enviado con ${r.num_alertas} alertas.` } : { ok: false as const, mensaje: r.mensaje };
  });
