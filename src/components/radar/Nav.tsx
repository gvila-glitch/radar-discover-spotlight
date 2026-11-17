import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Bell, Settings, PanelLeftClose, PanelLeftOpen, ChevronDown, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { esAdmin } from "@/lib/configRepo";
import { APARTADOS } from "@/lib/configApartados";

// Menú lateral: plegado la primera vez y recuerda en el navegador lo que elige cada persona. En Configuración se
// despliega solo (sus apartados solo están aquí) y al salir vuelve a como estaba.
const CLAVE_MENU = "radar_menu_abierto_v1";
const leerMenu = (): boolean => {
  try { return window.localStorage.getItem(CLAVE_MENU) === "1"; } catch { return false; }
};
const guardarMenu = (abierto: boolean) => {
  try { window.localStorage.setItem(CLAVE_MENU, abierto ? "1" : "0"); } catch { /* sin almacenamiento: vale para esta visita */ }
};

export function Sidebar() {
  const { data: admin } = useQuery({ queryKey: ["es_admin"], queryFn: esAdmin });
  const [elegida, setElegida] = useState(false);
  useEffect(() => { setElegida(leerMenu()); }, []);
  const enConfig = useLocation({ select: (l) => l.pathname.startsWith("/configuracion") });
  const [plegadaEnConfig, setPlegadaEnConfig] = useState(false);
  useEffect(() => { if (!enConfig) setPlegadaEnConfig(false); }, [enConfig]);
  const abierta = elegida || (enConfig && !plegadaEnConfig);
  const alternar = () => {
    if (abierta) { setElegida(false); guardarMenu(false); if (enConfig) setPlegadaEnConfig(true); }
    else { setElegida(true); guardarMenu(true); setPlegadaEnConfig(false); }
  };
  const [sub, setSub] = useState(true);
  const item = "flex items-center gap-3 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground";
  const act = { className: "bg-accent font-medium text-foreground" };
  return (
    <aside className={cn("sticky top-0 flex h-screen shrink-0 flex-col border-r bg-card p-2 transition-[width]", abierta ? "w-52" : "w-14")}>
      <button onClick={alternar} aria-label={abierta ? "Plegar menú" : "Desplegar menú"} className="mb-3 self-end rounded-md p-2 text-muted-foreground hover:bg-muted">
        {abierta ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
      </button>
      <nav aria-label="Secciones" className="flex flex-col gap-1">
        <Link to="/" className={item} activeProps={act} activeOptions={{ exact: true }} title="Alertas">
          <Bell className="size-4 shrink-0" />{abierta && "Alertas"}
        </Link>
        <Link to="/discover-map" className={item} activeProps={act} title="Discover ahora">
          <Activity className="size-4 shrink-0" />{abierta && "Discover ahora"}
        </Link>
        {admin && (
          <div>
            <div className="flex items-center">
              <Link to="/configuracion" search={{ apartado: "perfil" }} onClick={() => { setSub(true); setPlegadaEnConfig(false); }} className={cn(item, "flex-1")} activeProps={act} title="Configuración">
                <Settings className="size-4 shrink-0" />{abierta && "Configuración"}
              </Link>
              {abierta && (
                <button onClick={() => setSub((v) => !v)} aria-label={sub ? "Ocultar apartados" : "Mostrar apartados"} aria-expanded={sub} className="rounded-md p-2 text-muted-foreground hover:bg-muted">
                  <ChevronDown className={cn("size-4 transition-transform", !sub && "-rotate-90")} />
                </button>
              )}
            </div>
            {abierta && sub && (
              <div className="ml-4 mt-1 flex flex-col gap-0.5 border-l pl-2">
                {APARTADOS.map((a) => (
                  <Link key={a.id} to="/configuracion" search={{ apartado: a.id }} activeOptions={{ includeSearch: true }}
                    className={cn("rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground", !enConfig && "opacity-90")}
                    activeProps={{ className: "bg-accent font-medium text-foreground" }}>
                    {a.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>
    </aside>
  );
}
