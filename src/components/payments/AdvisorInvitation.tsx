import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
export function AdvisorInvitation({ collapsed = false, sidebar = false }: { collapsed?: boolean; sidebar?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant={sidebar ? 'ghost' : 'outline'} size="sm" title="IA Advisor · Premium" aria-label="IA Advisor" onClick={() => setOpen(true)}
      className={cn(sidebar && 'h-auto justify-start px-2 py-2 text-muted-foreground', collapsed && 'w-9 px-0 justify-center')}>
      <LockKeyhole className="size-4 shrink-0" />{!collapsed && <><span>IA Advisor</span>{!sidebar && <span className="text-xs text-muted-foreground">Premium</span>}</>}
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
        <DialogHeader><DialogTitle className="font-serif text-2xl">IA Advisor</DialogTitle>
          <DialogDescription>Exclusivo de Premium · Próximamente</DialogDescription></DialogHeader>
        <p className="text-sm">IA Advisor todavía no está disponible. La suscripción de prueba no activa el asesor ni genera análisis.</p>
        <div className="border-y py-4"><span className="font-mono text-3xl">10 €</span><span className="text-sm text-muted-foreground"> / mes</span><p className="mt-2 text-xs text-muted-foreground">Renovación mensual · Solo pruebas, sin dinero real</p></div>
        <Button asChild><Link to="/premium" onClick={() => setOpen(false)}>Hacerme Premium · Prueba</Link></Button>
      </DialogContent>
    </Dialog>
  </>;
}
