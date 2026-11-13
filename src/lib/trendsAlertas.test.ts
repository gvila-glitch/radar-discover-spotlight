import { describe, expect, it } from 'vitest';
import { inicioDiaMadrid, planificarAlertasTrends, volumenNumerico, type TendenciaAlerta } from './trendsAlertas';

const now = new Date('2026-11-13T18:27:00Z');
const config = { max_alertas_dia: '8', hora_inicio: '7', hora_fin: '24' };
const trend = (termino: string, volumen = '500+', age = 5, id = 1): TendenciaAlerta => ({
  id, termino, volumen, capturado_en: new Date(now.getTime() - age * 60000).toISOString(), noticias: [],
});
const base = { now, config, exclusiones: [], alertas: [], totalHoy: 0, trends: [trend('Presupuestos')] };
describe('Trends a alertas', () => {
  it('usa 30 minutos y la lectura más reciente de cada término', () => {
    const result = planificarAlertasTrends({ ...base, trends: [trend('Debate', '500+', 10, 1), trend('Debate', '2000+', 5, 2), trend('Antigua', '500+', 31)] });
    expect(result.nuevas.map(a => [a.entidad, a.trends_crecimiento])).toEqual([['[SIN DISCOVER] Debate', '2000+']]);
    expect(result.ventana_minutos).toBe(30);
    expect(result.lecturas_repetidas).toBe(1);
  });
  it('usa hasta 2 horas únicamente cuando no hay lecturas de los últimos 30 minutos', () => {
    const result = planificarAlertasTrends({ ...base, trends: [trend('Reciente', '500+', 120), trend('Antigua', '500+', 121)] });
    expect(result.ventana_minutos).toBe(120);
    expect(result.nuevas.map(a => a.entidad)).toEqual(['[SIN DISCOVER] Reciente']);
  });
  it('excluye por coincidencia parcial sin distinguir mayúsculas', () => {
    const result = planificarAlertasTrends({ ...base, exclusiones: ['SUPUEST'], trends: [trend('Presupuestos')] });
    expect(result.nuevas).toHaveLength(0);
    expect(result.descartadas).toEqual([{ termino: 'Presupuestos', motivo: 'exclusion' }]);
  });
  it('evita duplicados durante 24 horas ignorando prefijo y mayúsculas', () => {
    const result = planificarAlertasTrends({ ...base, alertas: [{ entidad: '[PRUEBA] PRESUPUESTOS', creada_en: new Date(now.getTime() - 24 * 3600000).toISOString() }] });
    expect(result.nuevas).toHaveLength(0);
    expect(result.descartadas[0]?.motivo).toBe('ya_avisada');
    expect(planificarAlertasTrends({ ...base, alertas: [{ entidad: 'PRESUPUESTOS', creada_en: new Date(now.getTime() - 24 * 3600000 - 1).toISOString() }] }).nuevas).toHaveLength(1);
  });
  it('ignora SIN DISCOVER al comprobar las entidades ya avisadas', () => {
    const result = planificarAlertasTrends({ ...base, alertas: [{ entidad: '[SIN DISCOVER] PRESUPUESTOS', creada_en: now.toISOString() }] });
    expect(result.nuevas).toHaveLength(0);
    expect(result.descartadas).toEqual([{ termino: 'Presupuestos', motivo: 'ya_avisada' }]);
  });
  it('no crea fuera del horario de Madrid y respeta sus límites', () => {
    expect(planificarAlertasTrends({ ...base, now: new Date('2026-11-13T05:59:00Z'), trends: [trend('Debate', '500+', 760)] }).descartadas[0]?.motivo).toBe('fuera_de_horario');
    const atStart = new Date('2026-11-13T06:00:00Z');
    expect(planificarAlertasTrends({ ...base, now: atStart, trends: [{ ...trend('Debate'), capturado_en: atStart.toISOString() }] }).nuevas).toHaveLength(1);
    const atEnd = new Date('2026-11-13T23:00:00Z');
    expect(planificarAlertasTrends({ ...base, now: atEnd, trends: [{ ...trend('Debate'), capturado_en: atEnd.toISOString() }] }).descartadas[0]?.motivo).toBe('fuera_de_horario');
  });
  it('cuenta el día de Madrid incluso en los cambios de hora', () => {
    expect(inicioDiaMadrid(now).toISOString()).toBe('2026-11-12T23:00:00.000Z');
    expect(inicioDiaMadrid(new Date('2026-03-29T18:00:00Z')).toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(inicioDiaMadrid(new Date('2026-10-25T18:00:00Z')).toISOString()).toBe('2026-10-24T22:00:00.000Z');
  });
  it('no supera el máximo diario incluyendo las alertas que ya existen', () => {
    const result = planificarAlertasTrends({ ...base, totalHoy: 7, trends: [trend('A'), trend('B')] });
    expect(result.nuevas).toHaveLength(1);
    expect(result.descartadas).toEqual([{ termino: 'B', motivo: 'tope_diario' }]);
    expect(planificarAlertasTrends({ ...base, totalHoy: 8 }).nuevas).toHaveLength(0);
  });
  it('crea como mucho 3 por ejecución empezando por mayor volumen', () => {
    const result = planificarAlertasTrends({ ...base, trends: [trend('A', '500+'), trend('B', '2000+'), trend('C', '100+'), trend('D', '1000+')] });
    expect(result.nuevas.map(a => a.entidad)).toEqual(['[SIN DISCOVER] B', '[SIN DISCOVER] D', '[SIN DISCOVER] A']);
    expect(result.descartadas).toEqual([{ termino: 'C', motivo: 'limite_ejecucion' }]);
    expect(volumenNumerico('2K+')).toBe(2000);
  });
  it('guarda exactamente los campos pedidos y el primer titular', () => {
    const result = planificarAlertasTrends({ ...base, trends: [{ ...trend('Debate', '2000+'), noticias: [{ titular: 'El primer titular' }, { titular: 'El segundo' }] }] });
    expect(result.nuevas[0]).toEqual({ entidad: '[SIN DISCOVER] Debate', contexto: 'El primer titular · Fuente: Google Trends',
      prioridad: 'media', trends_activo: true, trends_crecimiento: '2000+', x_posicion: null, x_desde: null,
      medios_discover: 0, medios_lista: [], titulares_seo: [], angulo: 'Pendiente: aún sin IA',
      seccion_sugerida: 'Sin sugerir', motivo_afinidad: 'Sin filtro editorial todavía (solo Trends)', estado: 'pendiente' });
    expect(planificarAlertasTrends(base).nuevas[0]?.contexto).toBe('Tendencia en Google España · Fuente: Google Trends');
  });
  it('no repite las entidades tras una primera ejecución', () => {
    const first = planificarAlertasTrends(base);
    const second = planificarAlertasTrends({ ...base, totalHoy: first.nuevas.length, alertas: first.nuevas.map(a => ({ entidad: a.entidad, creada_en: now.toISOString() })) });
    expect(first.nuevas).toHaveLength(1);
    expect(second.nuevas).toHaveLength(0);
    expect(second.descartadas[0]?.motivo).toBe('ya_avisada');
  });
  it('falla sin crear alertas si falta la configuración', () => {
    expect(() => planificarAlertasTrends({ ...base, config: {} })).toThrow('Configuración');
  });
});