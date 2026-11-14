import { describe, expect, it } from "vitest";
import {
  claveEntidad,
  entidadesEquivalentes,
  parsearReglas,
  planificarAlertasTrends,
  type Reglas,
  type TendenciaAlerta,
  type TendenciaX,
} from "./trendsAlertas";
import { planificarAlertasWikipedia, type Pico } from "./wikipediaPicos";

describe("claveEntidad", () => {
  it("quita prefijo, paréntesis, tildes y mayúsculas", () => {
    expect(claveEntidad("[SIN DISCOVER] Rosalía (cantante)")).toBe("rosalia");
    expect(claveEntidad("Vox (partido político)")).toBe("vox");
    expect(claveEntidad("  Ministerio  de IGUALDAD ")).toBe("ministerio de igualdad");
    expect(claveEntidad("Ñoño Çavuşoğlu Đorđe Łódź")).toBe("nono cavusoglu dorde lodz");
    expect(claveEntidad("#PSOEyFrente")).toBe("#psoeyfrente");
    expect(claveEntidad("")).toBe("");
    expect(claveEntidad("(solo paréntesis)")).toBe("");
  });
});

describe("entidadesEquivalentes", () => {
  const si: [string, string][] = [
    ["Abascal", "Santiago Abascal"],
    ["Ayuso", "Isabel Díaz Ayuso"],
    ["Vox", "Vox (partido político)"],
    ["Rosalía", "Rosalía (cantante)"],
    ["Bustinduy", "Pablo Bustinduy"],
    ["Marcial Dorado", "marcial dorado"],
    ["El CIS", "CIS"],
    ["Tribunal de Cuentas", "El Tribunal de Cuentas"],
    ["[SIN DISCOVER] Microsoft", "microsoft"],
    ["Núcleo Nacional", "nucleo nacional"],
    ["Díaz Ayuso Isabel", "Isabel Díaz Ayuso"],
    ["Díaz Ayuso", "Isabel Díaz Ayuso"],
    ["Isabel Díaz", "Isabel Díaz Ayuso"],
    ["MARINA VALVERDE", "Marina Valverde"],
    ["Marina Valverde", "Marina Valverde (cantante)"],
    ["Marina Valverde (cantante)", "marina valverde (Cantante)"],
  ];
  const no: [string, string][] = [
    ["Pablo Sánchez", "Pedro Sánchez"],
    ["PP", "PPA"],
    ["Ana", "Santiana"],
    ["Vox", "Voxel"],
    ["Rosa", "Rosalía"],
    ["Juan Pérez", "Pérez Reverte"],
    ["", "Abascal"],
    ["Abascal", ""],
    ["(cantante)", "(actor)"],
    ["Luis Díaz", "Díaz Ayuso"],
    ["Pedro", "Pedro Sánchez"],
    // Defectos hallados por Lovable en las pruebas de fusión:
    ["Juan Valverde", "Juan Carlos Valverde"],
    ["Marina Valverde (política)", "Marina Valverde (cantante)"],
    ["Marina Valverde", "Pablo Valverde"],
    ["Isabel Ayuso", "Isabel Díaz Ayuso"],
  ];
  it.each(si)("%s ≈ %s", (a, b) => {
    expect(entidadesEquivalentes(a, b)).toBe(true);
    expect(entidadesEquivalentes(b, a)).toBe(true);
  });
  it.each(no)("%s ≠ %s", (a, b) => {
    expect(entidadesEquivalentes(a, b)).toBe(false);
    expect(entidadesEquivalentes(b, a)).toBe(false);
  });
});

const now = new Date("2026-11-14T10:00:00Z");
const config = { max_alertas_dia: "8", hora_inicio: "7", hora_fin: "24" };
const trend = (id: number, termino: string, volumen = "500+"): TendenciaAlerta => ({
  id,
  termino,
  volumen,
  capturado_en: "2026-11-14T09:50:00Z",
  noticias: [],
});
const xs = (nombres: string[]): TendenciaX[] =>
  nombres.map((nombre, i) => ({
    id: 900 + i,
    nombre,
    posicion: i + 1,
    capturado_en: "2026-11-14T09:00:00Z",
  }));
const reciente = (entidad: string) => ({ entidad, creada_en: "2026-11-14T08:00:00Z" });
const plan = (extra: Partial<Parameters<typeof planificarAlertasTrends>[0]> = {}) =>
  planificarAlertasTrends({
    now,
    trends: [],
    exclusiones: [],
    alertas: [],
    totalHoy: 0,
    config,
    ...extra,
  });

describe("planificarAlertasTrends: combinar con alertas existentes", () => {
  it("lo que habla de lo mismo que una alerta de Wikipedia va a «fusiones», no a «nuevas» ni «descartadas»", () => {
    const p = plan({
      xTendencias: xs(["Rosalía", "Bustinduy", "Marcial Dorado", "Colau"]),
      alertas: [
        reciente("[SIN DISCOVER] Rosalía (cantante)"),
        reciente("[SIN DISCOVER] Pablo Bustinduy"),
        reciente("[SIN DISCOVER] Marcial Dorado"),
      ],
    });
    expect(p.fusiones.map((a) => a.entidad).sort()).toEqual([
      "[SIN DISCOVER] Bustinduy",
      "[SIN DISCOVER] Marcial Dorado",
      "[SIN DISCOVER] Rosalía",
    ]);
    expect(p.nuevas.map((a) => a.entidad)).toEqual(["[SIN DISCOVER] Colau"]);
    expect(p.descartadas).toEqual([]);
    expect(p.fusiones.find((a) => a.entidad.includes("Rosal"))?.x_posicion).toBe(1);
  });

  it("combinar no gasta el tope diario, ni el límite de tres, ni exige estar en horario", () => {
    const nombres = ["Ayuso", "Abascal", "Colau", "Feijóo", "Marlaska"];
    const alertas = nombres.map((n) => reciente(`[SIN DISCOVER] ${n}`));
    const dentro = plan({ xTendencias: xs(nombres), alertas, totalHoy: 8 });
    expect(dentro.fusiones).toHaveLength(5);
    expect(dentro.nuevas).toHaveLength(0);
    expect(dentro.descartadas).toEqual([]);
    const fuera = planificarAlertasTrends({
      now: new Date("2026-11-14T03:00:00Z"),
      trends: [],
      exclusiones: [],
      alertas: nombres.map((n) => ({ entidad: n, creada_en: "2026-11-14T02:00:00Z" })),
      totalHoy: 0,
      config,
      xTendencias: nombres.map((nombre, i) => ({
        id: i,
        nombre,
        posicion: i + 1,
        capturado_en: "2026-11-14T02:30:00Z",
      })),
    });
    expect(fuera.fusiones).toHaveLength(5);
    expect(fuera.descartadas).toEqual([]);
  });

  it("dos candidatas de la misma ejecución sobre lo mismo: una nueva y la otra se combina con ella", () => {
    const p = plan({
      trends: [trend(1, "Isabel Díaz Ayuso", "2000+")],
      xTendencias: xs(["Ayuso"]),
    });
    // Trends y X se cruzan por nombre normalizado solo si son iguales; aquí no lo son, así que hay dos candidatas.
    expect(p.nuevas).toHaveLength(1);
    expect(p.fusiones).toHaveLength(1);
    expect(p.nuevas.length + p.fusiones.length).toBe(2);
  });

  it("las candidatas que combinan siguen pasando por exclusiones y por las reglas", () => {
    const reglas: Reglas = {
      si: parsearReglas("ayuso"),
      no: parsearReglas("tenis"),
      modo: "estricto",
    };
    const p = plan({
      reglas,
      exclusiones: ["colau"],
      xTendencias: xs(["Ayuso", "Colau", "Tenis de mesa", "Corvillo"]),
      alertas: [
        reciente("Isabel Díaz Ayuso"),
        reciente("Ada Colau"),
        reciente("Tenis de mesa"),
        reciente("Corvillo"),
      ],
    });
    expect(p.fusiones.map((a) => a.entidad)).toEqual(["[SIN DISCOVER] Ayuso"]);
    expect(p.descartadas.map((d) => [d.termino, d.motivo]).sort()).toEqual([
      ["Colau", "exclusion"],
      ["Corvillo", "reglas"],
      ["Tenis de mesa", "reglas"],
    ]);
  });

  it("una alerta de hace más de 24 horas no se combina", () => {
    const p = plan({
      xTendencias: xs(["Abascal"]),
      alertas: [{ entidad: "Santiago Abascal", creada_en: "2026-11-13T09:00:00Z" }],
    });
    expect(p.fusiones).toHaveLength(0);
    expect(p.nuevas.map((a) => a.entidad)).toEqual(["[SIN DISCOVER] Abascal"]);
  });
});

const pico = (articulo: string, ratio = 10): Pico => ({
  articulo,
  visitas: 9000,
  media_previa: 100,
  ratio,
});
describe("planificarAlertasWikipedia: reglas y combinación", () => {
  it("combina con alertas de X o Trends aunque el nombre sea distinto", () => {
    const p = planificarAlertasWikipedia({
      picos: [pico("Santiago Abascal"), pico("Rosalía (cantante)"), pico("Janet Jackson")],
      exclusiones: [],
      entidadesRecientes: ["[SIN DISCOVER] Abascal", "Rosalía"],
    });
    expect(p.fusiones.map((a) => a.entidad).sort()).toEqual([
      "[SIN DISCOVER] Rosalía (cantante)",
      "[SIN DISCOVER] Santiago Abascal",
    ]);
    expect(p.nuevas.map((a) => a.entidad)).toEqual(["[SIN DISCOVER] Janet Jackson"]);
    expect(p.fusiones[0]?.wikipedia_ratio).toBe(10);
  });

  it("el filtro de reglas manda: lo que encaja va primero y, en modo estricto, el espectáculo se descarta", () => {
    const picos = [
      pico("Janet Jackson", 50),
      pico("Avril Lavigne", 40),
      pico("Vox (partido político)", 5),
      pico("Pedro Sánchez", 4),
    ];
    const reglas = (modo: "permisivo" | "estricto"): Reglas => ({
      si: parsearReglas("vox => /politica/;pedro sanchez => /politica/"),
      no: [],
      modo,
    });
    const permisivo = planificarAlertasWikipedia({
      picos,
      exclusiones: [],
      entidadesRecientes: [],
      reglas: reglas("permisivo"),
    });
    expect(permisivo.nuevas.map((a) => a.entidad)).toEqual([
      "[SIN DISCOVER] Vox (partido político)",
      "[SIN DISCOVER] Pedro Sánchez",
      "[SIN DISCOVER] Janet Jackson",
    ]);
    expect(permisivo.nuevas[0]?.seccion_sugerida).toBe("/politica/");
    expect(permisivo.nuevas[0]?.motivo_afinidad).toContain("Encaja por reglas");
    const estricto = planificarAlertasWikipedia({
      picos,
      exclusiones: [],
      entidadesRecientes: [],
      reglas: reglas("estricto"),
    });
    expect(estricto.nuevas.map((a) => a.entidad)).toEqual([
      "[SIN DISCOVER] Vox (partido político)",
      "[SIN DISCOVER] Pedro Sánchez",
    ]);
    expect(estricto.descartadas.map((d) => [d.termino, d.motivo]).sort()).toEqual([
      ["Avril Lavigne", "reglas"],
      ["Janet Jackson", "reglas"],
    ]);
  });

  it("sin reglas se comporta como antes", () => {
    const p = planificarAlertasWikipedia({
      picos: [pico("Janet Jackson")],
      exclusiones: [],
      entidadesRecientes: [],
    });
    expect(p.nuevas).toHaveLength(1);
    expect(p.nuevas[0]?.motivo_afinidad).toBe("Sin filtro editorial todavía (solo Wikipedia)");
  });
});
