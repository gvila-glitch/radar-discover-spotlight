// Resumen de alertas por email: lógica pura (franja, orden, montaje del HTML y del texto). Sin red ni base de datos.
import { nombreVisible } from "./metricas";
import type { Alerta } from "./types";

export const ASUNTO = "Radar Discover · Resumen de alertas";
export const PANEL_URL = "https://radar-discover-spotlight.lovable.app";
export const HORAS_ENVIO = [8, 16] as const;
const ZONA = "Europe/Madrid";

export type AlertaResumen = Pick<
  Alerta,
  | "id" | "entidad" | "prioridad" | "creada_en" | "x_posicion" | "x_desde" | "trends_activo"
  | "trends_crecimiento" | "medios_discover" | "motivo_afinidad"
> & { wikipedia_ratio?: number | string | null };

function partesMadrid(d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(d).map((x) => [x.type, x.value]),
  );
  return { fecha: `${p["year"]}-${p["month"]}-${p["day"]}`, hora: Number(p["hour"]) };
}

/** Franja programada que toca ahora («2026-11-25 08»), o null si en Madrid no son las 8 ni las 16. */
export function franjaActual(ahora: Date): string | null {
  const { fecha, hora } = partesMadrid(ahora);
  return (HORAS_ENVIO as readonly number[]).includes(hora) ? `${fecha} ${String(hora).padStart(2, "0")}` : null;
}

/** Desde el último envío correcto; si no hay, las últimas 24 horas. */
export function inicioFranja(ultimoOk: Date | null, ahora: Date): Date {
  return ultimoOk ?? new Date(ahora.getTime() - 24 * 3600_000);
}

export function ordenar<T extends AlertaResumen>(alertas: T[]): { altas: T[]; medias: T[] } {
  const orden = (x: T[]) => [...x].sort((m, n) => Date.parse(n.creada_en) - Date.parse(m.creada_en));
  return {
    altas: orden(alertas.filter((a) => a.prioridad === "alta")),
    medias: orden(alertas.filter((a) => a.prioridad !== "alta")),
  };
}

const diaMadrid = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** «07:41 · hace 19 min», «Ayer, 23:30 · hace 8 h» o «23 nov, 10:05 · hace 50 h», en hora de España. */
export function cuandoSeCreo(creadaEn: string, ahora: Date): string {
  const d = new Date(creadaEn);
  const hora = new Intl.DateTimeFormat("es-ES", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  const dias = Math.round((Date.parse(diaMadrid(ahora)) - Date.parse(diaMadrid(d))) / 86400_000);
  const prefijo = dias <= 0 ? "" : dias === 1 ? "Ayer, " :
    `${new Intl.DateTimeFormat("es-ES", { timeZone: ZONA, day: "numeric", month: "short" }).format(d).replace(".", "")}, `;
  const min = Math.floor((ahora.getTime() - d.getTime()) / 60_000);
  const hace = min < 60 ? `hace ${Math.max(1, min)} min` : `hace ${Math.floor(min / 60)} h`;
  return `${prefijo}${hora} · ${hace}`;
}

export function fuentes(a: AlertaResumen): string {
  const f: string[] = [];
  if (a.x_posicion != null) f.push(`X (puesto ${a.x_posicion})`);
  if (a.trends_activo) f.push(`Google Trends${a.trends_crecimiento ? ` ${a.trends_crecimiento}` : ""}`);
  if (a.wikipedia_ratio != null) f.push("Wikipedia");
  return f.join(" · ") || "Sin fuente registrada";
}

export const medios = (n: number) => `${n} ${n === 1 ? "medio" : "medios"} en Discover`;
export const enlaceAlerta = (id: number) => `${PANEL_URL}/?alerta=${id}`;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function formatoMadrid(d: Date): string {
  return new Intl.DateTimeFormat("es-ES", { timeZone: ZONA, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}

const PIE = "Recibes este resumen a las 8:00 y a las 16:00. Pulsa cualquier tema para abrir su ficha en el panel. No incluye los temas descartados por la IA: puedes verlos en el panel, en «Descartes IA».";
const AZUL = "#004A7F";
const boton = (texto: string, url: string) =>
  `<a href="${esc(url)}" style="display:inline-block;background:${AZUL};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:6px">${esc(texto)}</a>`;

export type Email = { asunto: string; html: string; texto: string };

export function montarEmail(alertas: AlertaResumen[], desde: Date, hasta: Date): Email {
  const { altas, medias } = ordenar(alertas);
  const total = alertas.length;
  const franja = `${formatoMadrid(desde)} – ${formatoMadrid(hasta)} (hora de España)`;
  const titulo = total === 0 ? "Sin alertas nuevas desde el último resumen" : `${total} ${total === 1 ? "alerta" : "alertas"} desde el último resumen`;
  const recuento = `${altas.length} ${altas.length === 1 ? "alta" : "altas"} · ${medias.length} ${medias.length === 1 ? "media" : "medias"}`;
  const font = "font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1f2933";

  const tarjetas = altas.map((a) => `
<tr><td style="padding:0 0 10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #d9e2ec;border-radius:6px"><tr><td style="padding:12px 14px">
<span style="display:inline-block;background:#fde8e8;color:#9b1c1c;font-size:11px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:4px">Alta</span>
<div style="font-size:16px;font-weight:700;margin:6px 0 4px">${esc(nombreVisible(a.entidad))}</div>
<div style="font-size:13px;color:#52606d">${esc(cuandoSeCreo(a.creada_en, hasta))} · ${esc(fuentes(a))}</div>
<div style="font-size:13px;color:#52606d;margin-top:2px">${esc(medios(a.medios_discover))}</div>
<div style="margin-top:8px"><a href="${esc(enlaceAlerta(a.id))}" style="color:${AZUL};font-size:13px;font-weight:600;text-decoration:none">Ver en el panel →</a></div>
</td></tr></table></td></tr>`).join("");

  const lineas = medias.map((a) => `
<tr><td style="padding:8px 0;border-bottom:1px solid #eef2f6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="text-align:left"><a href="${esc(enlaceAlerta(a.id))}" style="color:${AZUL};font-weight:600;font-size:14px;text-decoration:none">${esc(nombreVisible(a.entidad))}</a></td>
<td style="text-align:right;white-space:nowrap;font-size:12px;color:#52606d;padding-left:8px">${esc(cuandoSeCreo(a.creada_en, hasta))}</td>
</tr></table>
<div style="font-size:12px;color:#7b8794;margin-top:2px">${esc(medios(a.medios_discover))} · ${esc(fuentes(a))}</div>
</td></tr>`).join("");

  const bloques = total === 0 ? "" : `
${altas.length ? `<tr><td style="padding:18px 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;color:#52606d">Prioridad alta · ${altas.length}</td></tr>${tarjetas}` : ""}
${medias.length ? `<tr><td style="padding:18px 0 4px;font-size:13px;font-weight:700;text-transform:uppercase;color:#52606d">Prioridad media · ${medias.length}</td></tr>${lineas}` : ""}
<tr><td style="padding:20px 0 0">${boton("Ver todas en el panel", PANEL_URL)}</td></tr>`;

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(ASUNTO)}</title></head>
<body style="margin:0;padding:0;background:#f5f7fa">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;${font}"><tr><td style="padding:20px 18px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="font-size:12px;color:#7b8794;text-transform:uppercase;letter-spacing:.04em">Radar Discover</td></tr>
<tr><td style="font-size:20px;font-weight:700;padding:4px 0">${esc(titulo)}</td></tr>
<tr><td style="font-size:13px;color:#52606d">${esc(franja)}${total ? ` · ${esc(recuento)}` : ""}</td></tr>
<tr><td style="padding:14px 0 4px">${boton("Abrir el panel de alertas", PANEL_URL)}</td></tr>
${bloques}
<tr><td style="padding:22px 0 0;font-size:12px;color:#7b8794;line-height:1.5">${esc(PIE)}</td></tr>
</table></td></tr></table></td></tr></table></body></html>`;

  const t: string[] = [titulo, franja + (total ? ` · ${recuento}` : ""), "", `Abrir el panel de alertas: ${PANEL_URL}`];
  if (altas.length) {
    t.push("", `PRIORIDAD ALTA · ${altas.length}`);
    for (const a of altas) t.push("", `[ALTA] ${nombreVisible(a.entidad)}`, `${cuandoSeCreo(a.creada_en, hasta)} · ${fuentes(a)}`, medios(a.medios_discover), `Ver en el panel: ${enlaceAlerta(a.id)}`);
  }
  if (medias.length) {
    t.push("", `PRIORIDAD MEDIA · ${medias.length}`);
    for (const a of medias) t.push(`- ${nombreVisible(a.entidad)} · ${cuandoSeCreo(a.creada_en, hasta)} · ${medios(a.medios_discover)} · ${fuentes(a)} · ${enlaceAlerta(a.id)}`);
  }
  if (total) t.push("", `Ver todas en el panel: ${PANEL_URL}`);
  t.push("", PIE);
  return { asunto: ASUNTO, html, texto: t.join("\n") };
}

/** «a@x.es, b@y.es» → lista validada; vacía si alguna no parece un email. */
export function destinatarios(valor: string | undefined): string[] {
  const lista = (valor ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return lista.length && lista.every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) ? lista : [];
}
