import { afterEach, expect, it, vi } from 'vitest';
import { APIFY_TIMEOUT_MS, APIFY_X_INPUT, APIFY_X_URL, frenoX, ingestX, leerApifyX, parseXTendencias } from './xIngesta';
const now = new Date('2026-11-13T20:00:00Z');
const config = { hora_inicio: '7', hora_fin: '24' };
const row = { rank: 1, name: 'Tema de prueba', query: 'omitida', url: 'omitida', location: 'ES', woeid: 1 };
afterEach(() => vi.useRealTimers());
it('mapea solo los cuatro campos y usa null y 0 cuando faltan', () => {
  expect(parseXTendencias([row])).toEqual([{ posicion: 1, nombre: 'Tema de prueba', categoria: null, publicaciones: 0 }]);
  expect(parseXTendencias([{ ...row, category: 'Política', postCount: 123 }])[0]).toEqual({ posicion: 1, nombre: 'Tema de prueba', categoria: 'Política', publicaciones: 123 });
});
it('bloquea hasta 45 minutos y permite exactamente 45', () => {
  expect(frenoX({ now, config, capturas: [new Date(+now - 44 * 60000).toISOString()] })?.motivo).toBe('captura_reciente');
  expect(frenoX({ now, config, capturas: [new Date(+now - 45 * 60000).toISOString()] })).toBeNull();
});
it('bloquea 20 capturas distintas de hoy en Madrid, no 20 filas de una captura', () => {
  const capturas = Array.from({ length: 20 }, (_, i) => new Date('2026-11-13T00:00:00Z').getTime() + i * 3600000).map(t => new Date(t).toISOString());
  expect(frenoX({ now, config, capturas, ignorarHorario: true })?.motivo).toBe('tope_diario');
  expect(frenoX({ now, config, capturas: Array(20).fill(capturas[0]) })).toBeNull();
});
it('el día de Madrid empieza antes que el de UTC', () => {
  const capturas = Array.from({ length: 20 }, (_, i) => new Date(Date.parse('2026-11-12T23:00:00Z') + i * 1000).toISOString());
  expect(frenoX({ now, config, capturas })?.motivo).toBe('tope_diario');
});
it('respeta horario de Madrid y la excepción manual no evita los otros frenos', () => {
  const morning = new Date('2026-11-13T05:00:00Z');
  expect(frenoX({ now: morning, config, capturas: [] })?.motivo).toBe('fuera_de_horario');
  expect(frenoX({ now: morning, config, capturas: [], ignorarHorario: true })).toBeNull();
  expect(frenoX({ now: morning, config, capturas: [morning.toISOString()], ignorarHorario: true })?.motivo).toBe('captura_reciente');
});
it('rechaza configuración inválida antes de pagar', () => {
  expect(() => frenoX({ now, capturas: [], config: { hora_inicio: null, hora_fin: '24' } })).toThrow();
});
it('el freno evita llamada, lectura de token y escritura', async () => {
  const fetchApify = vi.fn(); const save = vi.fn(); const token = vi.fn();
  expect((await ingestX({ now, config, capturas: [now.toISOString()], token, save, fetchApify })).saltada).toBe(true);
  expect(fetchApify).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled(); expect(token).not.toHaveBeenCalled();
});
it('llama una vez al actor correcto con ES y máximo 30, guardando un lote', async () => {
  const fetchApify = vi.fn().mockResolvedValue(new Response(JSON.stringify([row]))); const save = vi.fn();
  const result = await ingestX({ now, config, capturas: [], token: () => 'credencial-ficticia-solo-mock', save, fetchApify });
  expect(result.filas_guardadas).toBe(1); expect(fetchApify).toHaveBeenCalledTimes(1); expect(save).toHaveBeenCalledTimes(1);
  expect(fetchApify.mock.calls[0]?.[0]).toBe(APIFY_X_URL);
  expect(JSON.parse(fetchApify.mock.calls[0]?.[1].body)).toEqual({ locations: ['ES'], maxTrendsPerLocation: 30 });
  expect(APIFY_X_INPUT.maxTrendsPerLocation).toBe(30);
});
it.each([{ value: [] }, { value: [{ rank: 1 }] }, { value: [{ ...row, rank: 31 }] }])('lista vacía o inválida no guarda datos', async ({ value }) => {
  const save = vi.fn(); const fetchApify = vi.fn().mockResolvedValue(new Response(JSON.stringify(value)));
  await expect(ingestX({ now, config, capturas: [], token: () => 'mock', save, fetchApify })).rejects.toThrow();
  expect(save).not.toHaveBeenCalled(); expect(fetchApify).toHaveBeenCalledTimes(1);
});
it('error HTTP no reintenta ni guarda ni revela el cuerpo', async () => {
  const save = vi.fn(); const fetchApify = vi.fn().mockResolvedValue(new Response('detalle privado simulado', { status: 403 }));
  await expect(ingestX({ now, config, capturas: [], token: () => 'mock', save, fetchApify })).rejects.toThrow('Apify respondió con HTTP 403. No se guardó nada.');
  expect(fetchApify).toHaveBeenCalledTimes(1); expect(save).not.toHaveBeenCalled();
});
it('corta a los 120 segundos y nunca reintenta', async () => {
  vi.useFakeTimers();
  const fetchApify = vi.fn((_url, input) => new Promise<Response>((_resolve, reject) => input.signal.addEventListener('abort', () => reject(new Error('aborted')))));
  const result = expect(leerApifyX('mock', fetchApify)).rejects.toThrow('120 segundos');
  expect(APIFY_TIMEOUT_MS).toBe(120000);
  await vi.advanceTimersByTimeAsync(120000); await result; expect(fetchApify).toHaveBeenCalledTimes(1);
});