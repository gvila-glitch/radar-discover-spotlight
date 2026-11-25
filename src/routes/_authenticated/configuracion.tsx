import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { enviarResumenDePrueba } from "@/lib/resumenEmail.functions";
import { listarUsuarios, altaUsuario, cambiarRol, bajaUsuario } from "@/lib/usuarios.functions";
import type { Rol } from "@/lib/usuariosReglas";
import { APARTADOS, apartadoValido, type Apartado } from "@/lib/configApartados";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { esAdmin, leerAjustes, guardarAjustes, listarMedios, anadirMedio, quitarMedio, marcarTop5, type Ajustes } from "@/lib/configRepo";

export const Route = createFileRoute("/_authenticated/configuracion")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { apartado: Apartado } => ({ apartado: apartadoValido(s["apartado"]) }),
  head: () => ({
    meta: [
      { title: "Configuración · Radar Discover" },
      { name: "description", content: "Ajustes del Radar Discover: perfil editorial, umbrales y medios de referencia." },
      { property: "og:title", content: "Configuración · Radar Discover" },
      { property: "og:description", content: "Ajustes del Radar Discover." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Configuracion,
});

function Configuracion() {
  const admin = useQuery({ queryKey: ["es_admin"], queryFn: esAdmin });
  return (
    <div className="min-h-screen">
      <header className="border-b border-caja bg-card">
        <div className="mx-auto flex max-w-7xl items-center px-4 py-3">
          <h1 className="tracking-tight text-xl font-semibold">Radar Discover</h1>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <h2 className="tracking-tight text-3xl font-semibold">Configuración</h2>
        {admin.isLoading ? <p className="mt-4 text-sm text-muted-foreground">Cargando…</p>
          : !admin.data ? <p role="alert" className="mt-4 text-sm">No tienes permiso para ver esta sección. <Link to="/" className="underline">Volver a alertas</Link></p>
          : <Paneles />}
      </main>
    </div>
  );
}

type Pestana = Apartado;

function Paneles() {
  const { apartado: tab } = Route.useSearch();
  const titulo = APARTADOS.find((a) => a.id === tab)?.label;
  return (
    <div className="mt-5 space-y-6">
      <p className="text-sm text-muted-foreground">{titulo}</p>
      <div className="min-w-0 space-y-6"><div hidden={tab === "medios" || tab === "usuarios"} className="space-y-6"><FormAjustes tab={tab === "medios" || tab === "usuarios" ? "perfil" : tab} /></div>{tab === "medios" && <Medios />}{tab === "usuarios" && <><Usuarios /><ResumenPrueba /></>}</div>
    </div>
  );
}

function Seccion({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <section className="border bg-card p-4">
      <h3 className="tracking-tight text-lg font-semibold">{titulo}</h3>
      {ayuda && <p className="mt-1 text-xs text-muted-foreground">{ayuda}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function FormAjustes({ tab }: { tab: Exclude<Pestana, "medios" | "usuarios"> }) {
  const q = useQuery({ queryKey: ["ajustes"], queryFn: leerAjustes });
  const [f, setF] = useState<Ajustes | null>(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { if (q.data) setF(q.data); }, [q.data]);
  if (q.isError) return <p role="alert" className="text-sm text-destructive">No se pudo cargar la configuración.</p>;
  if (!f || !q.data) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  const orig = q.data;
  const cambios = Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== orig[k as keyof Ajustes])) as Partial<Ajustes>;
  const set = (k: keyof Ajustes) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const numeros: (keyof Ajustes)[] = ["max_alertas_dia", "umbral_alta_medios", "umbral_media_medios"];
  const invalido = numeros.some((k) => !/^\d+$/.test(f[k].trim()));

  async function guardar() {
    setGuardando(true);
    try { await guardarAjustes(cambios); await q.refetch(); toast.success("Configuración guardada."); }
    catch { toast.error("No se pudo guardar. Inténtalo de nuevo."); }
    finally { setGuardando(false); }
  }

  const texto = (k: keyof Ajustes, titulo: string, ayuda: string, rows = 8) => (
    <Seccion titulo={titulo} ayuda={ayuda}>
      <Textarea aria-label={titulo} value={f[k]} onChange={set(k)} rows={rows} className="text-sm" />
    </Seccion>
  );
  const num = (k: keyof Ajustes, label: string, ayuda: string) => (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <Input type="number" min={0} value={f[k]} onChange={set(k)} className="mt-1 w-28 tabular-nums" />
      <span className="mt-1 block text-xs text-muted-foreground">{ayuda}</span>
    </label>
  );

  return (
    <>
      {tab === "perfil" && texto("perfil_editorial", "Perfil editorial", "Describe al periódico y orienta qué alertas son relevantes.", 16)}
      {tab === "ambito" && texto("ambito", "Ámbito", "Qué temas entran y cuáles no.")}
      {tab === "ambito" && texto("excepciones", "Excepciones", "Casos que deben avisarse o descartarse aunque no encajen en el ámbito.")}
      {tab === "limites" && <Seccion titulo="Límites y umbrales">
        <div className="grid gap-4 sm:grid-cols-3">
          {num("max_alertas_dia", "Alertas por día", "Máximo de alertas diarias.")}
          {num("umbral_alta_medios", "Umbral prioridad alta", "Máximo de medios ya en Discover para prioridad alta.")}
          {num("umbral_media_medios", "Umbral prioridad media", "Máximo de medios ya en Discover para prioridad media.")}
        </div>
        {invalido && <p role="alert" className="mt-3 text-xs text-destructive">Los límites y umbrales deben ser números enteros.</p>}
      </Seccion>}
      {Object.keys(cambios).length > 0 && <p className="text-xs text-muted-foreground">Hay cambios sin guardar ({Object.keys(cambios).length}). Se conservan al cambiar de apartado.</p>}
      <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background py-3">
        <Button variant="outline" disabled={!Object.keys(cambios).length || guardando} onClick={() => setF(orig)}>Descartar</Button>
        <Button onClick={guardar} disabled={!Object.keys(cambios).length || guardando || invalido}>{guardando ? "Guardando…" : "Guardar cambios"}</Button>
      </div>
    </>
  );
}

function Medios() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["medios"], queryFn: listarMedios });
  const [dominio, setDominio] = useState("");
  const [nombre, setNombre] = useState("");
  const refrescar = () => qc.invalidateQueries({ queryKey: ["medios"] });

  async function anadir(e: React.FormEvent) {
    e.preventDefault();
    if (!dominio.trim()) return;
    try { await anadirMedio(dominio, nombre); setDominio(""); setNombre(""); refrescar(); toast.success("Medio añadido."); }
    catch { toast.error("No se pudo añadir. ¿Ya estaba en la lista?"); }
  }
  async function quitar(d: string) {
    if (!confirm(`¿Quitar ${d} de los medios de referencia?`)) return;
    try { await quitarMedio(d); refrescar(); } catch { toast.error("No se pudo quitar."); }
  }
  async function top5(d: string, v: boolean) {
    try { await marcarTop5(d, v); refrescar(); } catch { toast.error("No se pudo guardar."); }
  }

  return (
    <Seccion titulo="Medios de referencia" ayuda="Medios cuya presencia en Discover se vigila. Marca los cinco principales.">
      <form onSubmit={anadir} className="flex flex-wrap gap-2">
        <Input aria-label="Dominio" placeholder="dominio.com" value={dominio} onChange={(e) => setDominio(e.target.value)} className="w-48" />
        <Input aria-label="Nombre" placeholder="Nombre (opcional)" value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-48" />
        <Button type="submit" disabled={!dominio.trim()}>Añadir</Button>
      </form>
      {q.isLoading ? <p className="mt-3 text-sm text-muted-foreground">Cargando…</p>
        : !q.data?.length ? <p className="mt-3 text-sm text-muted-foreground">Todavía no hay medios.</p>
        : (
          <ul className="mt-3 divide-y border">
            {q.data.map((m) => (
              <li key={m.dominio} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1"><span className="tabular-nums">{m.dominio}</span>{m.nombre && <span className="ml-2 text-muted-foreground">{m.nombre}</span>}</div>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input type="checkbox" checked={!!m.top5} onChange={(e) => top5(m.dominio, e.target.checked)} /> Top 5
                </label>
                <button onClick={() => quitar(m.dominio)} aria-label={`Quitar ${m.dominio}`} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
        )}
    </Seccion>
  );
}

const errorTexto = (e: unknown) => (e instanceof Error && e.message && e.message.length < 120 ? e.message : "No se pudo completar la acción.");

function ResumenPrueba() {
  const enviar = useServerFn(enviarResumenDePrueba);
  const [ocupado, setOcupado] = useState(false);
  const [estado, setEstado] = useState<{ ok: boolean; mensaje: string } | null>(null);
  async function probar() {
    setOcupado(true); setEstado(null);
    try { const r = await enviar(); setEstado(r); r.ok ? toast.success(r.mensaje) : toast.error(r.mensaje); }
    catch (e) { const m = errorTexto(e); setEstado({ ok: false, mensaje: m }); toast.error(m); }
    finally { setOcupado(false); }
  }
  return (
    <Seccion titulo="Resumen por email" ayuda="Se envía a las 8:00 y a las 16:00. La prueba manda ya un resumen real con las alertas de las últimas 24 horas y no cuenta como último envío.">
      <Button onClick={probar} disabled={ocupado}>{ocupado ? "Enviando…" : "Enviar resumen de prueba ahora"}</Button>
      {estado && <p role="status" className={`mt-3 text-sm ${estado.ok ? "text-muted-foreground" : "text-destructive"}`}>{estado.ok ? "Ha ido bien. " : "No se pudo enviar. "}{estado.mensaje}</p>}
    </Seccion>
  );
}

function Usuarios() {
  const qc = useQueryClient();
  const listar = useServerFn(listarUsuarios), alta = useServerFn(altaUsuario), rol = useServerFn(cambiarRol), baja = useServerFn(bajaUsuario);
  const q = useQuery({ queryKey: ["usuarios"], queryFn: () => listar() });
  const [email, setEmail] = useState("");
  const [nuevoRol, setNuevoRol] = useState<Rol>("usuario");
  const [ocupado, setOcupado] = useState(false);
  const refrescar = () => qc.invalidateQueries({ queryKey: ["usuarios"] });
  async function accion(fn: () => Promise<unknown>, ok: string) {
    setOcupado(true);
    try { await fn(); toast.success(ok); refrescar(); } catch (e) { toast.error(errorTexto(e)); } finally { setOcupado(false); }
  }
  return (
    <Seccion titulo="Usuarios" ayuda="Las personas invitadas reciben un correo para elegir su propia contraseña. Los admin ven Configuración; los usuarios, solo las alertas.">
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); accion(async () => { const r = await alta({ data: { email, rol: nuevoRol } }); setEmail(""); return r; }, "Usuario dado de alta. Se ha enviado la invitación si no tenía cuenta."); }}>
        <Input aria-label="Email" type="email" placeholder="persona@eldiario.es" value={email} onChange={(e) => setEmail(e.target.value)} className="w-64" />
        <select aria-label="Rol" value={nuevoRol} onChange={(e) => setNuevoRol(e.target.value as Rol)} className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="usuario">Usuario</option><option value="admin">Admin</option>
        </select>
        <Button type="submit" disabled={!email.trim() || ocupado}>Dar de alta</Button>
      </form>
      {q.isLoading ? <p className="mt-3 text-sm text-muted-foreground">Cargando…</p>
        : q.isError ? <p role="alert" className="mt-3 text-sm text-destructive">No se pudo cargar la lista.</p>
        : (
          <ul className="mt-3 divide-y border">
            {q.data?.map((u) => (
              <li key={u.email} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1"><span className="tabular-nums">{u.email}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{u.activado ? "Activa" : u.cuenta ? "Invitación pendiente" : "Sin cuenta"}</span></div>
                <select aria-label={`Rol de ${u.email}`} value={u.rol} disabled={ocupado} onChange={(e) => accion(() => rol({ data: { email: u.email, rol: e.target.value as Rol } }), "Rol actualizado.")} className="h-8 rounded-md border bg-background px-2 text-xs">
                  <option value="usuario">Usuario</option><option value="admin">Admin</option>
                </select>
                <button disabled={ocupado} onClick={() => { if (confirm(`¿Quitar el acceso a ${u.email}?`)) accion(() => baja({ data: { email: u.email } }), "Acceso retirado."); }} aria-label={`Quitar acceso a ${u.email}`} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
        )}
    </Seccion>
  );
}
