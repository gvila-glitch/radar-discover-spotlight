// Acceso al perfil editorial: solo administradores (RLS con es_admin()).
import { supabase } from "@/integrations/supabase/client";
export async function esAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("es_admin");
  if (error) return false;
  return data === true;
}
export async function leerPerfilEditorial(): Promise<string> {
  const { data, error } = await supabase.from("config").select("valor").eq("clave", "perfil_editorial").maybeSingle();
  if (error) throw error;
  return data?.valor ?? "";
}
export async function guardarPerfilEditorial(valor: string): Promise<void> {
  const { data, error } = await supabase.from("config")
    .update({ valor, actualizado_en: new Date().toISOString() })
    .eq("clave", "perfil_editorial").select("clave");
  if (error) throw error;
  if (!data?.length) throw new Error("Sin permiso");
}
