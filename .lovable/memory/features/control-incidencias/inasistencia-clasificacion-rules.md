---
name: Inasistencia injustificada - umbrales literales del convenio
description: Clasificación legal exacta de inasistencias injustificadas según Art. 50 del convenio (1 día = leve, 2-4 = grave, 3 consecutivos o 5 alternos = muy grave). Prohibido inventar umbrales como "3 días alternos".
type: feature
---

Reglas literales del convenio para inasistencia injustificada al trabajo:

- **Art. 50.1.b (LEVE)**: "La inasistencia injustificada al trabajo de UN día durante el período de un mes."
- **Art. 50.2.b (GRAVE)**: "La inasistencia injustificada al trabajo de DOS A CUATRO días durante el período de un mes."
- **Art. 50.3.b (MUY GRAVE)**: "La inasistencia injustificada al trabajo durante TRES DÍAS CONSECUTIVOS o CINCO ALTERNOS en un período de un mes."

PROHIBIDO en el prompt de la IA y en cualquier documento legal:
- "tres días alternos" (no existe — el umbral muy grave alterno son CINCO).
- Citar Art. 50.3.b cuando solo hay 1 ausencia o no se acredita 3 consecutivos / 5 alternos en el último mes.

Para escalar inasistencias por reincidencia formal, usar Art. 50.3.m (reincidencia en faltas graves), no 50.3.b.

Prompt reforzado en `supabase/functions/control-incidencias-ai/index.ts` sección "4.bis. INASISTENCIA INJUSTIFICADA".
