# Diseño más neutro y listado de alertas más limpio

## 1. Estilo general menos "IA"
- Quitar la tipografía con serifa (títulos, nombres de alertas, ángulo sugerido): todo pasa a una sola familia sin serifa.
- Cambiar IBM Plex Sans por **Geist** (sobria, de herramienta profesional) y Geist Mono para cifras.
- Sustituir el violeta actual por el azul **#004A7F** como color principal (botones, enlaces, selección, foco). Grises y blancos como secundarios: fondos blancos y gris muy claro, bordes y textos de apoyo en grises neutros, sin tintes de color. En modo oscuro, el mismo azul algo más claro para que se lea bien.
- Títulos con más peso y algo más compactos, en lugar de serif grande.

## 2. Listado de alertas (columna izquierda)
- Si la alerta ya tiene medios en Discover: se muestra un pequeño icono (ojo/radar) junto al nombre, con texto de ayuda al pasar por encima ("En Discover: N medios").
- Si no está en Discover: se oculta la etiqueta "[SIN DISCOVER]" del nombre en el listado y en el detalle. Solo se cambia lo que se ve; los datos guardados no se tocan (la deduplicación y la limpieza siguen funcionando con el prefijo).

## Detalles técnicos
- `src/routes/__root.tsx`: enlace de Google Fonts a Geist + Geist Mono.
- `src/styles.css`: `--font-sans`/`--font-mono` a Geist; `--font-serif` apunta también a la sans (y retirar usos de `font-serif` en index y Detalle); primary/ring = #004A7F en oklch (≈ oklch(0.39 0.11 250)), accent como gris/azul muy claro, secondary/muted/border en grises neutros; variante más clara del azul en oscuro.
- Nueva función `nombreVisible(entidad)` en `src/lib/metricas.ts` que elimina los prefijos `[SIN DISCOVER] ` y `[PRUEBA] ` al mostrar; test unitario.
- `src/routes/_authenticated/index.tsx`: icono lucide cuando `medios_discover > 0` y nombre limpio; `Detalle.tsx` usa también el nombre limpio.
