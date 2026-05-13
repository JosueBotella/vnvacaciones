---
name: Confidencialidad interna en documentos legales
description: El documento legal entregado al trabajador NUNCA puede mencionar propuestas internas previas, comparaciones con la decisión inicial, ni procesos deliberativos internos.
type: feature
---
# Regla absoluta de confidencialidad en documentos disciplinarios

El documento disciplinario (amonestación / sanción) generado por la IA en `control-incidencias-ai` (acción `generar_documento_legal`) se entrega DIRECTAMENTE AL TRABAJADOR.

## Prohibido en TODAS las secciones

PROHIBIDO mencionar, comparar, justificar o aludir a:
- "Propuesta inicial", "propuesta del encargado", "recomendación previa", "valoración previa", "análisis interno", "decisión inicial".
- Frases tipo: "difiere de la propuesta inicial de amonestación", "se ha decidido elevar/reducir respecto a…", "a pesar de la propuesta inicial de…", "habiéndose determinado finalmente…", "tras valorar la recomendación de…", "el encargado propuso…", "inicialmente se planteó…".
- Justificar la medida diciendo que se ha cambiado/agravado/atenuado respecto a otra previa.
- Nombres o roles internos, deliberaciones, opiniones de mandos intermedios, sistemas informáticos, IA, análisis automatizados, puntos, escalados internos, reglas de escalado, conversaciones internas.
- La existencia misma de un proceso interno previo.

## Cómo debe redactarse

La medida se presenta como UNA SOLA decisión empresarial directa, motivada únicamente en:
1. Los hechos descritos.
2. La calificación legal según el Art. 50 del convenio.
3. La facultad disciplinaria del Art. 51.

## Implementación

Regla incrustada en el `systemPrompt` de la función `generarDocumentoLegal` dentro de `supabase/functions/control-incidencias-ai/index.ts`, justo después de la regla de "FUENTE ÚNICA DE VERDAD". Marcada como "PREVALECE sobre cualquier otra instrucción de extensión o detalle" para que la IA no la rompa al intentar dar más contexto.
