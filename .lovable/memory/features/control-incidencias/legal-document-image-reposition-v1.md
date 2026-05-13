---
name: Legal document image reposition (v2 — click-to-edit modal)
description: Edit evidence images by clicking them; opens external React modal with drag/zoom/flip; persists via inline style on <img>
type: feature
---

# Reposición / recorte de imágenes en el documento legal

## Flujo (v2 — fiable, click-based)
1. Usuario activa el modo **"Reposicionar imagen"** en el visor.
2. Las `.evidence-image` muestran outline azul y cursor pointer.
3. Al **hacer clic** sobre una imagen, el iframe envía al padre:
   `{ id, src, naturalWidth, naturalHeight, frameWidth, frameHeight, currentObjectPosition, currentTransform }`.
4. Se abre `LegalDocumentImageEditorDialog` (modal externo, fuera del iframe).
5. El usuario puede:
   - **arrastrar** la imagen dentro de un marco con la misma proporción real,
   - hacer **zoom** (slider o rueda del ratón, 1×–4×),
   - **voltear H/V**,
   - **restablecer**.
6. Mientras edita, cada cambio se envía como **live preview** al iframe via
   `postMessage({type:'legal-doc-image-apply', id, objectPosition, transform})`,
   que actualiza el `style` inline de esa `<img>` en tiempo real.
7. Al **Aplicar**, el cambio queda en el iframe y se marca dirty.
8. Al **Guardar**, se solicita el HTML completo al iframe
   (`legal-doc-request-html`) — que devuelve los `innerHTML` de cada
   `.legal-page-document` con los styles inline actualizados — y se persiste
   con `incidencias-operations.updateLegalDocument` (descripción
   "Reposición de imagen") creando una nueva versión en el historial.
9. Al cancelar la edición individual, se restauran los estilos originales.

## Persistencia
- **No destructivo**: NO se modifica el archivo de imagen.
- Solo se guardan dos atributos en el `style` inline de la `<img>`:
  - `object-position: X% Y%`
  - `transform: scale(±s, ±s)` (para zoom + flip)
  - `transform-origin: center center`
- Cada `<img>` recibe un `data-legal-image-id` único la primera vez que se
  entra en modo edición, para poder localizarla de forma estable.
- Estos atributos están permitidos por `sanitizeHtml` (`ADD_ATTR: ['style', 'class', ...]`).
- Al reabrir el documento o exportar a PDF, los styles se respetan tal cual.

## Decisiones técnicas clave
- **Toda la interacción compleja vive FUERA del iframe**. El intento previo
  de drag/zoom/flip directamente dentro del iframe (con pointer events,
  toolbar inyectada, etc.) era muy frágil — fallaba sin mostrar errores
  claros. El nuevo enfoque solo necesita capturar un `click` dentro del
  iframe, lo cual es robusto.
- El editor usa el **mismo aspect-ratio** del marco real (`frameWidth/frameHeight`
  recibidos del iframe) y `object-fit: cover`, así que el preview es WYSIWYG.
- La extracción de HTML reutiliza el flujo existente de "Editar texto manual",
  evitando código duplicado.

## Archivos
- `src/components/incidencias/LegalDocumentImageEditorDialog.tsx` — modal editor
- `src/components/incidencias/legalDocumentPreview.ts` — script de selección dentro del iframe
- `src/components/incidencias/LegalDocumentInlineButton.tsx` — integración

## Restricciones
- Deshabilitado en documentos firmados.
- Mutuamente exclusivo con el modo "Editar texto manual".
