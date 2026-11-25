// Envío del resumen por Brevo y registro en resumenes_email. Solo servidor; recibe el cliente privilegiado ya autorizado.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { leerAlertasParaResumen } from "./alertasRepo";
import { destinatarios, franjaActual, inicioFranja, montarEmail } from "./resumenEmail";

type Db = SupabaseClient<Database>;
export type ResultadoResumen =
  | { enviado: true; num_alertas: number; desde: string; hasta: string }
  | { enviado: false; motivo: "fuera_de_horario" | "ya_enviado" | "error"; mensaje: string };

async function enviarBrevo(asunto: string, html: string, texto: string) {
  const key = process.env["BREVO_API_KEY"];
  const remitente = process.env["RESUMEN_REMITENTE"]?.trim();
  const para = destinatarios(process.env["RESUMEN_DESTINATARIOS"]);
  if (!key || !remitente || para.length === 0) throw new Error("Faltan los ajustes de envío (clave de Brevo, remitente o destinatarios).");
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender: { name: "Radar Discover", email: remitente }, to: para.map((email) => ({ email })), subject: asunto, htmlContent: html, textContent: texto }),
  });
  if (!res.ok) throw new Error(`Brevo respondió ${res.status}: ${(await res.text()).slice(0, 500)}`);
}

async function enviarYRegistrar(db: Db, id: number, desde: Date, hasta: Date) {
  try {
    const alertas = await leerAlertasParaResumen(db, desde, hasta);
    const email = montarEmail(alertas, desde, hasta);
    await enviarBrevo(email.asunto, email.html, email.texto);
    await db.from("resumenes_email").update({ ok: true, num_alertas: alertas.length, enviado_en: new Date().toISOString() }).eq("id", id);
    return { enviado: true, num_alertas: alertas.length, desde: desde.toISOString(), hasta: hasta.toISOString() } as const;
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error desconocido";
    await db.from("resumenes_email").update({ ok: false, error: mensaje.slice(0, 1000) }).eq("id", id);
    return { enviado: false, motivo: "error", mensaje } as const;
  }
}

/** Envío programado: solo a las 8:00 y 16:00 de Madrid, una vez por franja; sin reintentos. */
export async function enviarResumenProgramado(db: Db, ahora = new Date()): Promise<ResultadoResumen> {
  const franja = franjaActual(ahora);
  if (!franja) return { enviado: false, motivo: "fuera_de_horario", mensaje: "En España no son las 8:00 ni las 16:00." };
  const { data: ultimo, error: e1 } = await db.from("resumenes_email").select("hasta").eq("tipo", "programado").eq("ok", true)
    .order("hasta", { ascending: false }).limit(1).maybeSingle();
  if (e1) throw new Error("No se pudo leer el último resumen.");
  const desde = inicioFranja(ultimo ? new Date(ultimo.hasta) : null, ahora);
  // La fila reserva la franja: el índice único hace que una segunda ejecución choque y se salte.
  const { data: fila, error } = await db.from("resumenes_email")
    .insert({ tipo: "programado", franja, desde: desde.toISOString(), hasta: ahora.toISOString() }).select("id").single();
  if (error || !fila) {
    if (error?.code === "23505") return { enviado: false, motivo: "ya_enviado", mensaje: `El resumen de ${franja} ya se procesó.` };
    throw new Error("No se pudo registrar el resumen.");
  }
  return enviarYRegistrar(db, fila.id, desde, ahora);
}

/** Envío de prueba (admins): últimas 24 h; no cuenta como último envío. */
export async function enviarResumenPrueba(db: Db, ahora = new Date()): Promise<ResultadoResumen> {
  const desde = inicioFranja(null, ahora);
  const { data: fila, error } = await db.from("resumenes_email")
    .insert({ tipo: "prueba", desde: desde.toISOString(), hasta: ahora.toISOString() }).select("id").single();
  if (error || !fila) throw new Error("No se pudo registrar el resumen de prueba.");
  return enviarYRegistrar(db, fila.id, desde, ahora);
}
