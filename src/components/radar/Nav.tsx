import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bell, Settings, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { esAdmin } from "@/lib/configRepo";

export function Sidebar() {
  const { data: admin } = useQuery({ queryKey: ["es_admin"], queryFn: esAdmin });
  const [abierta, setAbierta] = useState(true);
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
        {admin && (
          <Link to="/configuracion" className={item} activeProps={act} title="Configuración">
            <Settings className="size-4 shrink-0" />{abierta && "Configuración"}
          </Link>
        )}
      </nav>
    </aside>
  );
}
