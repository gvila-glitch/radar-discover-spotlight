import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { esAdmin } from "@/lib/configRepo";
export function Nav() {
  const { data: admin } = useQuery({ queryKey: ["es_admin"], queryFn: esAdmin });
  const cls = "border-b-2 border-transparent pb-1 text-sm text-muted-foreground hover:text-foreground";
  const act = { className: "border-b-2 border-primary pb-1 text-sm font-medium text-foreground" };
  return (
    <nav aria-label="Secciones" className="flex gap-5">
      <Link to="/" className={cls} activeProps={act} activeOptions={{ exact: true }}>Alertas</Link>
      {admin && <Link to="/configuracion" className={cls} activeProps={act}>Configuración</Link>}
    </nav>
  );
}
