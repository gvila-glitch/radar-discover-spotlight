# Resumen de alertas por email (Brevo), 8:00 y 16:00 hora de España

## Qué verás
- Dos emails al día con el asunto «Radar Discover · Resumen de alertas»: cabecera con fecha, franja cubierta y recuento (altas / medias), y por cada alerta su prioridad, entidad, contexto/fuentes, medios en Discover, ángulo sugerido y enlace «Ver en el panel» (`https://radar-discover-spotlight.lovable.app/?alerta=ID`).
- Si no hay alertas nuevas: email corto «Sin alertas nuevas desde el último resumen».
- En Configuración (solo admins): botón «Enviar resumen de prueba ahora» (últimas 24 h, envío real, muestra si ha ido bien; no cuenta como último envío).
- Nada más del panel cambia.

## Cómo funciona
1. Franja: desde el último envío correcto programado (o 24 h atrás) hasta ahora. Los descartes de la IA no entran (viven en otra tabla y nunca se mezclan).
2. Orden: alta antes que media; dentro, más puntos primero con `puntuarAlerta` de `src/lib/prioridad.ts`.
3. Horario con cambio de hora: la tarea se ejecuta a los minutos 0 de las 6, 7, 14 y 15 UTC; la ruta solo envía si en Europe/Madrid son las 8 o las 16 (igual que X, sin depender de verano/invierno). El programador reparte la llamada unos segundos (hasta ~30 s) tras la hora.
4. Sin duplicados: antes de enviar se reserva la franja en `resumenes_email` con un bloqueo de cinco minutos (mismo patrón que los demás trabajos); si ya hay un envío correcto en esa misma hora de Madrid, se salta.
5. Si Brevo falla, se guarda el error en la fila y no se reintenta.

## Secretos (formulario seguro, tras tu aprobación)
`BREVO_API_KEY`, `RESUMEN_REMITENTE`, `RESUMEN_DESTINATARIOS`. Ninguno en el código ni en variables públicas.

## Detalles técnicos
- `src/lib/resumenEmail.ts` (puro): elegir franja, ordenar, contar, montar HTML móvil (escapado) y texto plano, decidir si toca enviar por hora de Madrid. Pruebas en `resumenEmail.test.ts` (orden alta/media y puntos, franja por defecto de 24 h, 8:00/16:00 en invierno y verano, email vacío, escapado de HTML).
- `src/lib/resumenEmail.server.ts`: lee alertas con una función nueva en `alertasRepo.ts` (`leerAlertasParaResumen(client, desde, hasta)`), registra en `resumenes_email`, llama a `POST https://api.brevo.com/v3/smtp/email` con cabecera `api-key` (fetch sin reintentos; error de Brevo guardado con estado y cuerpo recortado).
- Ruta `src/routes/api/public/resumen-email.ts` con `authenticateCronRequest`, cuerpo `{}`, y tarea gestionada `radar-resumen-email` (`0 6,7,14,15 * * *`).
- Migración: tabla `resumenes_email` (id, enviado_en, desde, hasta, num_alertas, ok, error, tipo 'programado'|'prueba'), RLS activado, sin políticas, permisos solo para `service_role`; copia portable en `supabase/resumenes-email.sql`.
- Botón de prueba: server function con `requireSupabaseAuth` que comprueba `es_admin()` antes de enviar; nuevo bloque en el apartado de Configuración existente.
- Limitación a tener en cuenta: el trabajo programado necesita el acceso privilegiado del servidor (como trends-a-alertas). Funciona en la publicación de Lovable; en el despliegue de Cloudflare, sin la clave de servicio, no podría leer alertas ni registrar envíos. Se documenta en AGENTS.md.
