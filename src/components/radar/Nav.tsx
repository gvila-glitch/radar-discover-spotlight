import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bell, Settings, PanelLeftClose, PanelLeftOpen, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { esAdmin } from "@/lib/configRepo";
import { APARTADOS } from "@/lib/configApartados";
import { AdvisorInvitation } from '@/components/payments/AdvisorInvitation';

export function Sidebar() {
  const { data: admin } = useQuery({ queryKey: ["es_admin"], queryFn: esAdmin });
  const [abierta, setAbierta] = useState(() => typeof window === "undefined" || window.innerWidth >= 768);
  const enConfig = useLocation({ select: (l) => l.pathname.startsWith("/configuracion") });
  const [sub, setSub] = useState(true);
  const item = "flex items-center gap-3 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground";
  const act = { className: "bg-accent font-medium text-foreground" };
  return (
    <aside className={cn("sticky top-0 flex h-screen shrink-0 flex-col border-r bg-card p-2 transition-[width]", abierta ? "w-52" : "w-14")}>
      <button onClick={() => setAbierta((v) => !v)} aria-label={abierta ? "Plegar menú" : "Desplegar menú"} className="mb-3 self-end rounded-md p-2 text-muted-foreground hover:bg-muted">
        {abierta ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
      </button>
      <nav aria-label="Secciones" className="flex flex-col gap-1">
        <Link to="/" className={item} activeProps={act} activeOptions={{ exact: true }} title="Alertas">
          <Bell className="size-4 shrink-0" />{abierta && "Alertas"}
        </Link>
        <AdvisorInvitation collapsed={!abierta} sidebar />
        {admin && (
          <div>
            <div className="flex items-center">
              <Link to="/configuracion" search={{ apartado: "perfil" }} onClick={() => setSub(true)} className={cn(item, "flex-1")} activeProps={act} title="Configuración">
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
