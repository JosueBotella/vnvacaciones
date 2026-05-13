# Convenio aplicable (fuente oficial)

**XVIII Convenio Colectivo Estatal para las Empresas dedicadas al Comercio de Flores y Plantas**

- BOE-A-2025-21424
- Publicado: 24 de octubre de 2025 (BOE núm. 256)
- Vigencia: 1 de enero de 2024 – 31 de diciembre de 2028
- PDF oficial archivado en este directorio: `FLORES_Y_PLANTAS_2024-2028_BOE.pdf`

Este es el **único** convenio que la IA y el sistema disciplinario deben usar
para clasificar y motivar amonestaciones y sanciones.

## Mapa de artículos del régimen disciplinario (Capítulo IX)

- **Art. 49 — Principios de ordenación**: apartados 1 a 5. **Sin letras.**
- **Art. 50 — Graduación de las faltas**:
  - 50.1 — Faltas leves: a..g
  - 50.2 — Faltas graves: a..o
  - 50.3 — Faltas muy graves: a..n
- **Art. 51 — Sanciones**: 51.1.a (leve), 51.1.b (grave), 51.1.c (muy grave).
  Cancelación de anotaciones: 2 / 4 / 8 meses según gravedad.

## Reglas de citación

- Toda falta tipificada se cita SIEMPRE como `Art. 50.<n>.<letra>`.
- `Art. 49.<n>.<letra>` y `Art. 48.<n>.<letra>` son inválidos: el backend los
  normaliza automáticamente al `Art. 50.<n>.<letra>` correcto antes de
  guardar/renderizar el documento.

## Donde está cargado en el código

- Texto íntegro de Arts. 49-51 en el prompt:
  `supabase/functions/control-incidencias-ai/index.ts` → `CONVENIO_CONTEXT`
- Datos estructurados (lookup por número):
  `src/modules/control-incidencias/legal/convenioData.ts`
- Normalizador y barreras técnicas:
  `supabase/functions/incidencias-operations/index.ts` → `normalizeConvenioCitations`
