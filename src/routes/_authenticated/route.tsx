import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { PanelIdentity } from '@/lib/panelAuth';
import { Button } from '@/components/ui/button';
export const Route = createFileRoute('/_authenticated')({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.email) throw redirect({ to: '/auth' });
    return { email: data.user.email };
  },
  loader: async () => {
    const { data, error } = await supabase.rpc('es_equipo');
    if (error) throw new Error('No se pudo comprobar el acceso al equipo.');
    return { allowed: data === true };
  }, component: TeamLayout,
});
function TeamLayout() {
  const { email } = Route.useRouteContext();
  const { allowed } = Route.useLoaderData();
  if (!allowed) return <main className="mx-auto max-w-lg px-4 py-16">
    <h1 className="font-serif text-3xl font-semibold">Radar Discover</h1>
    <p role="alert" className="my-6">Tu cuenta no tiene acceso a este panel</p>
    <Button variant="outline" onClick={() => supabase.auth.signOut()}>Cerrar sesión</Button>
  </main>;
  return <PanelIdentity.Provider value={email}><Outlet /></PanelIdentity.Provider>;
}
