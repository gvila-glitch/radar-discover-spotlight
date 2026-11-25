# Resumen por email: orden por recencia y hora de cada alerta

Solo se tocan `src/lib/resumenEmail.ts` y `src/lib/resumenEmail.test.ts`.

## 1. Orden
- `ordenar` mantiene dos bloques (alta, luego media) y dentro ordena por `creada_en` descendente.
- Se quita el import de `puntuarAlerta`.

## 2. Hora de cada alerta
Nueva función pura `cuandoSeCreo(creadaEn, ahora)`; `montarEmail` usa `hasta` como momento del envío.
- Mismo día en Madrid: «07:41 · hace 19 min».
- Día anterior: «Ayer, 23:30 · hace 8 h».
- Antes de ayer: «23 nov, 10:05 · hace 50 h».
- «hace»: menos de 60 min → «hace N min» (mínimo 1); desde 60 → «hace N h», redondeando hacia abajo.
- Para los días se comparan las fechas de calendario en Europe/Madrid (sirve para horario de verano y de invierno).

Cómo se ve:
- Tarjetas de altas: la línea de datos queda «hora · fuentes».
- Medias: entidad enlazada a la izquierda y hora a la derecha en la misma fila (tabla de dos celdas, compatible con email). Debajo, en pequeño, «N medios en Discover · fuentes».
- Texto plano: altas con «hora · fuentes»; medias «- Entidad · hora · N medios en Discover · fuentes · enlace».

## 3. Pruebas (resumenEmail.test.ts)
- Recencia dentro de cada bloque y altas siempre antes que medias.
- «hace 1 min» (menos de 1 min), «hace 59 min», «hace 1 h» a los 60 min, «hace 8 h» redondeando hacia abajo.
- «Ayer, » cuando cambia el día en Madrid aunque en UTC sea el mismo día, y la fecha corta si es de antes de ayer.
- Horario de verano y de invierno: la misma hora UTC da 08:xx (CEST) o 07:xx (CET).
- Se adaptan las pruebas actuales de orden.
