## Objetivo

El botón "Reenviar" de una alta debe reenviar el correo original tal cual (mismos adjuntos, mismos destinatarios, mismos datos) sin pedir nada al usuario y sin crear una nueva alta en el historial.

## Diagnóstico

Hoy el historial (`operativa_envios_history.datos`) sólo guarda los **nombres** de los archivos, no su contenido. Por eso el botón actual repuebla el formulario y obliga a re-adjuntar — no hay forma de reconstruir el adjunto desde el historial.

## Cambios

### 1. Persistir adjuntos al enviar el alta original

En `supabase/functions/admin-operations/index.ts` (acción `sendAlta`):

- Generar el `historyId` antes de enviar el email.
- Tras el envío exitoso, subir cada adjunto al bucket existente `operativa-capturas` en la ruta `altas-adjuntos/{historyId}/{nombreArchivo}` (con sufijo aleatorio para evitar colisiones).
- Guardar en `datos.adjuntos` un array `[{ name, path, contentType }]` además de los `archivos` (nombres) que ya se guardan.
- Insertar la fila de `operativa_envios_history` con ese `id` ya generado.

Las altas anteriores (Felipe, etc.) **no tendrán** `datos.adjuntos`. Para ellas se mantiene el comportamiento actual (repoblar formulario).

### 2. Nueva acción `resendAltaFromHistory`

En el mismo edge function, añadir una acción que:

1. Recibe `{ historyId }`.
2. Carga la fila de `operativa_envios_history` (debe ser tipo `alta`).
3. Si la fila no tiene `datos.adjuntos`, devuelve `{ requiresReattach: true }` para que el frontend caiga al flujo antiguo.
4. Descarga los adjuntos del bucket vía service role y los pasa a base64.
5. Reconstruye el HTML del correo reutilizando la misma plantilla y `datos`.
6. Reenvía con Brevo a los `destinatarios` originales (To principal + CCs).
7. **Actualiza** la fila existente con `email_id` nuevo y `sent_at = now()`. **No inserta** una nueva fila — el historial sigue mostrando un único alta para esa persona.

### 3. Frontend — `OperativaAltasTab.tsx`

Reemplazar el handler `onResend` actual por uno que:

- Llama a `admin-operations` con `action: 'resendAltaFromHistory'` y el `historyId`.
- Si la respuesta indica `requiresReattach: true` (entradas antiguas sin adjuntos guardados), aplica el comportamiento previo (rellena el formulario y avisa al usuario que vuelva a adjuntar).
- Si OK, muestra toast "Alta reenviada correctamente" y refresca el historial (la fecha de envío cambia).
- Botón pasa a estado "Reenviando…" mientras se procesa.

### 4. Migración

No hace falta migración SQL — el esquema de `operativa_envios_history.datos` es JSONB y el bucket `operativa-capturas` ya existe.

## Resultado

- Pulsar "Reenviar" en cualquier alta nueva: el correo se manda solo, sin diálogos, sin formulario, sin entrada nueva en el historial.
- Pulsar "Reenviar" en altas anteriores al cambio: cae al comportamiento actual (re-adjuntar) — solo afecta a las ya enviadas; a partir de hoy todas las nuevas funcionarán en silencio.
