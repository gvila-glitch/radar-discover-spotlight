// Acciones del panel sobre los descartes de la IA. Usan la sesión del usuario: la base de datos (RLS y las funciones
// marcar_descarte / anadir_excepcion_descarte) decide quién puede leer, marcar o añadir excepciones.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { criterioValido, lineaReglaSi, type Descarte } from "./descartes";

type Db = SupabaseClient<Database>;
async function exigir(context: unknown, permiso: "es_equipo" | "es_admin"): Promise<Db> {
  const db = (context as { supabase: Db }).supabase;
  const { data, error } = await db.rpc(permiso);
  if (error || data !== true) throw new Error("Sin permiso");
  return db;
}
const fecha = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const id = (v: unknown) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error("Descarte no válido.");
  return n;
};

/** Descartes desde un día, los de más puntos primero. El panel pide todos (`todos: true`); sin eso, solo los fuertes. */
export const listarDescartes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { desde?: unknown; todos?: unknown }) => ({
    desde: fecha(d?.desde),
    todos: d?.todos === true,
  }))
  .handler(async ({ data, context }): Promise<Descarte[]> => {
    const db = await exigir(context, "es_equipo");
    let q = db.from("descartes_ia").select("*");
    if (data.desde) q = q.gte("dia", data.desde);
    if (!data.todos) q = q.eq("fuerte", true);
    const { data: filas, error } = await q
      .order("dia", { ascending: false })
      .order("puntos", { ascending: false })
      .order("creada_en", { ascending: false })
      .limit(1000);
    if (error) throw new Error("No se pudieron leer los descartes.");
    return filas ?? [];
  });

/** «Debería haber pasado» (o quitar la marca). Cualquiera del equipo; queda quién y cuándo. */
export const marcarDescarte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: unknown; marcar?: unknown; nota?: unknown }) => ({
    id: id(d?.id),
    marcar: d?.marcar === true,
    nota:
      typeof d?.nota === "string" ? d.nota.replace(/\s+/g, " ").trim().slice(0, 500) || null : null,
  }))
  .handler(async ({ data, context }): Promise<Descarte> => {
    const db = await exigir(context, "es_equipo");
    const { data: fila, error } = await db.rpc("marcar_descarte", {
      p_id: data.id,
      p_marcar: data.marcar,
      p_nota: data.nota ?? "",
    });
    if (error || !fila) throw new Error("No se pudo guardar la revisión.");
    return fila as Descarte;
  });

/**
 * Añadir como excepción (solo administradores): un criterio a las excepciones que lee la IA, o el nombre a las reglas de
 * «sí». Se aplica desde la siguiente tanda y queda registrado en el descarte quién lo añadió.
 */
export const anadirExcepcion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: unknown; tipo?: unknown; texto?: unknown }) => {
    const tipo = d?.tipo === "nombre" ? "nombre" : "criterio";
    const texto = typeof d?.texto === "string" ? d.texto : "";
    return { id: id(d?.id), tipo, texto } as const;
  })
  .handler(async ({ data, context }): Promise<Descarte> => {
    const db = await exigir(context, "es_admin");
    const { data: descarte, error: e1 } = await db
      .from("descartes_ia")
      .select("*")
      .eq("id", data.id)
      .single();
    if (e1 || !descarte) throw new Error("No se encontró el descarte.");
    const linea = data.tipo === "nombre" ? lineaReglaSi(descarte.tema) : criterioValido(data.texto);
    if (!linea) throw new Error("El criterio debe tener entre 10 y 300 caracteres.");
    const { data: fila, error } = await db.rpc("anadir_excepcion_descarte", {
      p_id: data.id,
      p_tipo: data.tipo,
      p_linea: linea,
    });
    if (error || !fila) throw new Error("No se pudo guardar la excepción.");
    return fila as Descarte;
  });
