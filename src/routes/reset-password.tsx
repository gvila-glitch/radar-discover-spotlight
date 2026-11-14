import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { passwordError, savePassword } from '@/lib/passwords';

export const Route = createFileRoute('/reset-password')({
  head: () => ({ meta: [
    { title: 'Establecer contraseña · Radar Discover' },
    { name: 'description', content: 'Elige tu contraseña mediante un enlace seguro de Radar Discover.' },
    { property: 'og:title', content: 'Establecer contraseña · Radar Discover' },
    { property: 'og:description', content: 'Acceso seguro para las cuentas invitadas a Radar Discover.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }), component: ResetPassword,
});

function ResetPassword() {
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid' | 'saved'>('checking');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const type = new URLSearchParams(window.location.hash.slice(1)).get('type');
    const link = type === 'recovery' || type === 'invite' || sessionStorage.getItem('radar-password-link') === 'true';
    if (link) sessionStorage.setItem('radar-password-link', 'true');
    void supabase.auth.getUser().then(({ data, error }) => {
      if (active) setStatus(link && !error && data.user ? 'ready' : 'invalid');
    }).catch(() => { if (active) setStatus('invalid'); });
    return () => { active = false; };
  }, []);
  return <main className="mx-auto max-w-sm px-4 py-16">
    <h1 className="tracking-tight text-3xl font-semibold">Radar Discover</h1>
    <h2 className="mt-6 text-lg font-medium">Establecer contraseña</h2>
    {status === 'checking' && <p className="mt-5 text-sm text-muted-foreground">Comprobando enlace…</p>}
    {status === 'invalid' && <div className="mt-5 space-y-4">
      <p role="alert" className="text-sm">El enlace no es válido o ha caducado. Solicita uno nuevo.</p>
      <Button asChild variant="outline"><Link to="/auth">Volver al inicio de sesión</Link></Button>
    </div>}
    {status === 'saved' && <div className="mt-5 space-y-4">
      <p role="status" className="text-sm">Contraseña guardada. Ya puedes iniciar sesión.</p>
      <Button asChild><Link to="/auth">Iniciar sesión</Link></Button>
    </div>}
    {status === 'ready' && <form className="mt-5 space-y-4" onSubmit={async e => {
      e.preventDefault(); const validation = passwordError(password, confirmation);
      if (validation) { setError(validation); return; }
      setBusy(true); setError('');
      try {
        await savePassword(password);
        sessionStorage.removeItem('radar-password-link');
        setPassword(''); setConfirmation(''); setStatus('saved');
        await supabase.auth.signOut();
      } catch { setError('No se pudo guardar. Elige una contraseña más segura o solicita otro enlace.'); }
      finally { setBusy(false); }
    }}>
      <label className="flex flex-col gap-1 text-sm">Nueva contraseña<input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} className="border bg-card px-3 py-2" /></label>
      <label className="flex flex-col gap-1 text-sm">Repetir contraseña<input type="password" autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} className="border bg-card px-3 py-2" /></label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar contraseña'}</Button>
    </form>}
  </main>;
}