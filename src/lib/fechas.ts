const TZ = "Europe/Madrid";
const dia = new Intl.DateTimeFormat("es-ES", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const hora = new Intl.DateTimeFormat("es-ES", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const corta = new Intl.DateTimeFormat("es-ES", { timeZone: TZ, day: "numeric", month: "short" });
const larga = new Intl.DateTimeFormat("es-ES", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const claveDia = (iso: string | Date) => dia.format(new Date(iso));
export const esHoy = (iso: string) => claveDia(iso) === claveDia(new Date());
export const horaOFecha = (iso: string) => (esHoy(iso) ? hora.format(new Date(iso)) : corta.format(new Date(iso)));
export const fechaLarga = (iso: string) => larga.format(new Date(iso));
export const hora24 = (iso: string) => hora.format(new Date(iso));

export function hace(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

/** Inicio del periodo en hora de Madrid. */
export function desdePeriodo(p: "hoy" | "7d" | "30d" | "todo"): Date | null {
  if (p === "todo") return null;
  if (p === "hoy") {
    const ahora = new Date();
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
        .formatToParts(ahora).map((x) => [x.type, x.value]),
    );
    const ms = ((+parts.hour * 60 + +parts.minute) * 60 + +parts.second) * 1000;
    return new Date(ahora.getTime() - ms - ahora.getMilliseconds());
  }
  return new Date(Date.now() - (p === "7d" ? 7 : 30) * 86400_000);
}
