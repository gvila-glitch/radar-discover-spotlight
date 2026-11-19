import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";

/**
 * Recuadro que se abre al pasar el ratón (y se cierra al salir), al pulsar (móvil y tableta, donde no se puede pasar
 * por encima) y con el teclado; Esc lo cierra. Si se abrió pasando el ratón, pulsar lo deja fijo.
 */
export function usePopoverAlPasar() {
  const [abierto, setAbierto] = useState(false);
  const porRaton = useRef(false);
  const espera = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(espera.current), []);
  const entrar = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    clearTimeout(espera.current);
    if (!abierto) {
      porRaton.current = true;
      setAbierto(true);
    }
  };
  const salir = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || !porRaton.current) return;
    espera.current = setTimeout(() => setAbierto(false), 150);
  };
  const onOpenChange = (v: boolean) => {
    setAbierto(v);
    if (!v) porRaton.current = false;
  };
  // Abierto al pasar el ratón: el clic lo deja fijo en vez de cerrarlo.
  const alPulsar = (e: MouseEvent) => {
    if (abierto && porRaton.current) {
      e.preventDefault();
      porRaton.current = false;
      clearTimeout(espera.current);
    }
  };
  return { abierto, onOpenChange, entrar, salir, alPulsar };
}
