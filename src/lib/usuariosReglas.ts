export type Rol = "admin" | "usuario";
export type Miembro = { email: string; rol: Rol };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function normalizarEmail(v: unknown): string {
  const e = String(v ?? "").trim().toLowerCase();
  if (!EMAIL.test(e) || e.length > 254) throw new Error("Email no válido.");
  return e;
}
export function validarRol(v: unknown): Rol {
  if (v !== "admin" && v !== "usuario") throw new Error("Rol no válido.");
  return v;
}
/** Comprueba cambios de rol o bajas: nadie se degrada/elimina a sí mismo y queda al menos un admin. */
export function comprobarCambio(miembros: Miembro[], yo: string, objetivo: string, nuevoRol: Rol | null) {
  const o = objetivo.toLowerCase();
  if (o === yo.toLowerCase() && nuevoRol !== "admin") throw new Error("No puedes quitarte tu propio acceso ni tu rol de admin.");
  const admins = miembros.filter((m) => m.rol === "admin" && m.email.toLowerCase() !== o).length;
  if (nuevoRol !== "admin" && admins === 0) throw new Error("Debe quedar al menos un admin.");
}
