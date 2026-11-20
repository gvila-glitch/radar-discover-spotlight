import { useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";

/** Por debajo de 1024 px (lg) la lista y la ficha no caben juntas: la ficha se abre a pantalla completa. */
export const CONSULTA_MOVIL = "(max-width: 1023.98px)";
export const esMovil = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia(CONSULTA_MOVIL).matches;

const MARCA = "radarFicha";
type Estado = Record<string, unknown> | null;
const fichaEnHistorial = (): number | null => {
  const id = (window.history.state as Estado)?.[MARCA];
  return typeof id === "number" ? id : null;
};
const conAlerta = (id: number) => {
  const url = new URL(window.location.href);
  url.searchParams.set("alerta", String(id));
  return url;
};

/**
 * Ficha a pantalla completa en el móvil. Al abrirla se añade un paso al historial (?alerta=ID): el gesto o el botón de
 * atrás del móvil la cierra y vuelve a la lista, en vez de salir del panel. La lista sigue debajo, en el mismo punto.
 * En el ordenador no hace nada: lista y ficha están una al lado de la otra.
 */
export function useFichaMovil(alVolverA: (id: number) => void) {
  // Sin enrutador (pruebas), se usa el historial del navegador directamente.
  const router = useRouter({ warn: false });
  // Si se entra con ?alerta= en el móvil (p. ej., «Ver su alerta» desde Discover ahora), se abre la ficha.
  const [abierta, setAbierta] = useState(
    () => esMovil() && new URLSearchParams(window.location.search).has("alerta"),
  );
  const volverA = useRef(alVolverA);
  volverA.current = alVolverA;

  useEffect(() => {
    const alCambiarHistorial = () => {
      const id = fichaEnHistorial();
      setAbierta(id != null);
      if (id != null) volverA.current(id);
    };
    window.addEventListener("popstate", alCambiarHistorial);
    return () => window.removeEventListener("popstate", alCambiarHistorial);
  }, []);

  // Con la ficha abierta, la página de debajo no se desplaza (y no pierde su posición).
  useEffect(() => {
    if (!abierta || !esMovil()) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = antes;
    };
  }, [abierta]);

  /** Abre la ficha (o cambia de alerta con ‹ ›, sin añadir otro paso al historial). */
  const abrir = (id: number) => {
    if (!esMovil()) return;
    const cambiar = fichaEnHistorial() != null;
    if (router) {
      // resetScroll: false para que el enrutador no suba la página (la lista) arriba del todo.
      void router.navigate({
        to: ".",
        search: (s: Record<string, unknown>) => ({ ...s, alerta: id }),
        state: (s: Record<string, unknown>) => ({ ...s, [MARCA]: id }),
        replace: cambiar,
        resetScroll: false,
      } as unknown as Parameters<typeof router.navigate>[0]);
    } else {
      const estado = { ...((window.history.state as Estado) ?? {}), [MARCA]: id };
      if (cambiar) window.history.replaceState(estado, "", conAlerta(id));
      else window.history.pushState(estado, "", conAlerta(id));
    }
    setAbierta(true);
  };

  /** «← Alertas»: como el botón de atrás, si la ficha añadió un paso al historial; si no, solo la cierra. */
  const cerrar = () => {
    if (fichaEnHistorial() != null) window.history.back();
    else setAbierta(false);
  };

  return { abierta, abrir, cerrar };
}
