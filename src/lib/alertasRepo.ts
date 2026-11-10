// Único punto de acceso a datos. Sustituir por llamadas a Supabase más adelante.
import { crearDemoAlertas } from "@/data/demoAlertas";
import type { Alerta, CambiosValoracion } from "./types";

export const USUARIO_DEMO = "demo";
let store: Alerta[] | null = null;
const db = () => (store ??= crearDemoAlertas());
const espera = () => new Promise((r) => setTimeout(r, 250));

export async function listAlertas(desde: Date | null): Promise<Alerta[]> {
  await espera();
  return db()
    .filter((a) => !desde || new Date(a.creada_en) >= desde)
    .sort((a, b) => b.creada_en.localeCompare(a.creada_en))
    .map((a) => ({ ...a }));
}

export async function valorar(id: number, cambios: CambiosValoracion): Promise<Alerta> {
  await espera();
  const actual = db().find((a) => a.id === id);
  if (!actual) throw new Error("Alerta no encontrada");
  Object.assign(actual, cambios);
  return { ...actual };
}
