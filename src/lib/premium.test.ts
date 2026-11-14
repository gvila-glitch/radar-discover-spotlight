import { describe, it, expect } from 'vitest';
import { PREMIUM, exigirPruebas } from './premium';
describe('Premium de prueba', () => {
  it('cuesta exactamente diez euros', () => { expect(PREMIUM.amount).toBe(1000); expect(PREMIUM.currency).toBe('eur'); });
  it('es mensual', () => { expect(PREMIUM.interval).toBe('month'); });
  it('no activa IA Advisor', () => { expect(PREMIUM.advisorAvailable).toBe(false); });
  it('impide cobros reales', () => { expect(() => exigirPruebas('live')).toThrow(); expect(() => exigirPruebas('sandbox')).not.toThrow(); });
});
