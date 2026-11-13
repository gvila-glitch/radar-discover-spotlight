import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
export const Route = createFileRoute('/auth')({
  head: () => ({ meta: [
    { title: 'Iniciar sesión · Radar Discover' },
    { name: 'description', content: 'Acceso privado al panel Radar Discover.' },
    { property: 'og:title', content: 'Iniciar sesión · Radar Discover' },
    { property: 'og:description', content: 'Acceso privado al equipo de Radar Discover.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }), component: Login,
});
function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <main className="mx-auto max-w-sm px-4 py-16">
    <h1 className="font-serif text-3xl font-semibold">Radar Discover</h1>
    <h2 className="mt-6 text-lg font-medium">Iniciar sesión</h2>
    <form className="mt-5 space-y-4" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError('');
      try {
        const result = await supabase.auth.signInWithPassword({ email, password });
        if (result.error) { setError('No se pudo iniciar sesión. Comprueba el email y la contraseña.'); return; }
        await navigate({ to: '/' });
      } catch { setError('No se pudo conectar. Inténtalo de nuevo.'); }
      finally { setBusy(false); }
    }}>
      <label className="flex flex-col gap-1 text-sm">Email<input className="border bg-card px-3 py-2" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label className="flex flex-col gap-1 text-sm">Contraseña<input className="border bg-card px-3 py-2" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Iniciar sesión'}</Button>
    </form>
  </main>;
}
