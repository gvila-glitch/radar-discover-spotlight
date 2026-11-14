import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { esAdmin, leerPerfilEditorial, guardarPerfilEditorial } from "@/lib/configRepo";
import { Nav } from "@/components/radar/Nav";

export const Route = createFileRoute("/_authenticated/configuracion")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Configuración · Radar Discover" },
      { name: "description", content: "Ajustes del Radar Discover: perfil editorial." },
      { property: "og:title", content: "Configuración · Radar Discover" },
      { property: "og:description", content: "Ajustes del Radar Discover: perfil editorial." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Configuracion,
});

function Configuracion() {
  const admin = useQuery({ queryKey: ["es_admin"], queryFn: esAdmin });
  const perfil = useQuery({ queryKey: ["perfil_editorial"], queryFn: leerPerfilEditorial, enabled: admin.data === true });
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { if (perfil.data !== undefined) setTexto(perfil.data); }, [perfil.data]);

  async function guardar() {
    setGuardando(true);
    try { await guardarPerfilEditorial(texto); await perfil.refetch(); toast.success("Perfil editorial guardado."); }
    catch { toast.error("No se pudo guardar. Inténtalo de nuevo."); }
    finally { setGuardando(false); }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-6 px-4 py-3">
          <h1 className="font-serif text-xl font-semibold">Radar Discover</h1>
          <Nav />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h2 className="font-serif text-3xl font-semibold">Configuración</h2>
        {admin.isLoading ? <p className="mt-4 text-sm text-muted-foreground">Cargando…</p>
          : !admin.data ? <p role="alert" className="mt-4 text-sm">No tienes permiso para ver esta sección. <Link to="/" className="underline">Volver a alertas</Link></p>
          : (
            <section className="mt-6 border bg-card p-4">
              <label htmlFor="perfil" className="font-serif text-lg font-semibold">Perfil editorial</label>
              <p className="mt-1 text-xs text-muted-foreground">Instrucciones que describen al periódico y orientan qué alertas son relevantes.</p>
              <Textarea id="perfil" value={texto} onChange={(e) => setTexto(e.target.value)} rows={14} className="mt-3 font-mono text-sm" disabled={perfil.isLoading} />
              <div className="mt-3 flex justify-end">
                <Button onClick={guardar} disabled={guardando || perfil.isLoading || texto === (perfil.data ?? "")}>{guardando ? "Guardando…" : "Guardar"}</Button>
              </div>
            </section>
          )}
      </main>
    </div>
  );
}
