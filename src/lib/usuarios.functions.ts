import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { comprobarCambio, normalizarEmail, validarRol, type Miembro, type Rol } from "./usuariosReglas";

type Ctx = { supabase: { rpc: (f: "es_admin") => PromiseLike<{ data: unknown; error: unknown }> }; claims: { email?: unknown } };
async function exigirAdmin(context: Ctx) {
  const { data, error } = await context.supabase.rpc("es_admin");
  if (error || data !== true) throw new Error("Sin permiso");
  const yo = String(context.claims.email ?? "").toLowerCase();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { yo, db: supabaseAdmin };
}
type Db = Awaited<ReturnType<typeof exigirAdmin>>["db"];
async function miembros(db: Db): Promise<Miembro[]> {
  const [eq, ro] = await Promise.all([db.from("equipo").select("email"), db.from("equipo_roles").select("email, rol")]);
  if (eq.error || ro.error) throw new Error("No se pudo leer el equipo.");
  const admins = new Set((ro.data ?? []).filter((r) => r.rol === "admin").map((r) => r.email.toLowerCase()));
  return (eq.data ?? []).map((r) => ({ email: r.email.toLowerCase(), rol: admins.has(r.email.toLowerCase()) ? "admin" : "usuario" }));
}

export const listarUsuarios = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { db } = await exigirAdmin(context as unknown as Ctx);
  const lista = await miembros(db);
  const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
  const activos = new Map((data?.users ?? []).map((u) => [String(u.email).toLowerCase(), !!u.last_sign_in_at]));
  return lista.sort((a, b) => a.email.localeCompare(b.email)).map((m) => ({ ...m, activado: activos.get(m.email) ?? false, cuenta: activos.has(m.email) }));
});

export const altaUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; rol: Rol }) => ({ email: normalizarEmail(d?.email), rol: validarRol(d?.rol) }))
  .handler(async ({ data, context }) => {
    const { db } = await exigirAdmin(context as unknown as Ctx);
    if ((await miembros(db)).some((m) => m.email === data.email)) throw new Error("Ese email ya tiene acceso.");
    const origin = new URL(getRequest().url).origin;
    const inv = await db.auth.admin.inviteUserByEmail(data.email, { redirectTo: `${origin}/reset-password` });
    const yaExiste = inv.error && /already|registered|exists/i.test(inv.error.message);
    if (inv.error && !yaExiste) { console.error(inv.error); throw new Error("No se pudo enviar la invitación."); }
    const e1 = await db.from("equipo").insert({ email: data.email });
    if (e1.error) throw new Error("No se pudo dar de alta.");
    if (data.rol === "admin") await db.from("equipo_roles").insert({ email: data.email, rol: "admin" });
    return { invitado: !yaExiste };
  });

export const cambiarRol = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; rol: Rol }) => ({ email: normalizarEmail(d?.email), rol: validarRol(d?.rol) }))
  .handler(async ({ data, context }) => {
    const { db, yo } = await exigirAdmin(context as unknown as Ctx);
    comprobarCambio(await miembros(db), yo, data.email, data.rol);
    const r = data.rol === "admin"
      ? await db.from("equipo_roles").upsert({ email: data.email, rol: "admin" })
      : await db.from("equipo_roles").delete().ilike("email", data.email).eq("rol", "admin");
    if (r.error) throw new Error("No se pudo cambiar el rol.");
    return { ok: true };
  });

export const bajaUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string }) => ({ email: normalizarEmail(d?.email) }))
  .handler(async ({ data, context }) => {
    const { db, yo } = await exigirAdmin(context as unknown as Ctx);
    comprobarCambio(await miembros(db), yo, data.email, null);
    await db.from("equipo_roles").delete().ilike("email", data.email);
    const r = await db.from("equipo").delete().ilike("email", data.email);
    if (r.error) throw new Error("No se pudo quitar el acceso.");
    return { ok: true };
  });
