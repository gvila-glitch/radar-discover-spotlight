// Colocación de las burbujas del Discover Map (cálculo puro, sin pintar nada).
// Cada tema es un círculo de área proporcional a sus medios; los temas de un grupo se colocan juntos, como un
// racimo alrededor del más grande, y cada grupo queda dentro de un círculo. Los grupos se reparten en filas.
// Siempre da el mismo resultado con los mismos datos: el mapa no «baila» al actualizar.
import type { GrupoMapa, TemaMapa } from "./discoverMap";

export type Etiqueta = { lineas: string[]; tamano: number; dentro: boolean };
export type BurbujaColocada = {
  tema: TemaMapa;
  grupo: number;
  x: number;
  y: number;
  r: number;
  etiqueta: Etiqueta;
};
export type GrupoColocado = {
  id: string;
  nombre: string;
  indice: number;
  otros: boolean;
  x: number;
  y: number;
  r: number;
};
export type MapaColocado = {
  grupos: GrupoColocado[];
  burbujas: BurbujaColocada[];
  caja: [number, number, number, number];
};

export const radioBurbuja = (medios: number) => 24 * Math.sqrt(Math.max(1, medios));
const ANCHO_LETRA = 0.56; // ancho medio de un carácter respecto al tamaño de letra
export const anchoTexto = (t: string, tamano: number) => t.length * tamano * ANCHO_LETRA;

/** Reparte un nombre en 1, 2 o 3 líneas que quepan en «ancho»; null si no cabe. */
export function partirNombre(nombre: string, ancho: number, tamano: number): string[] | null {
  if (anchoTexto(nombre, tamano) <= ancho) return [nombre];
  const p = nombre.split(" ");
  for (let k = 1; k < p.length; k++) {
    const a = p.slice(0, k).join(" ");
    const b = p.slice(k).join(" ");
    if (anchoTexto(a, tamano) <= ancho && anchoTexto(b, tamano) <= ancho) return [a, b];
  }
  if (p.length === 3 && p.every((w) => anchoTexto(w, tamano) <= ancho)) return p;
  return null;
}

export function etiquetaDe(nombre: string, r: number): Etiqueta {
  const tamano = Math.max(12.5, Math.min(20, r * 0.3));
  const lineas = partirNombre(nombre, r * 1.72, tamano);
  return lineas
    ? { lineas, tamano, dentro: true }
    : { lineas: [nombre], tamano: 13, dentro: false };
}

type Pos = { x: number; y: number; r: number };

/** Puntos donde un círculo de radio r toca a la vez a A y a B (con «hueco» de separación). */
function tangentes(A: Pos, B: Pos, r: number, hueco: number): [number, number][] {
  const ra = A.r + r + hueco;
  const rb = B.r + r + hueco;
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const d = Math.hypot(dx, dy);
  if (d === 0 || d > ra + rb || d < Math.abs(ra - rb)) return [];
  const l = (ra * ra - rb * rb + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, ra * ra - l * l));
  const mx = A.x + (l * dx) / d;
  const my = A.y + (l * dy) / d;
  return [
    [mx + (h * dy) / d, my - (h * dx) / d],
    [mx - (h * dy) / d, my + (h * dx) / d],
  ];
}

/**
 * Empaqueta círculos (de mayor a menor) lo más juntos posible: cada uno se coloca tocando a dos de los ya puestos,
 * en el sitio libre más cercano al primero. Así los grupos quedan compactos, como un racimo.
 */
export function empaquetar(radios: number[], hueco: number): Pos[] {
  const puestos: Pos[] = [];
  for (const r of radios) {
    if (puestos.length === 0) {
      puestos.push({ x: 0, y: 0, r });
      continue;
    }
    if (puestos.length === 1) {
      puestos.push({ x: puestos[0]!.r + r + hueco, y: 0, r });
      continue;
    }
    const libre = (x: number, y: number) =>
      puestos.every((q) => Math.hypot(q.x - x, q.y - y) >= q.r + r + hueco - 1e-6);
    let mejor: [number, number] | null = null;
    let distancia = Infinity;
    for (let i = 0; i < puestos.length; i++)
      for (let j = i + 1; j < puestos.length; j++)
        for (const [x, y] of tangentes(puestos[i]!, puestos[j]!, r, hueco)) {
          const d = Math.hypot(x, y);
          if (d < distancia - 1e-9 && libre(x, y)) {
            mejor = [x, y];
            distancia = d;
          }
        }
    if (!mejor) {
      // Por si acaso (no debería pasar): a la derecha de todo.
      const borde = Math.max(...puestos.map((q) => q.x + q.r));
      mejor = [borde + r + hueco, 0];
    }
    puestos.push({ x: mejor[0], y: mejor[1], r });
  }
  return puestos;
}

/** Centro y radio de un círculo que contiene a todos (el mejor de dos centros aproximados). */
function envolvente(pos: Pos[]): { cx: number; cy: number; R: number } {
  const peso = pos.reduce((s, p) => s + p.r, 0);
  const candidatos: [number, number][] = [
    [pos.reduce((s, p) => s + p.x * p.r, 0) / peso, pos.reduce((s, p) => s + p.y * p.r, 0) / peso],
    [
      (Math.min(...pos.map((p) => p.x - p.r)) + Math.max(...pos.map((p) => p.x + p.r))) / 2,
      (Math.min(...pos.map((p) => p.y - p.r)) + Math.max(...pos.map((p) => p.y + p.r))) / 2,
    ],
  ];
  const radio = ([cx, cy]: [number, number]) =>
    Math.max(...pos.map((p) => Math.hypot(p.x - cx, p.y - cy) + p.r));
  const [cx, cy] = candidatos.reduce((a, b) => (radio(b) < radio(a) ? b : a));
  return { cx, cy, R: radio([cx, cy]) };
}

const HUECO_BURBUJAS = 6;
const MARGEN_GRUPO = 14;
const HUECO_GRUPOS = 26;
const ROTULO = 26; // espacio encima de cada grupo para su título
/** Ancho de fila por defecto; la página pasa el ancho real disponible para que el texto salga a su tamaño. */
export const ANCHO_FILA = 760;

export function colocarBurbujas(grupos: GrupoMapa[], anchoFila = ANCHO_FILA): MapaColocado {
  if (!grupos.length) return { grupos: [], burbujas: [], caja: [0, 0, 1, 1] };
  // 1) Cada grupo por separado, centrado en su punto medio.
  const piezas = grupos.map((g, indice) => {
    const temas = [...g.temas].sort((a, b) => b.medios - a.medios);
    const pos = empaquetar(
      temas.map((t) => radioBurbuja(t.medios)),
      HUECO_BURBUJAS,
    );
    const { cx: mx, cy: my, R: radio } = envolvente(pos);
    const rel = pos.map((p) => ({ ...p, x: p.x - mx, y: p.y - my }));
    const R = radio + MARGEN_GRUPO;
    return { g, indice, otros: g.id === "otros", temas, rel, R };
  });
  // 2) Filas: primero los grupos grandes; «Otros temas» siempre al final.
  const orden = [...piezas].sort((a, b) => Number(a.otros) - Number(b.otros) || b.R - a.R);
  const filas: (typeof piezas)[] = [];
  for (const p of orden) {
    const fila = filas.at(-1);
    const ancho = fila ? fila.reduce((t, q) => t + 2 * q.R + HUECO_GRUPOS, 0) + 2 * p.R : Infinity;
    if (fila && ancho <= anchoFila) fila.push(p);
    else filas.push([p]);
  }
  const anchoDe = (f: typeof piezas) =>
    f.reduce((t, q) => t + 2 * q.R, 0) + HUECO_GRUPOS * (f.length - 1);
  const anchoMax = Math.max(...filas.map(anchoDe));
  const gruposColocados: GrupoColocado[] = [];
  const burbujas: BurbujaColocada[] = [];
  let y = 0;
  for (const fila of filas) {
    const alto = Math.max(...fila.map((q) => q.R));
    let x = (anchoMax - anchoDe(fila)) / 2;
    for (const q of fila) {
      const cx = x + q.R;
      const cy = y + ROTULO + alto;
      gruposColocados.push({
        id: q.g.id,
        nombre: q.g.nombre,
        indice: q.indice,
        otros: q.otros,
        x: cx,
        y: cy,
        r: q.R,
      });
      q.temas.forEach((t, i) => {
        const p = q.rel[i]!;
        burbujas.push({
          tema: t,
          grupo: q.indice,
          x: cx + p.x,
          y: cy + p.y,
          r: p.r,
          etiqueta: etiquetaDe(t.nombre, p.r),
        });
      });
      x += 2 * q.R + HUECO_GRUPOS;
    }
    y += ROTULO + 2 * alto + HUECO_GRUPOS;
  }
  const m = 10;
  return {
    grupos: gruposColocados,
    burbujas,
    caja: [-m, -m, anchoMax + 2 * m, y - HUECO_GRUPOS + 2 * m + 16],
  };
}
