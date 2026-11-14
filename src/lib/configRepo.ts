// Ajustes editables por administradores (RLS con es_admin()).
import { supabase } from "@/integrations/supabase/client";
export const CLAVES = ["perfil_editorial", "ambito", "excepciones", "max_alertas_dia", "umbral_alta_medios", "umbral_media_medios"] as const;
export type Clave = (typeof CLAVES)[number];
export type Ajustes = Record<Clave, string>;
export type Medio = { dominio: string; nombre: string | null; top5: boolean | null; activo: boolean | null };

export async function esAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("es_admin");
  return !error && data === true;
}
export async function leerAjustes(): Promise<Ajustes> {
  const { data, error } = await supabase.from("config").select("clave, valor").in("clave", [...CLAVES]);
  if (error) throw error;
  const out = Object.fromEntries(CLAVES.map((c) => [c, ""])) as Ajustes;
  for (const r of data ?? []) out[r.clave as Clave] = r.valor ?? "";
  return out;
}
export async function guardarAjustes(cambios: Partial<Ajustes>): Promise<void> {
  const ahora = new Date().toISOString();
  for (const [clave, valor] of Object.entries(cambios)) {
    const { data, error } = await supabase.from("config").update({ valor, actualizado_en: ahora }).eq("clave", clave).select("clave");
    if (error) throw error;
    if (!data?.length) throw new Error("Sin permiso");
  }
}
export async function listarMedios(): Promise<Medio[]> {
  const { data, error } = await supabase.from("medios_referencia").select("dominio, nombre, top5, activo").order("dominio");
  if (error) throw error;
  return data ?? [];
}
export function normalizarDominio(v: string): string {
  return v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}
export async function anadirMedio(dominio: string, nombre: string): Promise<void> {
  const { error } = await supabase.from("medios_referencia").insert({ dominio: normalizarDominio(dominio), nombre: nombre.trim() || null, activo: true, top5: false });
  if (error) throw error;
}
export async function quitarMedio(dominio: string): Promise<void> {
  const { error } = await supabase.from("medios_referencia").delete().eq("dominio", dominio);
  if (error) throw error;
}
export async function marcarTop5(dominio: string, top5: boolean): Promise<void> {
  const { error } = await supabase.from("medios_referencia").update({ top5 }).eq("dominio", dominio);
  if (error) throw error;
}
