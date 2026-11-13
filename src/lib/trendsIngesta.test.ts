import { afterEach, describe, expect, it, vi } from 'vitest';
import { GOOGLE_TIMEOUT_MS, ingestTrends, parseTrendsRss, TRENDS_RSS_URL } from './trendsIngesta';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';
import { readFileSync } from 'node:fs';
const rss = `<rss><channel><item><title>Debate &amp; vivienda</title><ht:approx_traffic>2000+</ht:approx_traffic><pubDate>Fri, 13 Nov 2026 09:30:00 -0800</pubDate><picture>omitida</picture><description>omitida</description><link>omitido</link><ht:news_item><ht:news_item_title>Un debate</ht:news_item_title><ht:news_item_url>https://example.com/noticia</ht:news_item_url><ht:news_item_source>Medio A</ht:news_item_source></ht:news_item></item><item><title>Presupuestos</title><ht:approx_traffic>500+</ht:approx_traffic><pubDate>Fri, 13 Nov 2026 10:00:00 -0800</pubDate></item></channel></rss>`;
afterEach(() => { vi.useRealTimers(); });
describe('Google Trends España', () => {
  it('la limpieza aplicada elimina solo lecturas anteriores a 30 días', () => {
    const sql = readFileSync('drizzle/migrations/0002_0004_cron_trends.sql', 'utf8');
    expect(sql).toMatch(/delete from public\.trends where capturado_en < now\(\) - interval '30 days'/);
    expect(sql).toContain('revoke all on function public.limpiar_trends() from public, anon, authenticated');
  });
  it('guarda tramos de texto, interpreta -0800 y omite campos no pedidos', () => {
    expect(parseTrendsRss(rss)[0]).toEqual({ termino: 'Debate & vivienda', volumen: '2000+', empezo_en: '2026-11-13T17:30:00.000Z', noticias: [{ titular: 'Un debate', url: 'https://example.com/noticia', medio: 'Medio A' }] });
  });
  it('inserta una fila por tendencia en un solo lote, con noticias vacías y fecha por defecto', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const fetchRss = vi.fn<typeof fetch>().mockResolvedValue(new Response(rss));
    expect((await ingestTrends(save, fetchRss)).filas_guardadas).toBe(2);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0][1]).toEqual({ termino: 'Presupuestos', volumen: '500+', empezo_en: '2026-11-13T18:00:00.000Z', noticias: [] });
    expect(fetchRss).toHaveBeenCalledWith(TRENDS_RSS_URL, expect.objectContaining({ headers: { 'User-Agent': 'rss-reader/1.0' } }));
  });
  it.each([new Response('', { status: 503 }), new Response('<rss><channel></channel></rss>'), new Response('<rss>'), new Response('<rss><channel><item><title> </title></item></channel></rss>')])('no inserta con error o sin títulos', async response => {
    const save = vi.fn();
    await expect(ingestTrends(save, vi.fn<typeof fetch>().mockResolvedValue(response))).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
  });
  it('aborta a los 10 segundos sin insertar', async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const fetchRss = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const pending = expect(ingestTrends(save, fetchRss)).rejects.toThrow('10 segundos');
    expect(GOOGLE_TIMEOUT_MS).toBe(10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    await pending;
    expect(save).not.toHaveBeenCalled();
  });
  it('rechaza sin credencial con 401 usando la configuración real sin revelarla', async () => {
    expect((await authenticateCronRequest(new Request('https://example.com', { method: 'POST' })))?.status).toBe(401);
  });
});