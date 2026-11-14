import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { sendPasswordLink } from '@/lib/passwords';
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
  const [mode, setMode] = useState<'login' | 'setup' | 'forgot'>('login');
  const [sent, setSent] = useState(false);
  function changeMode(next: 'login' | 'setup' | 'forgot') { setMode(next); setError(''); setSent(false); setPassword(''); }
  return <main className="mx-auto max-w-sm px-4 py-16">
    <h1 className="tracking-tight text-3xl font-semibold">Radar Discover</h1>
    <h2 className="mt-6 text-lg font-medium">{mode === 'login' ? 'Iniciar sesión' : mode === 'setup' ? 'Establecer contraseña' : 'Recuperar contraseña'}</h2>
    <form className="mt-5 space-y-4" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError('');
      try {
        if (mode !== 'login') {
          await sendPasswordLink(email, window.location.origin);
          setSent(true); return;
        }
        const result = await supabase.auth.signInWithPassword({ email, password });
        if (result.error) { setError('No se pudo iniciar sesión. Comprueba el email y la contraseña.'); return; }
        await navigate({ to: '/' });
      } catch { setError('No se pudo conectar. Inténtalo de nuevo.'); }
      finally { setBusy(false); }
    }}>
      <label className="flex flex-col gap-1 text-sm">Email<input className="border bg-card px-3 py-2" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      {mode === 'login' && <label className="flex flex-col gap-1 text-sm">Contraseña<input className="border bg-card px-3 py-2" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {sent && <p role="status" className="text-sm">Si hay una cuenta con ese email, recibirás un enlace para elegir tu contraseña.</p>}
      <Button type="submit" disabled={busy}>{busy ? 'Enviando…' : mode === 'login' ? 'Iniciar sesión' : 'Enviar enlace seguro'}</Button>
    </form>
    <div className="mt-4 flex flex-col items-start gap-1">
      {mode === 'login' ? <>
        <Button variant="link" className="h-auto px-0 py-1" onClick={() => changeMode('setup')}>Establecer contraseña</Button>
        <Button variant="link" className="h-auto px-0 py-1" onClick={() => changeMode('forgot')}>He olvidado mi contraseña</Button>
      </> : <Button variant="link" className="h-auto px-0 py-1" onClick={() => changeMode('login')}>Volver al inicio de sesión</Button>}
    </div>
  </main>;
}
