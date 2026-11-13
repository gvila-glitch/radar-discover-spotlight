import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ reset: vi.fn(), update: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { resetPasswordForEmail: mocks.reset, updateUser: mocks.update } } }));
import { passwordError, sendPasswordLink, savePassword } from './passwords';
it('recovery returns to the public same-origin password page', async () => {
  mocks.reset.mockResolvedValue({ error: null });
  await sendPasswordLink('invitada@example.test', 'https://radar.example.test');
  expect(mocks.reset).toHaveBeenCalledWith('invitada@example.test', { redirectTo: 'https://radar.example.test/reset-password' });
});
it('requires eight characters and matching confirmation', () => {
  expect(passwordError('short', 'short')).not.toBeNull();
  expect(passwordError('example-long', 'different')).not.toBeNull();
  expect(passwordError('example-long', 'example-long')).toBeNull();
});
it('uses managed password recovery without requesting a current password', async () => {
  mocks.update.mockResolvedValue({ error: null });
  await savePassword('example-long');
  expect(mocks.update).toHaveBeenCalledWith({ password: 'example-long' });
});