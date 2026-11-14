# Usuarios: administradores y usuarios normales

## Qué verá cada persona
- **Administradora** (por ahora solo gvila@eldiario.es, que ya lo es): ve Alertas y Configuración en el menú izquierdo. Dentro de Configuración aparece un nuevo apartado **Usuarios**.
- **Usuario normal**: solo ve el panel de Alertas. Si escribe la dirección de Configuración a mano, no verá ni podrá cambiar nada (lo impide la base de datos, no solo la pantalla).

## Apartado "Usuarios" (solo administración)
- Lista de personas con acceso: email, rol (Admin / Usuario) y si ya ha activado su cuenta.
- **Dar de alta**: escribir un email y elegir rol. Se le envía una invitación por correo; al pulsarla, elige su contraseña en la pantalla que ya existe ("Establecer contraseña").
- **Cambiar rol** entre Admin y Usuario.
- **Quitar acceso**: deja de poder entrar al panel.
- Protecciones: una administradora no puede quitarse a sí misma el rol ni el acceso, y siempre debe quedar al menos un admin.

## Seguridad
- Los roles siguen guardados en una lista separada de las cuentas (no editable por el propio usuario).
- Todas las altas, cambios y bajas se hacen en el servidor, que primero comprueba que quien lo pide es admin. Las listas de equipo y roles siguen cerradas a lectura/escritura directa desde el navegador.
- El registro público sigue desactivado: solo se entra por invitación.

## Detalles técnicos
- `src/lib/usuarios.functions.ts`: server functions con `requireSupabaseAuth`; verifican `es_admin()` vía `context.supabase` y solo después cargan `supabaseAdmin` dentro del handler para `auth.admin.inviteUserByEmail` (redirectTo `/reset-password`), `listUsers` (estado de activación) y escrituras en `equipo` / `equipo_roles`.
- Validación de email y rol (`admin` | `usuario`); usuario normal = fila en `equipo` sin fila admin en `equipo_roles`. Baja = borrar de `equipo` y `equipo_roles` (la cuenta de acceso se conserva pero queda sin permiso por `es_equipo()`). Reglas de "no auto-degradarse" y "mínimo un admin" comprobadas en servidor.
- Sin cambios de esquema ni nuevas políticas RLS: `equipo` y `equipo_roles` permanecen sin políticas (denegado al cliente).
- Añadir `{ id: "usuarios", label: "Usuarios" }` a `APARTADOS` y su sección en `configuracion.tsx`.
- Tests de las reglas (rol válido, no auto-baja, mínimo un admin) y actualizar `seguridad.test.ts` si procede.
- Nota en `AGENTS.md`: gestión de usuarios solo vía server functions admin-verificadas.
