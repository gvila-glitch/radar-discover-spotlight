import { beforeEach, expect, it, vi } from 'vitest';
import { crearDemoAlertas } from '@/data/demoAlertas';
const mocks = vi.hoisted(() => ({ update: vi.fn(), getUser: vi.fn(), from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: mocks.getUser }, from: mocks.from } }));
import { valorar } from './alertasRepo';
beforeEach(() => vi.resetAllMocks());
it('guarda el email autenticado y solo los campos permitidos', async () => {
  mocks.getUser.mockResolvedValue({ data: { user: { email: 'editora@example.test' } }, error: null });
  mocks.from.mockReturnValue({ update: mocks.update });
  mocks.update.mockReturnValue({ eq: () => ({ select: () => ({ single: async () => ({ data: crearDemoAlertas()[0], error: null }) }) }) });
  await valorar(8, { estado: 'util', pieza_url: 'https://example.test/pieza', estado_actualizado_en: '2026-11-13T17:00:00Z', estado_por: 'email-falso' });
  expect(mocks.update).toHaveBeenCalledWith({ estado: 'util', pieza_url: null, estado_actualizado_en: '2026-11-13T17:00:00Z', estado_por: 'editora@example.test' });
});