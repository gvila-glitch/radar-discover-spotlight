import { supabase } from '@/integrations/supabase/client';

export function passwordError(password: string, confirmation: string) {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (password !== confirmation) return 'Las contraseñas no coinciden.';
  return null;
}

export async function sendPasswordLink(email: string, origin: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  });
  if (error) throw error;
}

export async function savePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}