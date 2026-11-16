// Volumen de búsquedas de Google Trends («2.000+», «20K+», «1,5M+») como número; 0 si no se entiende.
// La base de datos tiene la misma función (public.volumen_numerico, en supabase/prioridad-puntos.sql).
export function volumenNumerico(value: string | null): number {
  const match = /^\s*([\d.,]+)\s*([KMB]?)\s*\+?\s*$/i.exec(value ?? "");
  if (!match?.[1]) return 0;
  const suffix = match[2]?.toUpperCase();
  const number = suffix
    ? Number(match[1].replace(",", "."))
    : Number(match[1].replace(/[.,]/g, ""));
  return Number.isFinite(number)
    ? number * (suffix === "K" ? 1000 : suffix === "M" ? 1000000 : suffix === "B" ? 1000000000 : 1)
    : 0;
}
