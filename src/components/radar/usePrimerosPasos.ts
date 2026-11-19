import { useEffect, useState } from "react";

// Primeros pasos de Alertas: salen solos la primera vez; después, al pulsar «¿Cómo se usa?».
const CLAVE = "radar_primeros_pasos_v1";
const yaVisto = (): boolean => {
  try {
    return window.localStorage.getItem(CLAVE) === "1";
  } catch {
    return false;
  }
};
const marcarVisto = () => {
  try {
    window.localStorage.setItem(CLAVE, "1");
  } catch {
    /* sin almacenamiento: los pasos volverán a salir */
  }
};

/** Abiertos la primera vez; después, solo al pulsar «¿Cómo se usa?». */
export function usePrimerosPasos() {
  const [abiertos, setAbiertos] = useState(false);
  useEffect(() => {
    setAbiertos(!yaVisto());
  }, []);
  return {
    abiertos,
    alternar: () => setAbiertos((v) => !v),
    cerrar: () => {
      marcarVisto();
      setAbiertos(false);
    },
  };
}
