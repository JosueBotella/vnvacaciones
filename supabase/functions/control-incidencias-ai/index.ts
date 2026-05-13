import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const AI_GATEWAY = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const LOVABLE_AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const GEMINI_DIRECT_API = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-2.5-flash";
const MODEL_FALLBACK = "gemini-2.5-pro";
const MODEL_LOVABLE_FALLBACK = "google/gemini-2.5-flash";
const MODEL_LITE = "gemini-2.5-flash-lite";
const MODEL_LITE_FALLBACK = "gemini-2.0-flash";

// Full text of Arts. 49-51 from convenioData.ts for the system prompt
const CONVENIO_CONTEXT = `
CONVENIO COLECTIVO: XVIII Convenio Colectivo Estatal para las Empresas del Comercio de Flores y Plantas (BOE-A-2025-21424)
CAPÍTULO IX — RÉGIMEN DISCIPLINARIO

ARTÍCULO 49 — Principios de ordenación
La empresa podrá sancionar las acciones u omisiones punibles en que incurran las personas trabajadoras de acuerdo con la graduación de las faltas y sanciones que se establecen en el Acuerdo de Cobertura de Vacíos. Principios de ordenación:
1. Las presentes normas de régimen disciplinario persiguen el mantenimiento de la disciplina laboral, aspecto fundamental para la normal convivencia, ordenación técnica y organización de la empresa, así como para la garantía y defensa de los derechos e intereses legítimos de las personas trabajadoras y empresarios.
2. Las faltas, siempre que sean constitutivas de un incumplimiento contractual culpable de la persona trabajadora, podrán ser sancionadas por la Dirección de la empresa de acuerdo con la graduación que se establece en el presente capítulo.
3. Toda falta cometida por las personas trabajadoras se clasificará en leve, grave o muy grave.
4. La falta, sea cual fuere su calificación, requerirá comunicación escrita y motivada de la empresa al trabajador o trabajadora.
5. La imposición de sanciones por faltas muy graves será notificada a los representantes legales de las personas trabajadoras, si los hubiere.

ARTÍCULO 50 — Clasificación de faltas

FALTAS LEVES:
a) La impuntualidad no justificada en la entrada o en la salida del trabajo hasta tres ocasiones en un mes por un tiempo total inferior a veinte minutos.
b) La inasistencia injustificada al trabajo de un día durante el período de un mes.
c) La no comunicación con la antelación previa debida de la inasistencia al trabajo por causa justificada, salvo que se acreditase la imposibilidad de la notificación.
d) El abandono del puesto de trabajo sin causa justificada por breves períodos de tiempo y siempre que ello no hubiere causado riesgo a la integridad de las personas o de las cosas, en cuyo caso podrá ser calificado, según la gravedad, como falta grave o muy grave.
e) La desatención y falta de corrección en el trato con el público cuando no perjudiquen gravemente la imagen de la empresa.
f) Los descuidos en la conservación del material que se tuviere a cargo o fuere responsable y que produzcan deterioros leves del mismo.
g) La embriaguez no habitual en el trabajo.

FALTAS GRAVES:
a) La impuntualidad no justificada en la entrada o en la salida del trabajo hasta en tres ocasiones en un mes por un tiempo total de hasta sesenta minutos.
b) La inasistencia injustificada al trabajo de dos a cuatro días durante el período de un mes.
c) El entorpecimiento, la omisión maliciosa y el falseamiento de los datos que tuvieren incidencia en la Seguridad Social.
d) La simulación de enfermedad o accidente, sin perjuicio de lo previsto en la letra d) del número 3.
e) La suplantación de otra persona trabajadora, alterando los registros y controles de entrada y salida al trabajo.
f) La desobediencia a las órdenes e instrucciones de trabajo, incluidas las relativas a las normas de seguridad e higiene, así como la imprudencia o negligencia en el trabajo, salvo que de ellas derivasen perjuicios graves a la empresa, causaren averías a las instalaciones, maquinarias y, en general, bienes de la empresa o comportasen riesgo de accidente para las personas, en cuyo caso serán consideradas como faltas muy graves.
g) La falta de comunicación a la empresa de los desperfectos o anormalidades observados en los útiles, herramientas, vehículos y obras a su cargo, cuando de ello se hubiere derivado un perjuicio grave a la empresa.
h) La realización sin el oportuno permiso de trabajos particulares durante la jornada, así como el empleo de útiles, herramientas, maquinaria, vehículos y, en general, bienes de la empresa para los que no estuviera autorizado o para usos ajenos a los del trabajo encomendado, incluso fuera de la jornada laboral.
i) El quebrantamiento o la violación de secretos de obligada reserva que no produzca grave perjuicio para la empresa.
j) La embriaguez habitual en el trabajo.
k) La falta de aseo y limpieza personal cuando pueda afectar al proceso productivo o a la prestación del servicio y siempre que, previamente, hubiere mediado la oportuna advertencia de la empresa.
l) La ejecución deficiente de los trabajos encomendados, siempre que de ello no se derivase perjuicio grave para las personas o las cosas.
m) La disminución del rendimiento normal en el trabajo de manera no repetida.
n) Las ofensas de palabra proferidas o de obra cometidas contra las personas, dentro del centro de trabajo, cuando revistan acusada gravedad.
o) La reincidencia en la comisión de cinco faltas leves, aunque sea de distinta naturaleza y siempre que hubiere mediado sanción distinta de la amonestación verbal, dentro de un trimestre.

FALTAS MUY GRAVES:
a) La impuntualidad no justificada en la entrada o en la salida del trabajo en diez ocasiones durante seis meses o en veinte durante un año debidamente advertida.
b) La inasistencia injustificada al trabajo durante tres días consecutivos o cinco alternos en un período de un mes.
c) El fraude, deslealtad o abuso de confianza en las gestiones encomendadas o la apropiación, hurto o robo de bienes propiedad de la empresa, de compañeros o de cualesquiera otras personas dentro de las dependencias de la empresa.
d) La simulación de enfermedad o accidente o la prolongación de la baja por enfermedad o accidente con la finalidad de realizar cualquier trabajo por cuenta propia o ajena.
e) El quebrantamiento o violación de secretos de obligada reserva que produzca grave perjuicio para la empresa.
f) La embriaguez habitual o toxicomanía si repercute negativamente en el trabajo.
g) La realización de actividades que impliquen competencia desleal a la empresa.
h) La disminución voluntaria y continuada en el rendimiento del trabajo normal o pactado.
i) La inobservancia de los servicios de mantenimiento en caso de huelga.
j) El abuso de autoridad ejercido por quienes desempeñan funciones de mando.
k) La reiterada no utilización de los elementos de protección en materia de seguridad e higiene, debidamente advertida.
l) Las derivadas de los apartados 1.d) y 2.l) y m) del presente artículo (abandono con riesgo, ejecución deficiente con perjuicio grave, disminución repetida de rendimiento).
m) La reincidencia o reiteración en la comisión de faltas graves, considerando como tal aquella situación en la que, con anterioridad al momento de la comisión del hecho, la persona trabajadora hubiese sido sancionado dos o más veces por faltas graves, aun de distinta naturaleza, durante el período de un año.
n) El acoso moral o sexual efectuado a los compañeros de trabajo a cualquier persona relacionada con el centro de trabajo.

ARTÍCULO 51 — Sanciones
Las sanciones máximas que podrán imponerse por la comisión de las faltas enumeradas en el artículo anterior son las siguientes:
a) Por falta leve: Amonestación verbal o escrita y suspensión de empleo y sueldo de hasta dos días.
b) Por falta grave: Suspensión de empleo y sueldo de tres a catorce días.
c) Por falta muy grave: Suspensión de empleo y sueldo de catorce días a un mes, traslado a centro de trabajo de localidad distinta durante un período de hasta un año y despido disciplinario.

Las anotaciones desfavorables que como consecuencia de las sanciones impuestas pudieran hacerse constar en los expedientes personales quedarán canceladas al cumplirse los plazos de dos, cuatro u ocho meses, según se trate de falta leve, grave o muy grave.

PRESCRIPCIÓN DE FALTAS (Art. 60.2 ET):
- Faltas leves: prescriben a los 10 días.
- Faltas graves: prescriben a los 20 días.
- Faltas muy graves: prescriben a los 60 días.
Contados a partir de la fecha en que la empresa tuvo conocimiento de su comisión.

⚠️⚠️⚠️ AVISO CRÍTICO DE NUMERACIÓN DE ARTÍCULOS (LEER ANTES DE CITAR) ⚠️⚠️⚠️
- El **Art. 49** SOLO contiene "Principios de ordenación" numerados del 1 al 5. NO clasifica faltas. Sus apartados NUNCA llevan letras (a, b, c, …). Solo se cita como "Art. 49" o "Art. 49.1/2/3/4/5" si te refieres a un principio general.
- TODA falta tipificada (leve, grave, muy grave) está en el **Art. 50** y SIEMPRE se cita con número de gravedad + letra:
    · Faltas LEVES → Art. 50.1.a, 50.1.b, 50.1.c, 50.1.d, 50.1.e, 50.1.f, 50.1.g
    · Faltas GRAVES → Art. 50.2.a, 50.2.b, 50.2.c, …, 50.2.o
    · Faltas MUY GRAVES → Art. 50.3.a, 50.3.b, …, 50.3.n
- Las **sanciones aplicables** están en el **Art. 51**: 51.a (leve), 51.b (grave), 51.c (muy grave).
- ❌ PROHIBIDO ABSOLUTO escribir "Art. 49.1.a", "Art. 49.2.f", "Art. 49.3.c" o cualquier "Art. 49.X.<letra>". Eso NO EXISTE en este convenio. Si vas a citar una falta con letra, el artículo correcto es SIEMPRE el 50 (cincuenta).
- ❌ PROHIBIDO ABSOLUTO escribir "Art. 48.X.<letra>" o cualquier artículo con número 48 acompañado de subapartado y letra: el régimen disciplinario empieza en el Art. 49.
- ✔️ AUTOCONTROL OBLIGATORIO: antes de devolver la respuesta, revisa TODOS los campos (texto narrativo, articulos_aplicables, articulos_relevantes, fundamentación, exposición de hechos, etc.) y comprueba que ninguna cita tenga el patrón "Art. 49.<n>.<letra>" ni "49.<n>.<letra>". Si aparece, sustitúyela por "Art. 50.<n>.<letra>" antes de responder.
- El convenio aplicable es SIEMPRE el XVIII Convenio Colectivo Estatal para las Empresas del Comercio de Flores y Plantas (BOE-A-2025-21424). No uses convenios anteriores ni numeraciones distintas, aunque hayan aparecido en ejemplos antiguos del entrenamiento.
- Antes de imprimir cualquier cita "Art. 4X.Y.letra", revisa que el primer número sea 50, nunca 49 ni 48.
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    if (!GOOGLE_AI_API_KEY) {
      return new Response(JSON.stringify({ error: "GOOGLE_AI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { action } = body;

    // ── Load shared AI config + memory entries from DB (skip for limpiar_transcripcion for speed) ──
    const skipHeavyContext = action === 'limpiar_transcripcion';
    let aiConfig: { memoria_empresa: string; instrucciones_custom: string; tono: string; incluir_articulos: boolean } = {
      memoria_empresa: '',
      instrucciones_custom: '',
      tono: 'formal',
      incluir_articulos: true,
    };
    let memoryEntries: Array<{ titulo: string; contenido: string; categoria: string }> = [];
    if (!skipHeavyContext) {
      try {
        const [confRes, memRes] = await Promise.all([
          supabase.from('incidencias_ai_config').select('memoria_empresa, instrucciones_custom, tono, incluir_articulos').limit(1).single(),
          supabase.from('incidencias_ai_memory_entries').select('titulo, contenido, categoria').order('created_at'),
        ]);
        if (confRes.data) aiConfig = confRes.data as typeof aiConfig;
        if (memRes.data) memoryEntries = memRes.data;
      } catch (e) {
        console.warn('Could not load AI config:', e);
      }
    } else {
      // For transcription, only load custom instructions (lightweight single query)
      try {
        const confRes = await supabase.from('incidencias_ai_config').select('instrucciones_custom').limit(1).single();
        if (confRes.data?.instrucciones_custom) aiConfig.instrucciones_custom = confRes.data.instrucciones_custom;
      } catch { /* non-critical */ }
    }

    // Build shared enterprise context block from memory entries + legacy field
    const memoryBlock = memoryEntries.length > 0
      ? memoryEntries.map(e => `[${e.categoria.toUpperCase()}] ${e.titulo}:\n${e.contenido}`).join('\n\n')
      : '';
    const legacyMem = aiConfig.memoria_empresa?.trim() || '';
    const allMemory = [legacyMem, memoryBlock].filter(Boolean).join('\n\n');
    
    let empresaContext = allMemory
      ? `\n\nCONTEXTO DE LA EMPRESA (MEMORIA PERMANENTE):\n${allMemory}\n`
      : `\n\nCONTEXTO DE LA EMPRESA:\nVerdnatura es una empresa mayorista de flores y plantas (www.verdnatura.es). Los trabajadores de producción operan en naves con zonas como Cámara (frigorífica), Muelle de carga, Almacén, Líneas de picking, etc. Los "carros" son carros de transporte de plantas.\n`;

    // ── Prompt overrides editables desde la webapp ──
    // Si el admin ha activado un override para esta action, se concatena como
    // INSTRUCCIÓN ADICIONAL al final del system prompt. NO reemplaza la lógica
    // base, solo añade matices/correcciones definidas por el admin.
    if (!skipHeavyContext) {
      try {
        // Mapeo action → prompt_key (varias actions comparten clave lógica)
        const ACTION_TO_KEY: Record<string, string> = {
          clasificar: 'clasificar',
          generar_borrador_sancion: 'generar_borrador_sancion',
          resumen_trabajador: 'resumen_trabajador',
          consultar_convenio: 'consultar_convenio',
          analyze_patterns: 'analyze_patterns',
          generateLegalDocument: 'generar_documento_legal',
          editLegalDocument: 'generar_documento_legal',
          analizar_propuesta_completa: 'analizar_propuesta',
          chat_propuesta: 'analizar_propuesta',
          generar_borrador_nspp: 'generar_borrador_sancion',
          generateNSPPDocument: 'generar_documento_legal',
        };
        const promptKey = ACTION_TO_KEY[action];
        if (promptKey) {
          const { data: overridePrompt } = await supabase
            .from('incidencias_ai_prompts')
            .select('is_active, current_version_id, name')
            .eq('prompt_key', promptKey)
            .maybeSingle();
          if (overridePrompt?.is_active && overridePrompt.current_version_id) {
            const { data: ver } = await supabase
              .from('incidencias_ai_prompt_versions')
              .select('content')
              .eq('id', overridePrompt.current_version_id)
              .maybeSingle();
            const overrideText = (ver?.content || '').trim();
            if (overrideText) {
              empresaContext += `\n\n=== INSTRUCCIONES ADICIONALES DEL ADMINISTRADOR (${overridePrompt.name}) ===\nLas siguientes instrucciones tienen PRIORIDAD MÁXIMA sobre las directrices generales y deben aplicarse siempre:\n\n${overrideText}\n=== FIN DE INSTRUCCIONES DEL ADMINISTRADOR ===\n`;
              console.log(`[ai-prompts] Override activo aplicado: ${promptKey} (action=${action})`);
            }
          }
        }
      } catch (e) {
        console.warn('[ai-prompts] No se pudo cargar el override:', e);
      }
    }

    // ── Helper: fetch full worker history from DB ──
    async function fetchWorkerHistory(workerNames: string[], departmentId?: string, workerIds?: string[], excludeRecordId?: string): Promise<string> {
      if ((!workerNames || workerNames.length === 0) && (!workerIds || workerIds.length === 0)) return '';
      try {
        let recordWorkers: any[] = [];

        if (workerIds && workerIds.length > 0) {
          // PREFERRED: use exact worker IDs for precise matching
          const { data } = await supabase
            .from('incidencias_record_workers')
            .select('worker_id, worker_name, worker_number, record_id')
            .in('worker_id', workerIds);
          recordWorkers = data || [];
        } else {
          // Fallback: fuzzy name matching (less reliable)
          const { data } = await supabase
            .from('incidencias_record_workers')
            .select('worker_id, worker_name, worker_number, record_id')
            .or(workerNames.map(n => `worker_name.ilike.%${n.split(' ')[0]}%`).join(','));
          recordWorkers = data || [];
        }

        // CRITICAL: Exclude the current record being analyzed to prevent self-referencing
        if (excludeRecordId) {
          recordWorkers = recordWorkers.filter(rw => rw.record_id !== excludeRecordId);
        }
        
        if (recordWorkers.length === 0) return '';
        
        const recordIds = [...new Set(recordWorkers.map(rw => rw.record_id))];
        const resolvedWorkerIds = [...new Set(recordWorkers.map(rw => rw.worker_id))];
        
        // Fetch all incidents + stats + performance history for these workers
        const [recordsRes, statsRes, perfRes] = await Promise.all([
          supabase.from('incidencias_records')
            .select('id, fecha, descripcion, estado, accion_propuesta, ai_gravedad_sugerida, custom_category_name, department_id, created_at')
            .in('id', recordIds.slice(0, 50))
            .is('deleted_at', null)
            .order('fecha', { ascending: false }),
          supabase.from('incidencias_worker_stats')
            .select('*')
            .in('worker_id', resolvedWorkerIds),
          supabase.from('worker_performance_history')
            .select('worker_id, lines_hour, recorded_at')
            .in('worker_id', resolvedWorkerIds)
            .order('recorded_at', { ascending: false })
            .limit(50),
        ]);
        
        const records = recordsRes.data || [];
        const stats = statsRes.data || [];
        const perfHistory = perfRes.data || [];
        
        if (records.length === 0 && stats.length === 0 && perfHistory.length === 0) return '';
        
        let historyBlock = '\n\nHISTORIAL COMPLETO DE LOS TRABAJADORES IMPLICADOS:';
        
        // Add stats summary per worker
        for (const s of stats) {
          const wName = recordWorkers.find(rw => rw.worker_id === s.worker_id)?.worker_name || 'Desconocido';
          historyBlock += `\n\n📊 ${wName} — Estadísticas acumuladas:`;
          historyBlock += `\n  Total incidencias: ${s.total_count} (leves: ${s.leves}, graves: ${s.graves}, muy graves: ${s.muy_graves})`;
          historyBlock += `\n  Reincidencias: ${s.reincidencias} | Riesgo: ${s.riesgo_score}/100`;
          historyBlock += `\n  Últimos 30d: ${s.ultimos_30} | 60d: ${s.ultimos_60} | 90d: ${s.ultimos_90}`;
        }

        // Add performance data per worker
        for (const wId of resolvedWorkerIds) {
          const wPerf = perfHistory.filter((p: any) => p.worker_id === wId);
          if (wPerf.length > 0) {
            const wName = recordWorkers.find(rw => rw.worker_id === wId)?.worker_name || 'Desconocido';
            const latest = wPerf[0];
            const avg = wPerf.reduce((sum: number, p: any) => sum + Number(p.lines_hour), 0) / wPerf.length;
            const trend = wPerf.length >= 2 ? (Number(wPerf[0].lines_hour) - Number(wPerf[wPerf.length - 1].lines_hour)) : 0;
            historyBlock += `\n\n📈 ${wName} — Rendimiento (líneas/hora):`;
            historyBlock += `\n  Valor actual: ${Number(latest.lines_hour).toFixed(2)} (${latest.recorded_at})`;
            historyBlock += `\n  Media: ${avg.toFixed(2)} | Registros: ${wPerf.length}`;
            historyBlock += `\n  Tendencia: ${trend > 0 ? '↑ mejorando' : trend < 0 ? '↓ empeorando' : '→ estable'}`;
          }
        }
        
        // Add recent incidents
        if (records.length > 0) {
          historyBlock += '\n\n📋 Incidencias recientes:';
          for (const r of records.slice(0, 15)) {
            const workerNamesForRecord = recordWorkers
              .filter(rw => rw.record_id === r.id)
              .map(rw => rw.worker_name.split(' ')[0])
              .join(', ');
            const fecha = new Date(r.fecha).toLocaleDateString('es-ES');
            historyBlock += `\n  - ${fecha}: ${r.descripcion?.substring(0, 120) || 'Sin descripción'} [${r.ai_gravedad_sugerida || 'sin clasificar'}] (${workerNamesForRecord})`;
          }
        }
        
        if (records.length > 0) {
          historyBlock += '\n\nUSA EXCLUSIVAMENTE ESTE HISTORIAL para contextualizar. Si hay patrones de comportamiento recurrente, menciónalo. PROHIBIDO inventar, fabricar o suponer incidencias que NO aparezcan en esta lista.\n';
        } else {
          historyBlock += '\n\nNO HAY INCIDENCIAS PREVIAS REGISTRADAS para este trabajador. PROHIBIDO inventar o mencionar incidencias previas inexistentes.\n';
        }
        return historyBlock;
      } catch (e) {
        console.warn('Error fetching worker history:', e);
        return '';
      }
    }

    // ── Helper: auto-save AI learning to memory ──
    async function autoSavelearning(titulo: string, contenido: string, categoria: string) {
      try {
        // Check if similar entry exists to avoid duplicates
        const { data: existing } = await supabase
          .from('incidencias_ai_memory_entries')
          .select('id')
          .eq('titulo', titulo)
          .limit(1);
        if (existing && existing.length > 0) return; // already exists
        
        await supabase.from('incidencias_ai_memory_entries').insert({
          titulo,
          contenido,
          categoria,
          suggested_by_ai: true,
        });
      } catch { /* non-critical */ }
    }

    switch (action) {
      case 'clasificar':
        return await handleClasificar(body, GOOGLE_AI_API_KEY, aiConfig, empresaContext, fetchWorkerHistory, autoSavelearning);
      case 'generar_borrador_sancion':
        return await handleBorradorSancion(body, GOOGLE_AI_API_KEY, aiConfig, empresaContext, fetchWorkerHistory, autoSavelearning);
      case 'resumen_trabajador':
        return await handleResumen(body, GOOGLE_AI_API_KEY, empresaContext);
      case 'consultar_convenio':
        return await handleConsulta(body, GOOGLE_AI_API_KEY, empresaContext);
      case 'predict_worker_risk':
        return await handlePredictWorkerRisk(body, GOOGLE_AI_API_KEY, empresaContext);
      case 'generate_department_insights':
        return await handleDepartmentInsights(body, GOOGLE_AI_API_KEY, empresaContext);
      case 'generate_admin_summary':
        return await handleAdminSummary(body, GOOGLE_AI_API_KEY, empresaContext);
      case 'analyze_patterns':
        return await handleAnalyzePatterns(body, GOOGLE_AI_API_KEY, empresaContext);
      case 'limpiar_transcripcion':
        return await handleLimpiarTranscripcion(body, GOOGLE_AI_API_KEY, aiConfig, empresaContext);
      case 'transcribir_audio':
        return await handleTranscribirAudio(body, GOOGLE_AI_API_KEY, aiConfig, empresaContext);
      case 'generateLegalDocument':
        return await handleGenerateLegalDocument(body, GOOGLE_AI_API_KEY, empresaContext);
      case 'generar_borrador_nspp':
        return await handleBorradorNSPP(body, GOOGLE_AI_API_KEY, aiConfig, empresaContext, autoSavelearning);
      case 'generateNSPPDocument':
        return await handleGenerateNSPPDocument(body, GOOGLE_AI_API_KEY, empresaContext);
      case 'analizar_propuesta_completa':
        return await handleAnalyzeProposal(body, GOOGLE_AI_API_KEY, aiConfig, empresaContext, fetchWorkerHistory, autoSavelearning);
      case 'chat_propuesta':
        return await handleChatPropuesta(body, GOOGLE_AI_API_KEY, aiConfig, empresaContext);
      case 'editLegalDocument':
        return await handleEditLegalDocument(body, GOOGLE_AI_API_KEY, empresaContext);
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (err) {
    console.error('control-incidencias-ai error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ── Complete Proposal Analysis ──────────────────────────────────────
async function handleAnalyzeProposal(body: any, apiKey: string, aiConfig: any, empresaContext: string, fetchWorkerHistory: (names: string[], deptId?: string, workerIds?: string[], excludeRecordId?: string) => Promise<string>, autoSavelearning: (t: string, c: string, cat: string) => Promise<void>) {
  const {
    tipo_actual, gravedad_actual, suspension_dias, departamento, descripcion,
    fecha_hechos, categoria, accion_propuesta, trabajadores, historial_estadisticas,
    fichajes_recientes, tiene_pruebas, num_imagenes, imagen_urls, video_urls, is_nspp, encargado_nombre,
    instrucciones_usuario, use_lite_model, worker_ids, exclude_record_id,
    custom_category_name, categorias_disponibles,
  } = body;

  const workerNames = (trabajadores || []).map((t: any) => t.nombre);

  // NSPP proposals are NOT disciplinary — skip AI analysis entirely
  if (is_nspp) {
    return new Response(JSON.stringify({
      valoracion_hechos: 'La no superación del periodo de prueba (NSPP) es una causa de extinción contractual independiente del régimen disciplinario (Art. 14.2 ET). No procede análisis disciplinario.',
      fundamentacion_legal: 'Art. 14.2 del Estatuto de los Trabajadores: durante el periodo de prueba, cualquiera de las partes puede resolver la relación laboral sin necesidad de alegar causa y sin preaviso. No aplica el régimen de faltas y sanciones del convenio colectivo.',
      articulos_aplicables: ['Art. 14.2 ET'],
      tipo_recomendado: 'nspp',
      gravedad_recomendada: '',
      dias_suspension_recomendados: 0,
      justificacion_cambio: 'No procede clasificación disciplinaria. La NSPP se rige por el Art. 14.2 ET, no por el régimen sancionador.',
      evaluacion_reincidencia: 'No aplica. La NSPP no es una incidencia disciplinaria.',
      analisis_pruebas: 'Las pruebas adjuntas documentan la justificación de la no superación del periodo de prueba, no constituyen prueba disciplinaria.',
      riesgo_empresa: 'bajo',
      riesgo_detalle: 'La extinción en periodo de prueba es un derecho reconocido por el Art. 14.2 ET. El riesgo es bajo siempre que se comunique antes de que finalice el periodo de prueba.',
      acciones_recomendadas: ['Comunicar la extinción por escrito antes de que finalice el periodo de prueba', 'Conservar documentación que acredite la evaluación del trabajador'],
      resumen_ejecutivo: 'La no superación del periodo de prueba no es una incidencia disciplinaria. Se rige por el Art. 14.2 ET y no requiere análisis de faltas ni sanciones.',
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  const workerHistory = await fetchWorkerHistory(workerNames, departamento, worker_ids, exclude_record_id);

  const customBlock = aiConfig.instrucciones_custom?.trim()
    ? `\n\nINSTRUCCIONES ADICIONALES DEL ADMINISTRADOR:\n${aiConfig.instrucciones_custom}`
    : '';

  const userInstructionsBlock = instrucciones_usuario?.trim()
    ? `\n\n⚠️ INSTRUCCIONES ESPECÍFICAS DEL USUARIO PARA ESTE RE-ANÁLISIS (PRIORIDAD ALTA — debes tener en cuenta esta información adicional proporcionada por el responsable que conoce el caso de primera mano, y ajustar tu valoración en consecuencia):\n${instrucciones_usuario}`
    : '';

  const statsBlock = (historial_estadisticas || []).map((s: any) => {
    const amonestCatStr = s.amonestaciones_por_categoria && Object.keys(s.amonestaciones_por_categoria).length > 0
      ? Object.entries(s.amonestaciones_por_categoria).map(([cat, n]: any) => `${cat}=${n}`).join(', ')
      : 'ninguna';
    const ultAmonest = s.ultima_amonestacion_categoria_actual
      ? `\n  · ÚLTIMA AMONESTACIÓN PREVIA EN ESTA MISMA CATEGORÍA ("${s.ultima_amonestacion_categoria_actual.categoria}"): fecha ${s.ultima_amonestacion_categoria_actual.fecha?.slice(0,10)} — "${s.ultima_amonestacion_categoria_actual.descripcion}"`
      : '\n  · No hay amonestación previa documentada en la categoría actual.';
    return `${s.nombre}: Total=${s.total}, Leves=${s.leves}, Graves=${s.graves}, MuyGraves=${s.muy_graves}, Reincidencias=${s.reincidencias}, Riesgo=${s.riesgo}/100, Últ.30d=${s.ultimos_30d}, Últ.60d=${s.ultimos_60d}\n  · Amonestaciones formales previas: total=${s.amonestaciones_total ?? 0}; por categoría: ${amonestCatStr}${ultAmonest}`;
  }).join('\n');

  const categoriaActualNombre = body.categoria_actual_nombre || categoria || 'Sin categoría';

  const clockBlock = (fichajes_recientes || []).length > 0
    ? `\nFICHAJES RECIENTES:\n${(fichajes_recientes || []).map((c: any) => `${c.tipo}: ${c.fecha}`).join('\n')}`
    : '';

  // Re-análisis con instrucciones de usuario = texto-only (más rápido y evita 400 INVALID_ARGUMENT con vídeos)
  // El análisis original ya procesó los vídeos; el contexto textual del chat es lo que aporta valor nuevo.
  const isReanalisisConChat = !!instrucciones_usuario?.trim();
  const videoUrlsList: string[] = (Array.isArray(video_urls) && !isReanalisisConChat) ? video_urls.slice(0, 3) : [];
  const hasVideos = videoUrlsList.length > 0;
  // Filtrar imagen_urls para excluir URLs que sean realmente vídeos (extensiones .mp4/.webm/.mov/.avi/.mkv)
  const isImageUrl = (u: string) => !/\.(mp4|webm|mov|avi|mkv|m4v|wmv|flv)(\?|$)/i.test(u);
  const safeImagenUrls: string[] = Array.isArray(imagen_urls)
    ? (imagen_urls as string[]).filter(isImageUrl).slice(0, isReanalisisConChat ? 0 : 8)
    : [];

  const systemPrompt = `Eres un abogado laboralista español prudente y riguroso, especializado en régimen disciplinario.
Tu trabajo es realizar un ANÁLISIS COMPLETO de una propuesta disciplinaria con MÁXIMA CAUTELA JURÍDICA.

PRINCIPIO FUNDAMENTAL — PROPORCIONALIDAD Y PRUDENCIA:
La proporcionalidad es el pilar del derecho disciplinario. Ante la duda, SIEMPRE clasifica con la gravedad MENOR posible. Es preferible infraclasificar que sobreclasificar, porque:
- Una sanción desproporcionada será anulada por un juez.
- La empresa pierde credibilidad y puede ser condenada en costas.
- El trabajador puede reclamar daños y perjuicios.

REGLA DE TIPICIDAD DISCIPLINARIA (PRINCIPIO ABSOLUTO — APLICA SIEMPRE ANTES QUE NADA):
- TODA medida disciplinaria (amonestación o sanción) debe estar OBLIGATORIAMENTE anclada a un apartado concreto del Art. 50 del convenio. El campo "articulos_aplicables" NUNCA puede ir vacío si recomiendas amonestación o sanción.
- Si los hechos NO encajan en ningún apartado del Art. 50 (ni leve, ni grave, ni muy grave), NO se puede sancionar NI amonestar formalmente. En ese caso debes:
  · Recomendar tipo "amonestacion" SOLO como llamada de atención informal sin valor disciplinario, dejándolo claro en valoracion_hechos y en resumen_ejecutivo ("conducta no tipificada en el Art. 50 — no procede medida disciplinaria formal").
  · Bajar la confianza y avisar en riesgo_detalle de que cualquier sanción formal sería nula por falta de tipicidad.
- Si los hechos SÍ están tipificados pero solo como leve (Art. 50.1) → la única medida posible es AMONESTACIÓN verbal/escrita o suspensión hasta 2 días. NUNCA propongas sanción superior aunque parezca "merecida".
- Si los hechos están tipificados como graves o muy graves (Art. 50.2 / 50.3), NO puedes quedarte en simple amonestación aunque el encargado lo proponga así: el convenio EXIGE suspensión, traslado o despido según corresponda. Debes corregir al encargado y proponer SANCIÓN.
- Resumen del filtro:
  · Hecho NO tipificado → no procede medida formal (advertir).
  · Hecho tipificado leve → amonestación o suspensión ≤2 días.
  · Hecho tipificado grave → sanción obligatoria (suspensión 3-14 días).
  · Hecho tipificado muy grave → sanción obligatoria (suspensión 14-30 días, traslado o despido).

DIFERENCIA CONCEPTUAL AMONESTACIÓN vs SANCIÓN:
- AMONESTACIÓN = llamada de atención (verbal o escrita), SIN pérdida de empleo/sueldo. Solo cabe para faltas LEVES (Art. 51.a). Toda amonestación formal se vincula obligatoriamente a un apartado del Art. 50.1.
- SANCIÓN = suspensión de empleo y sueldo, traslado o despido. Reservada a faltas GRAVES (Art. 51.b) y MUY GRAVES (Art. 51.c).
- En el campo gravedad_recomendada: amonestación → "" (vacío); sanción → leve/grave/muy_grave (la "leve" en sanción solo aplica si es suspensión 1-2 días, no amonestación).

REGLA DE PRESCRIPCIÓN (Art. 60.2 ET — informativa, el contador empieza en la fecha del hecho):
- Faltas LEVES → 10 días para notificar al trabajador.
- Faltas GRAVES → 20 días.
- Faltas MUY GRAVES → 60 días.
La prescripción depende SOLO de la gravedad de la falta, no del tipo de medida. Toda amonestación es por falta leve → siempre 10 días.

REGLAS ESTRICTAS DE CLASIFICACIÓN (OBLIGATORIAS):

1. PRIMERA VEZ SIN REINCIDENCIA:
   - Si es la PRIMERA incidencia del trabajador y no hay historial previo, la recomendación por defecto es AMONESTACIÓN ESCRITA (aviso formal sin gravedad).
   - Solo se debe recomendar sanción en primera vez si los hechos son objetivamente graves o muy graves POR SU PROPIA NATURALEZA (ej: robo, agresión, fraude, poner en riesgo la seguridad de personas).
   - Una ejecución deficiente del trabajo en primera vez = AMONESTACIÓN, salvo que cause un perjuicio económico DEMOSTRADO Y CUANTIFICADO como grave.

2. FALTAS LEVES (Art. 50.1):
   - Impuntualidad menor, inasistencia de 1 día, descuidos leves, falta de corrección menor, embriaguez no habitual.
   - Sanción máxima: amonestación verbal/escrita o suspensión de hasta 2 días (Art. 51.a).

3. FALTAS GRAVES (Art. 50.2):
   - REQUIEREN uno de estos supuestos concretos del convenio: impuntualidad reiterada (hasta 60 min/mes), inasistencia de 2-4 días/mes, desobediencia, ejecución deficiente SIN perjuicio grave, disminución no repetida del rendimiento, reincidencia en 5 faltas leves en un trimestre.
   - Art. 50.2.l: "ejecución deficiente de los trabajos encomendados, SIEMPRE QUE DE ELLO NO SE DERIVASE PERJUICIO GRAVE para las personas o las cosas" → esto es falta GRAVE, no muy grave.
   - Sanción máxima: suspensión de 3 a 14 días (Art. 51.b).

4. FALTAS MUY GRAVES (Art. 50.3) — EXTREMA CAUTELA:
   - SOLO clasificar como muy grave cuando se cumplan LITERALMENTE los supuestos del Art. 50.3.
   - Art. 50.3.l hace referencia a los derivados de 50.1.d y 50.2.l y 50.2.m: abandono con riesgo para personas/cosas, ejecución deficiente CON PERJUICIO GRAVE DEMOSTRADO, o disminución REPETIDA del rendimiento.
   - "Perjuicio grave" NO es lo mismo que "perjuicio". Un encaje defectuoso, un error puntual, un descuido → son ejecución deficiente (GRAVE a lo sumo), no muy grave, salvo que se demuestre un daño económico significativo y cuantificable.
   - Sanción máxima: suspensión de 14 días a 1 mes, traslado, o despido (Art. 51.c).

4.bis. INASISTENCIA INJUSTIFICADA — REGLAS LITERALES Y EXCLUSIVAS DEL CONVENIO (CRÍTICO):
   La clasificación por inasistencia injustificada se rige ÚNICAMENTE por estos tres apartados. NO inventes umbrales distintos ni combines criterios.

   ▸ Art. 50.1.b (LEVE) — texto literal: "La inasistencia injustificada al trabajo de UN día durante el período de un mes."
     → 1 día de ausencia injustificada en el último mes = LEVE.

   ▸ Art. 50.2.b (GRAVE) — texto literal: "La inasistencia injustificada al trabajo de DOS A CUATRO días durante el período de un mes."
     → 2, 3 o 4 días de ausencia injustificada en el último mes = GRAVE.

   ▸ Art. 50.3.b (MUY GRAVE) — texto literal: "La inasistencia injustificada al trabajo durante TRES DÍAS CONSECUTIVOS o CINCO ALTERNOS en un período de un mes."
     → SOLO se cumple si: (a) hay 3 ausencias injustificadas EN DÍAS CONSECUTIVOS, o (b) hay 5 ausencias injustificadas (alternas o no) en el último mes.
     → NUNCA clasifiques una inasistencia como muy grave por Art. 50.3.b si no se acredita uno de esos dos supuestos exactos. NO existe "tres días alternos" como umbral.

   REGLAS DE APLICACIÓN:
   - Cuenta SIEMPRE las ausencias injustificadas del trabajador en los últimos 30 días naturales (incluyendo la del hecho actual).
   - Si solo hay 1 ausencia (la actual) y no hay otras en el mes → LEVE (Art. 50.1.b). Recomienda AMONESTACIÓN ESCRITA si es primera vez.
   - Si hay entre 2 y 4 ausencias en el mes → GRAVE (Art. 50.2.b).
   - Si hay 3 consecutivas o 5+ en el mes → MUY GRAVE (Art. 50.3.b) + audiencia previa obligatoria.
   - Reincidencia formal por sanciones previas (Vía A) puede igualmente escalar la calificación, pero NUNCA cites Art. 50.3.b como fundamento si no se cumple su supuesto literal. Usa Art. 50.3.m (reincidencia) en ese caso.
   - PROHIBIDO escribir frases como "inasistencia injustificada al trabajo durante tres días alternos en el mes" — ese supuesto NO existe en el convenio.

5. REINCIDENCIA Y "ADVERTENCIA DEBIDA" — DOS VÍAS DIFERENTES PARA ESCALAR (CRÍTICO, LEER CON ATENCIÓN):

   ▸ VÍA A — REINCIDENCIA FORMAL (Art. 50.2.o y Art. 50.3.m):
     - Para escalar de leve a grave por reincidencia (Art. 50.2.o): se necesitan 5 faltas leves SANCIONADAS (sanción formal aplicada, no solo registradas, no solo amonestación verbal) en un trimestre.
     - Para escalar de grave a muy grave (Art. 50.3.m): se necesitan 2+ SANCIONES formales por faltas graves en un año.
     - Para Vía A solo cuentan SANCIONES (suspensión de empleo y sueldo, traslado, despido). Las amonestaciones NO cuentan aquí.

   ▸ VÍA B — ADVERTENCIA PREVIA DOCUMENTADA (Art. 50.3.a y Art. 50.3.k):
     - Esta vía es INDEPENDIENTE de la Vía A. Permite calificar el hecho actual como MUY GRAVE sin necesidad de reincidencia formal, SIEMPRE QUE el convenio exija "debidamente advertida" y exista al menos UN antecedente escrito previo documentado por hechos análogos.
     - Casos del convenio que admiten Vía B:
       · Art. 50.3.a — IMPUNTUALIDAD reiterada (10 retrasos en 6 meses o 20 en un año) "DEBIDAMENTE ADVERTIDA". Si el trabajador acumula esos retrasos Y consta antecedente escrito previo por impuntualidad, la falta es MUY GRAVE.
       · Art. 50.3.k — REITERADA NO UTILIZACIÓN DE EPIs "DEBIDAMENTE ADVERTIDA". Si no usa los EPIs reiteradamente Y consta antecedente escrito previo por EPIs / seguridad, la falta es MUY GRAVE.

     - JERARQUÍA DE ANTECEDENTES VÁLIDOS COMO "ADVERTENCIA DEBIDA" (de menor a mayor fuerza probatoria):
       ❌ Advertencia VERBAL → NO sirve. No deja rastro probatorio. La jurisprudencia del TS exige constancia escrita y notificación fehaciente. NUNCA aceptes una advertencia verbal como "advertencia debida".
       ✅ Amonestación ESCRITA formal previa (firmada o notificada) por la misma categoría → SÍ sirve.
       ✅ Sanción LEVE formal previa por hechos análogos → SÍ sirve (con más motivo que una amonestación, porque es un acto disciplinario formal con notificación fehaciente).
       ✅ Sanción GRAVE formal previa por hechos análogos → SÍ sirve (prueba reforzada). En este caso además se cumple SIMULTÁNEAMENTE Vía A (Art. 50.3.m) y Vía B (Art. 50.3.a/k).

     - REGLA CLAVE: cualquier antecedente disciplinario ESCRITO previo en la misma categoría (amonestación, sanción leve o sanción grave) ya cumple el requisito de "advertencia debida". No hace falta que existan AMBOS (amonestación + sanción): basta con uno cualquiera de ellos.
     - REVISA SIEMPRE los campos "amonestaciones_por_categoria", "ultima_amonestacion_categoria_actual" y las sanciones previas del historial. Si el hecho actual es impuntualidad/EPIs y existe ya cualquier antecedente escrito en esa misma categoría → APLICA Vía B y eleva a MUY GRAVE.
     - Cuando apliques Vía B, DEBES citar literalmente el antecedente previo (tipo: amonestación/sanción leve/sanción grave, fecha y descripción breve) en el campo "evaluacion_reincidencia" y en "cita_advertencia_previa" como prueba de la "advertencia debida".

     - SI NO HAY antecedente escrito previo en la categoría actual (solo advertencias verbales o ningún antecedente):
       · NO apliques Vía B. NO eleves a muy grave por esta vía.
       · Mantén la calificación según el supuesto base del convenio (típicamente GRAVE para impuntualidad reiterada sin advertencia previa documentada — Art. 50.2 análogo).
       · En "acciones_recomendadas" recomienda EXPLÍCITAMENTE: "Aplicar la sanción correspondiente a falta grave. Esta sanción formal queda documentada y servirá como 'advertencia debida' para escalar a muy grave en futuras reincidencias por el mismo motivo."
       · NO recomiendes emitir una amonestación adicional cuando ya se va a imponer una sanción grave: la propia sanción grave ya cumple la doble función de sancionar el hecho actual Y dejar constancia escrita para el futuro. Sería redundante y desproporcionado.

   ▸ Si NO se cumple Vía A NI Vía B, NO invoques reincidencia ni eleves la gravedad.

6. AUDIENCIA PREVIA OBLIGATORIA PARA FALTAS MUY GRAVES:
   - Cuando recomiendes gravedad MUY GRAVE (por cualquier vía), la propuesta requiere conceder al trabajador un PLAZO DE AUDIENCIA PREVIA de 5 días hábiles para presentar alegaciones escritas antes de aplicar la sanción definitiva.
   - Fundamento: garantía del derecho de defensa (Art. 24 CE y doctrina TS). Especialmente importante si el desenlace puede ser despido, traslado o suspensión > 14 días.
   - Esto NO sustituye la sanción definitiva: es un trámite previo. El admin generará un "Pliego de cargos" y dejará pasar 5 días hábiles antes de aprobar la sanción.
   - Marca SIEMPRE requiere_audiencia_previa = true cuando gravedad_recomendada = "muy_grave".
   - En "acciones_recomendadas" añade explícitamente: "Generar pliego de cargos y conceder audiencia previa de 5 días hábiles antes de la sanción definitiva."

7. PRINCIPIO DE CAUTELA Y CONSULTA AL ADMIN (CRÍTICO — APLICA A TODA RECOMENDACIÓN GRAVE/MUY GRAVE):
   Antes de recomendar una sanción GRAVE o MUY GRAVE debes verificar que TODOS los datos del supuesto del convenio están acreditados objetivamente con los datos proporcionados. Si falta información, hay ambigüedad o no puedes verificar un umbral concreto del convenio, NO inventes ni asumas — DEBES preguntar al administrador antes de decidir.

   Casos típicos en los que DEBES preguntar:
   · Inasistencia injustificada: si los datos no acreditan claramente cuántas ausencias injustificadas tiene el trabajador en el último mes ni si fueron consecutivas, NO cites Art. 50.3.b. Pregunta primero.
   · Impuntualidad reiterada (Art. 50.3.a): si no consta el conteo exacto de retrasos en 6 meses (≥10) o en 1 año (≥20), pregunta antes de citar el supuesto muy grave.
   · Vía B (advertencia previa): si dudas si el antecedente escrito previo aplica a la misma categoría o si su fecha es válida, pregunta antes de aplicar.
   · Perjuicio grave económico (Art. 50.3.l): si no consta la cuantía o el daño concreto, pregunta antes de calificar.
   · Hechos descritos de forma vaga, contradictoria o sin fecha clara que impida calcular prescripción.
   · Cualquier otro supuesto del Art. 50.3 cuya tipificación dependa de un umbral o requisito que NO puedas confirmar con los datos.

   CÓMO PREGUNTAR:
   · Rellena el array "preguntas_admin" con objetos { pregunta, motivo, campo_relacionado }.
     - "pregunta": redactada en español claro, dirigida al administrador, una sola pregunta concreta por elemento.
     - "motivo": por qué necesitas saberlo (qué supuesto del convenio depende de la respuesta).
     - "campo_relacionado": uno de "ausencias_mes", "retrasos_periodo", "advertencia_previa", "perjuicio_economico", "fecha_hechos", "otro".
   · Pon "necesita_aclaracion": true.
   · Cuando "necesita_aclaracion" es true, NO recomiendes muy_grave. Recomienda la calificación más conservadora que se sostenga con los datos actuales (típicamente leve o grave según el caso) y explica en "resumen_ejecutivo" que la calificación definitiva depende de las respuestas del admin.
   · Si tienes TODOS los datos necesarios y no hay ambigüedad, deja "preguntas_admin" como array vacío [] y "necesita_aclaracion": false.
   · Es preferible PREGUNTAR DE MÁS que asumir de menos. Una pregunta extra al admin nunca es un error; inventar un supuesto del convenio sí lo es.

ERRORES COMUNES QUE DEBES EVITAR:
- NO confundas "ejecución deficiente" (Art. 50.2.l = grave) con "ejecución deficiente con perjuicio grave" (Art. 50.3.l = muy grave). La diferencia es el PERJUICIO GRAVE DEMOSTRADO.
- NO escales la gravedad solo porque el producto llegó mal al cliente. Eso es ejecución deficiente sin más, salvo prueba de daño económico grave.
- NO clasifiques como muy grave una primera incidencia salvo hechos extremos (robo, agresión, fraude) o que claramente cumpla Vía B (advertencia previa ESCRITA documentada en impuntualidad/EPIs).
- NO asumas perjuicio grave sin evidencia concreta. "Llegó estropeado" ≠ perjuicio grave demostrado.
- NO recomiendes suspensión si una amonestación escrita es suficiente y proporcionada.
- NO ignores la Vía B: si el campo "ultima_amonestacion_categoria_actual" tiene datos, evalúa siempre si aplica Art. 50.3.a / 50.3.k.
- NO aceptes NUNCA "advertencias verbales" como prueba de "advertencia debida". Solo valen antecedentes ESCRITOS (amonestación, sanción leve o sanción grave previa por hechos análogos).
- NO recomiendes emitir una amonestación adicional cuando ya se va a imponer una sanción formal (leve o grave) por el mismo hecho. La propia sanción ya deja constancia escrita y servirá como "advertencia debida" para futuras reincidencias. Sería redundante.
- NO escales a muy grave por Vía B si el único antecedente es verbal o no existe antecedente escrito en la misma categoría: en ese caso la sanción correcta es GRAVE, y esa misma sanción habilita el escalado a muy grave en el siguiente episodio.

${CONVENIO_CONTEXT}
${empresaContext}
${customBlock}

DATOS DE LA PROPUESTA:
- Tipo actual: ${tipo_actual} (amonestacion = aviso escrito sin gravedad; sancion = con gravedad y posible suspensión)
- Gravedad actual: ${gravedad_actual || 'N/A'}
- Días suspensión: ${suspension_dias ?? 'N/A'}${tipo_actual === 'sancion' && (suspension_dias === 0 || suspension_dias === null) ? ' → SE SOLICITA SANCIÓN SIN SUSPENSIÓN DE EMPLEO Y SUELDO. Tenlo en cuenta en tu análisis.' : ''}
- Departamento: ${departamento}
- Categoría: ${categoria || 'Sin categoría'}${categoria === 'Otros' && custom_category_name ? ` → TEXTO DEL ENCARGADO EN "OTROS": "${custom_category_name}". IMPORTANTE: El encargado usa "Otros" cuando no sabe clasificar. Analiza el texto y asigna la categoría correcta de la lista disponible. El texto de "Otros" debe tratarse como DESCRIPCIÓN DE LOS HECHOS.` : ''}
${categorias_disponibles && categorias_disponibles.length > 0 ? `- Categorías disponibles para reclasificación: ${categorias_disponibles.join(', ')}` : ''}
- Fecha hechos: ${fecha_hechos}
- Acción propuesta por encargado: ${accion_propuesta || 'No especificada'}
- Encargado que reporta: ${encargado_nombre || 'No especificado'}
- Tiene pruebas adjuntas: ${tiene_pruebas ? `Sí (${num_imagenes} imagen(es)${body.num_videos ? `, ${body.num_videos} vídeo(s)` : ''}${body.num_otros_archivos ? `, ${body.num_otros_archivos} otro(s)` : ''})` : 'No'}
${is_nspp ? '- TIPO ESPECIAL: No Superación del Periodo de Prueba (NSPP)' : ''}

DESCRIPCIÓN DE LOS HECHOS:
${descripcion}${categoria === 'Otros' && custom_category_name && (!descripcion || descripcion.trim() === '') ? `\n[Nota: El encargado no rellenó la descripción pero puso esta información en la categoría "Otros": "${custom_category_name}". USA ESTE TEXTO como descripción de los hechos para tu análisis.]` : ''}

CATEGORÍA ACTUAL DEL HECHO: "${categoriaActualNombre}"
(Compara amonestaciones previas en ESTA misma categoría para evaluar Vía B / advertencia debida.)

ESTADÍSTICAS Y AMONESTACIONES PREVIAS DEL TRABAJADOR
(Sanciones formales = Vía A reincidencia. Amonestaciones formales = Vía B advertencia previa.):
${statsBlock || 'Sin datos previos — PRIMERA INCIDENCIA: ser cauteloso con la clasificación'}
${clockBlock}
${workerHistory || '\n⚠️ NO HAY HISTORIAL PREVIO de incidencias para este trabajador. Es su PRIMERA incidencia registrada en el sistema.\n'}

REGLA ANTI-ALUCINACIÓN (CRÍTICA — VIOLACIÓN = ERROR GRAVE):
- SOLO puedes mencionar incidencias previas que aparezcan EXPLÍCITAMENTE en el historial proporcionado arriba.
- Si el historial está vacío o dice "NO HAY INCIDENCIAS PREVIAS", ESTÁ TERMINANTEMENTE PROHIBIDO mencionar, inventar o suponer incidencias anteriores, sanciones previas o patrones de reincidencia.
- NUNCA escribas frases como "según su historial, ya tuvimos..." o "existen antecedentes de..." si NO hay datos reales en el historial.
- Si no hay historial, debes tratar al trabajador como si fuera su PRIMERA incidencia, sin excepciones.
- Inventar historial falso es un error GRAVE que puede causar sanciones injustas y responsabilidad legal para la empresa.

REGLA ANTI-INVENCIÓN DE PRODUCTOS (CRÍTICA):
- NUNCA inventes nombres de productos, flores, plantas o materiales específicos. Si no conoces el nombre exacto de lo que aparece en las imágenes, usa términos genéricos: "artículos", "mercancía", "referencias", "material", "producto".
- No describas lo que crees ver en las fotos con nombres específicos de plantas, flores o productos concretos.

REGLA OBLIGATORIA SOBRE EL NOMBRE DEL CONVENIO (CRÍTICA — DOCUMENTO LEGAL):
- El nombre OFICIAL y ÚNICO del convenio aplicable es: "XVIII Convenio Colectivo Estatal para las Empresas del Comercio de Flores y Plantas" (BOE-A-2025-21424).
- ESTÁ TERMINANTEMENTE PROHIBIDO escribir variantes inventadas como "Comercio de mercancía", "Comercio mayorista", "Comercio de plantas y flores", "Convenio de comercio" u otras. Cualquier desviación es un ERROR LEGAL GRAVE que invalida el documento.
- Cuando cites el convenio, escribe SIEMPRE su nombre exacto y completo, o de forma abreviada: "XVIII Convenio Colectivo Estatal del Comercio de Flores y Plantas".
- Esta regla se aplica incluso si la regla anti-invención de productos te impide usar "flores" o "plantas" en otros contextos: el nombre del convenio es la ÚNICA EXCEPCIÓN y debe respetarse literalmente.


INSTRUCCIONES PARA EL ANÁLISIS:
1. VALORACIÓN DE LOS HECHOS: Analiza objetivamente qué ocurrió. No exageres la gravedad. Distingue entre un error humano puntual y una conducta deliberada o negligente reiterada.
2. FUNDAMENTACIÓN LEGAL: Cita el artículo EXACTO del convenio que tipifica la conducta. Explica POR QUÉ encaja en ese artículo concreto y no en otro de mayor/menor gravedad.
3. RECOMENDACIÓN DE TIPO: Aplica el principio de proporcionalidad. Primera vez sin historial → preferir amonestación. Solo sanción si el convenio tipifica claramente como grave/muy grave.
4. EVALUACIÓN DE REINCIDENCIA: Solo si hay SANCIONES FORMALES previas (no registros internos). Cita los umbrales exactos del convenio.
5. ANÁLISIS DE PRUEBAS: Si hay imágenes o vídeos adjuntos, analízalos visualmente y describe lo que ves, su relevancia probatoria y cómo afectan al caso.
6. RIESGO PARA LA EMPRESA: El mayor riesgo es la DESPROPORCIONALIDAD. Una sanción excesiva será anulada judicialmente. Evalúa si la clasificación propuesta resistiría una impugnación.
7. ACCIONES RECOMENDADAS: Pasos concretos, priorizando la proporcionalidad y la documentación.
8. DÍAS DE SUSPENSIÓN (OBLIGATORIO si recomiendas sanción con suspensión):
   - Si recomiendas tipo "sancion" con gravedad leve/grave/muy_grave, DEBES determinar el número exacto de días de suspensión de empleo y sueldo.
   - Rangos legales: Leve = 0 a 2 días, Grave = 3 a 14 días, Muy grave = 14 a 30 días (Art. 51 del convenio).
   - DENTRO del rango legal, elige el número concreto basándote en TODOS estos factores:
     a) Gravedad intrínseca de la acción (impacto, intencionalidad, negligencia)
     b) Reincidencia: si hay sanciones previas formales, escalar proporcionalmente dentro del rango
     c) Historial general del trabajador (primera vez → parte baja del rango; reincidente → parte media-alta)
     d) Pruebas disponibles y su contundencia
     e) Circunstancias atenuantes o agravantes
     f) Perjuicio real causado a la empresa
   - Justifica SIEMPRE tu elección del número concreto en el campo justificacion_dias_suspension.
   - Si es amonestación, dias_suspension_recomendados DEBE ser 0.
${userInstructionsBlock}

REGLA TERMINOLÓGICA ESTRICTA (MUY IMPORTANTE):
- La AMONESTACIÓN nunca tiene gravedad. NUNCA escribas "amonestación leve", "amonestación grave" ni "amonestación muy grave" en NINGÚN campo de tu respuesta (ni en resumen_ejecutivo, ni en valoracion_hechos, ni en ningún otro). Eso NO existe legalmente. Solo existe "amonestación" o "amonestación escrita".
- La gravedad (leve, grave, muy grave) SOLO aplica a SANCIONES.
- Si recomiendas amonestación, el campo gravedad_recomendada DEBE ser cadena vacía "".`;

  // Build user message (multimodal if images/videos)
  const userInstructionText = instrucciones_usuario?.trim()
    ? `\n\nIMPORTANTE — El responsable que conoce el caso indica lo siguiente (DEBES tenerlo en cuenta y ajustar tu análisis):\n"${instrucciones_usuario}"`
    : '';

  const userContent: any[] = [
    { type: 'text', text: `Realiza el análisis completo de esta propuesta disciplinaria. Trabajador(es): ${workerNames.join(', ')}${userInstructionText}` },
  ];

  if (safeImagenUrls.length > 0) {
    for (const url of safeImagenUrls) {
      userContent.push({ type: 'image_url', image_url: { url } });
    }
  }

  // Add video URLs for visual analysis (Gemini supports video natively)
  if (hasVideos) {
    userContent.push({ type: 'text', text: `\n\nA continuación se adjuntan ${videoUrlsList.length} vídeo(s) como prueba. Analiza visualmente el contenido de cada vídeo y describe qué se observa y su relevancia como evidencia:` });
    for (const vUrl of videoUrlsList) {
      userContent.push({ type: 'image_url', image_url: { url: vUrl } });
    }
  }

  const userMessage = { role: 'user', content: userContent.length === 1 ? userContent[0].text : userContent };

  const tools = [{
    type: 'function',
    function: {
      name: 'proposal_analysis',
      description: 'Análisis completo y riguroso de una propuesta disciplinaria',
      parameters: {
        type: 'object',
        properties: {
          valoracion_hechos: { type: 'string', description: 'Valoración completa de los hechos descritos' },
          fundamentacion_legal: { type: 'string', description: 'Fundamentación legal rigurosa con artículos del convenio' },
          articulos_aplicables: { type: 'array', items: { type: 'string' }, description: 'Lista de artículos del convenio que aplican (ej: "50.2.a", "51.b")' },
          tipo_recomendado: { type: 'string', enum: ['amonestacion', 'sancion'], description: 'Tipo recomendado por la IA' },
          gravedad_recomendada: { type: 'string', enum: ['leve', 'grave', 'muy_grave', ''], description: 'Gravedad recomendada (vacío si amonestación)' },
          dias_suspension_recomendados: { type: 'number', description: 'Número exacto de días de suspensión de empleo y sueldo recomendados. OBLIGATORIO si tipo=sancion. Rangos: leve 0-2, grave 3-14, muy_grave 14-30. Debe ser 0 si tipo=amonestacion.' },
          justificacion_dias_suspension: { type: 'string', description: 'Justificación detallada de por qué se recomienda ese número concreto de días dentro del rango legal, considerando gravedad de la acción, reincidencia, historial, pruebas y circunstancias.' },
          justificacion_cambio: { type: 'string', description: 'Si recomienda cambiar el tipo/gravedad actual, explica por qué. Si coincide, indica que es correcto.' },
          evaluacion_reincidencia: { type: 'string', description: 'Evaluación de reincidencia basada en el historial' },
          analisis_pruebas: { type: 'string', description: 'Análisis de las pruebas adjuntas (imágenes, documentos)' },
          riesgo_empresa: { type: 'string', enum: ['bajo', 'medio', 'alto', 'critico'], description: 'Nivel de riesgo legal para la empresa' },
          riesgo_detalle: { type: 'string', description: 'Detalle del riesgo: prescripción, proporcionalidad, impugnación' },
          acciones_recomendadas: { type: 'array', items: { type: 'string' }, description: 'Lista de acciones concretas recomendadas' },
          resumen_ejecutivo: { type: 'string', description: 'Resumen ejecutivo de 2-3 frases del análisis' },
          categoria_sugerida: { type: 'string', description: 'Si la categoría actual es "Otros" o no es la más adecuada, sugiere la categoría correcta de la lista de categorías disponibles. Si la categoría actual es correcta, repítela. DEBE ser una de las categorías disponibles proporcionadas.' },
          categoria_razon: { type: 'string', description: 'Razón por la que se sugiere esta categoría. Si no cambia, indica que es correcta.' },
          requiere_audiencia_previa: { type: 'boolean', description: 'TRUE si la gravedad recomendada es muy_grave (audiencia previa obligatoria de 5 días hábiles antes de la sanción definitiva, garantía del derecho de defensa Art. 24 CE).' },
          via_escalado_aplicada: { type: 'string', enum: ['ninguna', 'via_a_reincidencia', 'via_b_advertencia_previa'], description: 'Vía utilizada para escalar la gravedad: ninguna (sin escalado), via_a (Art. 50.2.o / 50.3.m por sanciones previas), via_b (Art. 50.3.a / 50.3.k por advertencia previa documentada).' },
          cita_advertencia_previa: { type: 'string', description: 'Si aplicas Vía B, cita literal de la amonestación previa que sirve como "advertencia debida" (fecha y descripción breve). Vacío si no aplica.' },
          necesita_aclaracion: { type: 'boolean', description: 'TRUE si necesitas que el administrador responda preguntas antes de poder dar una recomendación definitiva (ver sección PRINCIPIO DE CAUTELA Y CONSULTA AL ADMIN). Cuando es TRUE, no recomiendes muy_grave: usa la calificación más conservadora que se sostenga con los datos actuales.' },
          preguntas_admin: { type: 'array', items: { type: 'object', properties: { pregunta: { type: 'string' }, motivo: { type: 'string' }, campo_relacionado: { type: 'string', enum: ['ausencias_mes', 'retrasos_periodo', 'advertencia_previa', 'perjuicio_economico', 'fecha_hechos', 'otro'] } }, required: ['pregunta', 'motivo', 'campo_relacionado'], additionalProperties: false }, description: 'Lista de preguntas que la IA dirige al administrador antes de tomar una decisión definitiva. Vacío si no se necesita aclaración.' },
        },
        required: ['valoracion_hechos', 'fundamentacion_legal', 'articulos_aplicables', 'tipo_recomendado', 'gravedad_recomendada', 'dias_suspension_recomendados', 'justificacion_dias_suspension', 'justificacion_cambio', 'evaluacion_reincidencia', 'riesgo_empresa', 'riesgo_detalle', 'acciones_recomendadas', 'resumen_ejecutivo', 'categoria_sugerida', 'categoria_razon', 'requiere_audiencia_previa', 'via_escalado_aplicada', 'cita_advertencia_previa', 'necesita_aclaracion', 'preguntas_admin'],
        additionalProperties: false,
      },
    },
  }];

  const response = await callAIWithMessages(apiKey, systemPrompt, userMessage, {
    tools,
    tool_choice: { type: 'function', function: { name: 'proposal_analysis' } },
    timeoutMs: use_lite_model ? 45000 : 90000,
    ...(use_lite_model ? { model: MODEL_LITE } : {}),
  });

  // Auto-save learning: record what the AI analyzed and concluded
  const firstName = workerNames[0]?.split(' ')[0] || 'Trabajador';
  autoSavelearning(
    `Análisis propuesta ${firstName}`,
    `${new Date().toLocaleDateString('es-ES')}: Analizada propuesta ${tipo_actual} (${gravedad_actual || 'sin gravedad'}) en ${departamento || 'departamento'}. ${descripcion?.substring(0, 150) || ''}. Pruebas: ${tiene_pruebas ? 'Sí' : 'No'}.`,
    'analisis'
  ).catch(() => {});

  return response;
}

// ── Classification ──────────────────────────────────────
async function handleClasificar(body: any, apiKey: string, aiConfig: any, empresaContext: string, fetchWorkerHistory: (names: string[], deptId?: string) => Promise<string>, autoSavelearning: (t: string, c: string, cat: string) => Promise<void>) {
  const { descripcion, contexto_trabajador, categoria_encargado, historial_detallado, trabajador_nombres, importe } = body;
  
  // Fetch full worker history from DB
  const workerHistory = await fetchWorkerHistory(trabajador_nombres || [], body.department_id);

  const customBlock = aiConfig.instrucciones_custom?.trim() 
    ? `\n\nINSTRUCCIONES ADICIONALES DEL ADMINISTRADOR:\n${aiConfig.instrucciones_custom}` 
    : '';

  const systemPrompt = `Eres un experto en derecho laboral español especializado en régimen disciplinario. Tu trabajo es clasificar incidencias laborales según el convenio colectivo vigente.
${empresaContext}
${CONVENIO_CONTEXT}

INSTRUCCIONES:
- Analiza la descripción de la incidencia y clasifícala según los artículos 49-51 del convenio.
- Determina la gravedad (leve, grave, muy_grave) basándote EXCLUSIVAMENTE en los supuestos del Art. 50.
- Sugiere la sanción apropiada según el Art. 51, respetando los LÍMITES MÁXIMOS.
- Si la categoría del encargado es proporcionada, tenla en cuenta pero prioriza tu análisis legal.
- Si hay historial previo del trabajador, evalúa posible reincidencia según Art. 50.2.o y 50.3.m.
- Calcula un riesgo de reincidencia (0-100) basado en la frecuencia y gravedad del historial.
- Sé conciso pero preciso en el razonamiento legal.
- NUNCA sugieras sanciones que excedan los límites del Art. 51.

RECOMENDACIÓN DE TIPO (AMONESTACIÓN vs SANCIÓN) — REGLA MAESTRA E INNEGOCIABLE:

Esta es la decisión MÁS IMPORTANTE del análisis. Debes aplicar un FILTRADO LEGAL ESTRICTO en este orden exacto:

═══════════════════════════════════════════════════════════════
PASO 1 — ¿El hecho está tipificado en el convenio (Art. 50)?
═══════════════════════════════════════════════════════════════
Lee la descripción de los hechos y compárala una a una con TODOS los supuestos del Art. 50 (leves a/g, graves a/o, muy graves a/n).
- Si el hecho NO encaja en ningún supuesto del Art. 50 → tipo_recomendado = "amonestacion" SIEMPRE.
  (No puedes inventar una falta que el convenio no contempla. Solo cabe el aviso escrito.)
- Si el hecho SÍ encaja en algún supuesto del Art. 50 → tipo_recomendado = "sancion" SIEMPRE, aunque parezca menor o sea la primera vez.
  (Si el convenio lo tipifica como falta leve/grave/muy grave, es SANCIÓN, aunque la sanción concreta sea de 0 días.)

EJEMPLOS DE HECHOS QUE SON SANCIÓN OBLIGATORIA (aunque parezcan leves):
- Llegar tarde sin justificar (Art. 50.1.a → leve) → SANCIÓN leve.
- Faltar 1 día sin justificar (Art. 50.1.b → leve) → SANCIÓN leve.
- Abandonar el puesto sin causa por breves periodos sin riesgo (Art. 50.1.d → leve) → SANCIÓN leve.
- Descuidos en la conservación del material con deterioro leve (Art. 50.1.f → leve) → SANCIÓN leve.
- Embriaguez no habitual (Art. 50.1.g → leve) → SANCIÓN leve.
- Dejar las llaves de un vehículo de la empresa puestas/expuestas (Art. 50.1.f descuido o Art. 50.2.f desobediencia normas seguridad) → SANCIÓN.
- Desobediencia a órdenes/normas de seguridad (Art. 50.2.f → grave) → SANCIÓN grave.
- Uso no autorizado de herramientas/vehículos de la empresa (Art. 50.2.h → grave) → SANCIÓN grave.
- Suplantación en fichajes (Art. 50.2.e → grave) → SANCIÓN grave.
- Hurto, fraude, abuso de confianza (Art. 50.3.c → muy grave) → SANCIÓN muy grave.
- Acoso (Art. 50.3.n → muy grave) → SANCIÓN muy grave.

EJEMPLOS DE HECHOS QUE SOLO PUEDEN SER AMONESTACIÓN (no tipificados):
- Mal carácter o actitud poco colaboradora puntual sin ofensas graves.
- No saludar, mostrarse antipático con compañeros sin llegar a ofensa.
- Errores administrativos puntuales sin perjuicio para la empresa.
- Uso ocasional del móvil personal en horario de trabajo.
- Pequeños despistes operativos que no encajan en "ejecución deficiente con perjuicio".
- Cualquier conducta no profesional que no encaje literalmente en Art. 50.

═══════════════════════════════════════════════════════════════
PASO 2 — Si es SANCIÓN, determina la gravedad EXACTA según Art. 50:
═══════════════════════════════════════════════════════════════
- LEVE: supuestos del Art. 50.1.
- GRAVE: supuestos del Art. 50.2 o reincidencia de 5 leves en un trimestre (Art. 50.2.o).
- MUY GRAVE: supuestos del Art. 50.3 o reincidencia de 2+ graves en un año (Art. 50.3.m).

═══════════════════════════════════════════════════════════════
PASO 3 — Días de suspensión (Art. 51), respetando los rangos:
═══════════════════════════════════════════════════════════════
- Leve: 0-2 días (puede ser solo amonestación verbal/escrita SIN días, pero sigue siendo SANCIÓN leve si está tipificada).
- Grave: 3-14 días (obligatorio al menos 3).
- Muy grave: 14-30 días, traslado o despido.

═══════════════════════════════════════════════════════════════
REGLAS ADICIONALES Y PROHIBICIONES ABSOLUTAS:
═══════════════════════════════════════════════════════════════
- PROHIBIDO clasificar como "amonestacion" un hecho tipificado en Art. 50 (incluso si es leve y primera vez). El convenio obliga a sancionar lo tipificado.
- PROHIBIDO clasificar como "sancion" un hecho que NO encaja en ningún supuesto del Art. 50. Sería ilegal.
- PROHIBIDO suavizar la calificación porque el encargado haya propuesto amonestación: si el convenio lo tipifica, es SANCIÓN (corrige al encargado).
- PROHIBIDO endurecer la calificación porque el encargado haya propuesto sanción: si el convenio NO lo tipifica, solo cabe AMONESTACIÓN (corrige al encargado).
- En tipo_razonamiento DEBES citar el artículo exacto que aplicas (ej. "Art. 50.1.f") o explicar por qué ningún artículo del Art. 50 encaja, justificando la amonestación.

DEFINICIONES OPERATIVAS:
- AMONESTACIÓN: aviso escrito formal SIN gravedad ni suspensión. Solo cabe cuando la conducta NO está tipificada en el Art. 50.
- SANCIÓN: medida disciplinaria CON gravedad (leve/grave/muy_grave). Obligatoria cuando la conducta está tipificada en Art. 50.

Recuerda: la propuesta del encargado es solo orientativa. Tu deber es aplicar el convenio con rigor — corrige al encargado siempre que su propuesta no se ajuste al filtrado legal.

FACTOR AGRAVANTE — PÉRDIDA ECONÓMICA:
Si se proporciona un IMPORTE DE PÉRDIDA ECONÓMICA, úsalo como factor agravante proporcional (NUNCA para convertir un hecho no tipificado en sanción):
- Pérdidas de 0-10€: factor neutro, no agrava por sí solo.
- Pérdidas de 10-30€: factor leve, puede reforzar una clasificación grave si hay otros indicios.
- Pérdidas superiores a 30€: factor significativo, debe considerarse al menos grave.
- Pérdidas superiores a 80€: factor muy significativo, debe considerarse al menos grave, posiblemente muy grave si hay reincidencia.
- Pérdidas superiores a 150€: factor crítico, debe clasificarse como muy grave salvo circunstancias atenuantes claras.
El importe NUNCA es el único criterio — siempre combínalo con la naturaleza de la falta, el historial y el convenio.${customBlock}`;

  const historialStr = historial_detallado && Array.isArray(historial_detallado) && historial_detallado.length > 0
    ? `\nHISTORIAL DETALLADO DEL TRABAJADOR:\n${historial_detallado.map((h: any) => `- ${h.fecha}: ${h.descripcion || 'Sin descripción'} (gravedad categoría: ${h.gravedad || 'desconocida'})`).join('\n')}`
    : '';

  const importeStr = importe && parseFloat(importe) > 0 ? `\nIMPORTE DE PÉRDIDA ECONÓMICA: ${importe}€` : '';

  const userPrompt = `Clasifica la siguiente incidencia laboral:

DESCRIPCIÓN: ${descripcion || 'No proporcionada'}${importeStr}
${categoria_encargado ? `CATEGORÍA ASIGNADA POR ENCARGADO: ${categoria_encargado}` : ''}
${contexto_trabajador ? `CONTEXTO DEL TRABAJADOR: Total incidencias previas: ${contexto_trabajador.historial_incidencias || 0}` : ''}${historialStr}
${workerHistory}
Analiza y clasifica según el convenio. Evalúa el riesgo de reincidencia considerando TODO el historial. Recomienda si procede amonestación o sanción y explica por qué.`;

  const response = await callAI(apiKey, systemPrompt, userPrompt, {
    tools: [{
      type: "function",
      function: {
        name: "clasificar_incidencia",
        description: "Clasifica una incidencia laboral según el convenio colectivo",
        parameters: {
          type: "object",
          properties: {
            gravedad_sugerida: { type: "string", enum: ["leve", "grave", "muy_grave"], description: "Gravedad según Art. 50" },
            confianza: { type: "number", description: "Nivel de confianza 0-1" },
            razonamiento: { type: "string", description: "Explicación legal concisa citando artículos" },
            articulos_relevantes: { type: "array", items: { type: "string" }, description: "Artículos del convenio aplicables (ej: '50.1.a', '51.a')" },
            sancion_sugerida: { type: "string", description: "Tipo de sanción recomendada" },
            dias_suspension_sugeridos: { type: "integer", description: "Días de suspensión sugeridos (0 si no aplica)" },
            riesgo_reincidencia: { type: "integer", description: "Score de riesgo de reincidencia 0-100 basado en historial" },
            tipo_recomendado: { type: "string", enum: ["amonestacion", "sancion"], description: "Recomienda si procede amonestación (aviso escrito) o sanción formal (con gravedad y posible suspensión)" },
            tipo_razonamiento: { type: "string", description: "Explicación de por qué recomiendas amonestación o sanción, considerando historial, reincidencia, convenio y situación concreta" },
            gravedad_recomendada_si_sancion: { type: "string", enum: ["leve", "grave", "muy_grave"], description: "Si recomiendas sanción, qué gravedad específica. Solo aplica si tipo_recomendado es sancion." },
          },
          required: ["gravedad_sugerida", "confianza", "razonamiento", "articulos_relevantes", "sancion_sugerida", "riesgo_reincidencia", "tipo_recomendado", "tipo_razonamiento"],
          additionalProperties: false,
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "clasificar_incidencia" } },
  });

  // Auto-save learning: record classification context
  const nombres = (trabajador_nombres || []).join(', ') || 'Trabajador';
  const firstName = nombres.split(',')[0]?.split(' ')[0] || 'Trabajador';
  autoSavelearning(
    `Clasificación ${firstName}`,
    `${new Date().toLocaleDateString('es-ES')}: Incidencia clasificada. ${descripcion?.substring(0, 150) || ''}. Categoría encargado: ${categoria_encargado || 'no indicada'}.`,
    'clasificacion'
  ).catch(() => {});

  return response;
}

// ── Sanction Draft (Email cercano para RRHH) ──────────────────────────────────────
async function handleBorradorSancion(body: any, apiKey: string, aiConfig: any, empresaContext: string, fetchWorkerHistory: (names: string[], deptId?: string, workerIds?: string[], excludeRecordId?: string) => Promise<string>, autoSavelearning: (t: string, c: string, cat: string) => Promise<void>) {
  const { trabajador_nombre, trabajador_numero, gravedad, sancion, dias_suspension, descripcion_hechos, articulos_referencia, fecha_hechos, departamento, tiene_pruebas, fecha_inicio_sancion, imagen_urls, video_urls, encargado_nombre, num_fotos, num_videos, num_otros_archivos, propuesta_suspension, propuesta_fecha_inicio, worker_ids, exclude_record_id } = body;
  const imageUrls: string[] = Array.isArray(imagen_urls) ? imagen_urls.slice(0, 10) : [];
  const videoUrls: string[] = Array.isArray(video_urls) ? video_urls.slice(0, 3) : [];

  // Fetch full worker history using exact IDs, EXCLUDING current record to prevent self-referencing
  const workerHistory = await fetchWorkerHistory([trabajador_nombre], body.department_id, Array.isArray(worker_ids) ? worker_ids : undefined, exclude_record_id || undefined);

  const hora = new Date().getHours();
  const saludo = hora < 14 ? 'Buenos días' : 'Buenas tardes';

  const tono_config = aiConfig.tono || 'formal';
  const tonoInstruccion = tono_config === 'muy_formal' 
    ? 'Tu tono es FORMAL y profesional, como una comunicación oficial de empresa.'
    : tono_config === 'directo'
    ? 'Tu tono es DIRECTO y breve, sin rodeos. Ve al grano.'
    : 'Tu tono es CERCANO, INFORMAL pero profesional. Como si hablaras con compañeras de trabajo de confianza.';

  const customBlock = aiConfig.instrucciones_custom?.trim() 
    ? `\n\nINSTRUCCIONES ADICIONALES DEL ADMINISTRADOR (PRIORIDAD ALTA):\n${aiConfig.instrucciones_custom}` 
    : '';

  const conSuspensionBlock = (sancion !== 'amonestacion' && propuesta_suspension)
    ? `\n- IMPORTANTE: El encargado ha propuesto esta sanción CON SUSPENSIÓN DE EMPLEO Y SUELDO${propuesta_fecha_inicio ? ` con fecha de inicio propuesta: ${new Date(propuesta_fecha_inicio).toLocaleDateString('es-ES')}` : ''}. Debes proponer un número de días de suspensión PROPORCIONAL a la gravedad, según el Art. 51 del convenio colectivo: Leve: 1-2 días, Grave: 3-13 días, Muy grave: 14-60 días. Menciona explícitamente en el email la suspensión y los días propuestos.`
    : '';

  const sinSuspensionBlock = (sancion !== 'amonestacion' && !propuesta_suspension && (dias_suspension === 0 || dias_suspension === null || dias_suspension === undefined))
    ? `\n- IMPORTANTE: Aunque se propone una sanción con gravedad, el encargado pide que sea SIN suspensión de empleo y sueldo. Debes mencionar esto explícitamente en el email, indicando que se solicita la sanción pero sin aplicar suspensión.`
    : '';

  const encargadoBlock = encargado_nombre
    ? `\n- El encargado que reporta/solicita esta acción es: ${encargado_nombre}. Menciónalo en el email de forma natural (ej: "Según me comenta ${encargado_nombre}..." o "${encargado_nombre} nos informa que...").`
    : '';

  const systemPrompt = `Eres un compañero de trabajo que escribe emails internos al equipo de Recursos Humanos para informarles de incidencias laborales. ${tonoInstruccion}
${empresaContext}
INSTRUCCIONES ESTRICTAS:
- El asunto SIEMPRE debe seguir este formato: Si es amonestación pon "Amonestación - [Nombre] ([Número])", si es sanción pon "Sanción - [Nombre] ([Número])". Si hay VARIOS trabajadores, incluye TODOS con su número: "Amonestación - José Luis (45869), Antonio (38486) y Sufian (34897)". NUNCA pongas solo un nombre si hay varios implicados. El número va directamente entre paréntesis, SIN la palabra "ficha".
- Empieza el cuerpo con "${saludo}," seguido de un salto de línea.
- Explica lo que ha pasado de forma clara y cercana, como si se lo contaras a una compañera.
- Menciona: qué ha ocurrido, quién está implicado (nombre y número), cuándo pasó (día y hora).
- Si hay archivos adjuntos (fotos, vídeos u otros), menciónalo naturalmente usando el tipo correcto. NUNCA digas "fotos" si solo hay vídeos, ni "vídeos" si solo hay fotos. Usa el término exacto según lo que se adjunta (ej: "Os adjunto un vídeo de lo ocurrido", "Os adjunto unas fotos", "Os adjunto fotos y un vídeo").
- Si se indica una fecha de inicio de sanción, menciónala en el cuerpo del email de forma natural (ej: "Proponemos que la sanción empiece el día X").
- NO uses referencias legales, artículos del convenio, ni tecnicismos jurídicos.
- NO uses un tono formal ni burocrático. Nada de "Por la presente", "Se comunica", etc.
- El email debe ser INFORMATIVO, contando lo que ha pasado para que RRHH tenga contexto.
- NO incluyas ningún saludo de despedida al final (ni "Un saludo", ni "Saludos", ni "Atentamente", ni nada similar). El pie del email con la despedida y firma se añade automáticamente.
- REGLA CRÍTICA: NUNCA dejes el email a medias ni lo cortes antes de terminar. El email DEBE estar COMPLETO y ACABADO. Si es largo, sigue escribiendo hasta completar toda la información. Es preferible un email largo y completo que uno corto e incompleto.
- Genera texto plano, pero usa **doble asterisco** para resaltar datos importantes como nombres, números de trabajador, tipo de acción (sanción/amonestación), gravedad, y si se aplica o no suspensión. Ejemplo: **Eduardo Antonio Paz Lopez (48337)**, **sanción leve**, **sin suspensión de empleo y sueldo**.
- REGLA TERMINOLÓGICA ESTRICTA: La amonestación NUNCA tiene gravedad. NUNCA escribas "amonestación leve", "amonestación grave" ni "amonestación muy grave". Eso NO existe legalmente. Solo escribe "amonestación" o "amonestación escrita". La gravedad (leve/grave/muy grave) SOLO aplica a SANCIONES. Si es amonestación, escribe simplemente "Proponemos una **amonestación escrita**".
- Si es una SANCIÓN, debes especificar claramente la gravedad y si conlleva o no suspensión de empleo y sueldo. Ejemplo: "Proponemos una **sanción leve sin suspensión de empleo y sueldo**" o "Proponemos una **sanción grave con 3 días de suspensión de empleo y sueldo**".${conSuspensionBlock}${sinSuspensionBlock}${encargadoBlock}${customBlock}`;

  const suspensionLine = (sancion !== 'amonestacion' && propuesta_suspension)
    ? `SE SOLICITA SANCIÓN CON SUSPENSIÓN DE EMPLEO Y SUELDO: Sí. Propón un número de días proporcional según el convenio (Art. 51). Leve: 1-2, Grave: 3-13, Muy grave: 14-60.${propuesta_fecha_inicio ? ` FECHA INICIO PROPUESTA POR ENCARGADO: ${new Date(propuesta_fecha_inicio).toLocaleDateString('es-ES')}` : ''}`
    : (sancion !== 'amonestacion' && (dias_suspension === 0 || dias_suspension === null || dias_suspension === undefined))
    ? `SE SOLICITA SANCIÓN SIN SUSPENSIÓN DE EMPLEO Y SUELDO: Sí. Aunque se propone sanción, se pide expresamente que NO se aplique suspensión.`
    : (dias_suspension ? `DÍAS SUSPENSIÓN PROPUESTOS: ${dias_suspension}` : '');

  const textoPrincipalEmail = `Escribe un email para RRHH sobre esta incidencia:

TRABAJADOR: ${trabajador_nombre}${trabajador_numero ? ` (${trabajador_numero})` : ''}
${departamento ? `DEPARTAMENTO: ${departamento}` : ''}
${encargado_nombre ? `ENCARGADO QUE REPORTA: ${encargado_nombre}` : ''}
${fecha_hechos ? `FECHA/HORA DE LOS HECHOS: ${fecha_hechos}` : ''}
TIPO: ${sancion === 'amonestacion' ? 'Amonestación escrita (SIN gravedad, la amonestación NO es ni leve ni grave ni muy grave)' : `${gravedad === 'muy_grave' ? 'Falta muy grave' : gravedad === 'grave' ? 'Falta grave' : 'Falta leve'} — Sanción`}
${suspensionLine}
${fecha_inicio_sancion ? `FECHA INICIO DE LA SANCIÓN: ${fecha_inicio_sancion}` : ''}
QUÉ HA PASADO: ${descripcion_hechos}
ARCHIVOS ADJUNTOS: ${(() => {
  const nFotos = num_fotos || 0;
  const nVideos = num_videos || 0;
  const nOtros = num_otros_archivos || 0;
  const total = nFotos + nVideos + nOtros;
  if (total === 0 && !tiene_pruebas && imageUrls.length === 0) return 'No hay archivos adjuntos. NO menciones adjuntos en el email.';
  const parts: string[] = [];
  if (nFotos > 0) parts.push(`${nFotos} foto${nFotos > 1 ? 's' : ''}`);
  if (nVideos > 0) parts.push(`${nVideos} vídeo${nVideos > 1 ? 's' : ''}`);
  if (nOtros > 0) parts.push(`${nOtros} archivo${nOtros > 1 ? 's' : ''}`);
  return `Sí: ${parts.join(', ')}. Menciona EXACTAMENTE estos tipos en el email (ej: "${nVideos > 0 && nFotos === 0 ? 'Os adjunto un vídeo' : nFotos > 0 && nVideos === 0 ? 'Os adjunto unas fotos' : 'Os adjunto fotos y vídeos'} de lo ocurrido"). NUNCA digas "fotos" si solo hay vídeos.`;
})()}
${imageUrls.length > 0 ? `IMÁGENES ANALIZABLES: ${imageUrls.length} imagen(es). Analiza cada imagen y menciona en el email de forma natural qué muestran como evidencia.` : ''}
${workerHistory}
${workerHistory ? 'Si este trabajador tiene historial previo en los datos anteriores, menciónalo brevemente. SOLO menciona incidencias que aparezcan EXPLÍCITAMENTE en el historial proporcionado arriba. NUNCA inventes ni supongas incidencias previas que no estén en los datos.' : 'Este trabajador NO tiene historial previo de incidencias en el sistema. NO menciones incidencias anteriores porque no existen. NUNCA inventes historial.'}`;

  // Build multimodal message if images/videos available
  let emailUserMessage: any;
  const hasMedia = imageUrls.length > 0 || videoUrls.length > 0;
  if (hasMedia) {
    const contentParts: any[] = [{ type: "text", text: textoPrincipalEmail }];
    for (const url of imageUrls) {
      contentParts.push({ type: "image_url", image_url: { url } });
    }
    if (videoUrls.length > 0) {
      contentParts.push({ type: "text", text: `\nVÍDEO(S) ADJUNTO(S) — Analiza visualmente qué se ve en cada vídeo:` });
      for (const vUrl of videoUrls) {
        contentParts.push({ type: "image_url", image_url: { url: vUrl } });
      }
    }
    emailUserMessage = { role: "user", content: contentParts };
  } else {
    emailUserMessage = { role: "user", content: textoPrincipalEmail };
  }

  const response = await callAIWithMessages(apiKey, systemPrompt, emailUserMessage, {
    timeoutMs: hasMedia ? 120000 : 60000,
    model: MODEL,
    max_tokens: 8192,
    tools: [{
      type: "function",
      function: {
        name: "generar_borrador",
        description: "Genera borrador de email cercano para RRHH",
        parameters: {
          type: "object",
          properties: {
            asunto: { type: "string", description: "Asunto: 'Amonestación - Nombre (Número)' o 'Sanción - Nombre (Número)'. Si hay varios trabajadores incluye TODOS: 'Amonestación - José Luis (45869), Antonio (38486) y Sufian (34897)'" },
            cuerpo: { type: "string", description: "Texto plano del email, cercano e informativo. Si hay imágenes, describe qué se ve en ellas de forma integrada en el texto. IMPORTANTE: completa SIEMPRE el email hasta el final con despedida y cierre, NUNCA lo dejes a medias." },
            dias_suspension_propuestos: { type: "integer", description: "Número de días de suspensión propuestos según el convenio y proporcionales a la gravedad. 0 si no se aplica suspensión o es amonestación. Leve: 1-2, Grave: 3-13, Muy grave: 14-60." },
          },
          required: ["asunto", "cuerpo", "dias_suspension_propuestos"],
          additionalProperties: false,
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "generar_borrador" } },
  });

  // Auto-save learning about this worker's behavior pattern
  const firstName = trabajador_nombre?.split(' ')[0] || 'Trabajador';
  autoSavelearning(
    `Comportamiento ${firstName}`,
    `${new Date().toLocaleDateString('es-ES')}: ${gravedad} en ${departamento || 'departamento'}. ${descripcion_hechos?.substring(0, 200) || ''}. Acción: ${sancion}${dias_suspension ? ` (${dias_suspension} días)` : ''}.`,
    'general'
  ).catch(() => {}); // fire-and-forget

  return response;
}

// ── Worker Summary ──────────────────────────────────────
async function handleResumen(body: any, apiKey: string, empresaContext: string) {
  const { trabajador_nombre, incidencias } = body;

  const systemPrompt = `Eres un analista de RRHH. Genera resúmenes concisos del historial disciplinario de trabajadores según el convenio colectivo.
${empresaContext}
${CONVENIO_CONTEXT}`;

  const userPrompt = `Resume el historial disciplinario de ${trabajador_nombre}:

${JSON.stringify(incidencias, null, 2)}

Incluye: patrón de conducta, gravedad acumulada, riesgo de reincidencia según Art. 50.2.o y 50.3.m, y recomendación.`;

  const response = await callAI(apiKey, systemPrompt, userPrompt);
  return response;
}

// ── Convenio Query ──────────────────────────────────────
async function handleConsulta(body: any, apiKey: string, empresaContext: string) {
  const { pregunta } = body;

  const systemPrompt = `Eres un asesor legal especializado en el convenio colectivo de flores y plantas. Responde preguntas basándote EXCLUSIVAMENTE en el texto del convenio proporcionado.
${empresaContext}
${CONVENIO_CONTEXT}

INSTRUCCIONES:
- Responde solo basándote en el convenio proporcionado.
- Cita artículos específicos.
- Si la pregunta no está cubierta por el convenio, indícalo claramente.`;

  const userPrompt = pregunta;

  const response = await callAI(apiKey, systemPrompt, userPrompt);
  return response;
}

// ── Predict Worker Risk ─────────────────────────────────
async function handlePredictWorkerRisk(body: any, apiKey: string, empresaContext: string) {
  const { worker_name, historial, stats } = body;

  const systemPrompt = `Eres un analista predictivo de RRHH especializado en régimen disciplinario laboral español.
${empresaContext}
${CONVENIO_CONTEXT}

INSTRUCCIONES:
- Analiza el historial completo del trabajador.
- Evalúa patrones temporales: frecuencia, escalamiento de gravedad, intervalos entre incidencias.
- Calcula una probabilidad de reincidencia (0-100) basada en datos objetivos.
- Identifica factores de riesgo específicos.
- Recomienda una acción concreta.
- Sé preciso y basado en datos.`;

  const userPrompt = `Analiza el riesgo de reincidencia de ${worker_name || 'trabajador'}:

ESTADÍSTICAS:
${JSON.stringify(stats || {}, null, 2)}

HISTORIAL DE INCIDENCIAS:
${JSON.stringify(historial || [], null, 2)}

Evalúa patrones y predice riesgo.`;

  return await callAI(apiKey, systemPrompt, userPrompt, {
    tools: [{
      type: "function",
      function: {
        name: "predict_risk",
        description: "Predicción de riesgo de reincidencia del trabajador",
        parameters: {
          type: "object",
          properties: {
            probabilidad_reincidencia: { type: "integer", description: "Probabilidad 0-100" },
            razonamiento: { type: "string", description: "Explicación del análisis predictivo" },
            accion_recomendada: { type: "string", enum: ["seguimiento", "amonestacion", "sancion", "formacion"], description: "Acción recomendada" },
            factores_riesgo: { type: "array", items: { type: "string" }, description: "Factores de riesgo detectados" },
          },
          required: ["probabilidad_reincidencia", "razonamiento", "accion_recomendada", "factores_riesgo"],
          additionalProperties: false,
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "predict_risk" } },
  });
}

// ── Department Insights ─────────────────────────────────
async function handleDepartmentInsights(body: any, apiKey: string, empresaContext: string) {
  const { department_name, stats, top_workers } = body;

  const systemPrompt = `Eres un analista de RRHH. Genera insights concisos sobre departamentos basándote en estadísticas de incidencias laborales. Sé directo y actionable.${empresaContext}`;

  const userPrompt = `Genera insights para el departamento "${department_name || 'Sin nombre'}":

ESTADÍSTICAS:
${JSON.stringify(stats || {}, null, 2)}

TOP TRABAJADORES CON RIESGO:
${JSON.stringify(top_workers || [], null, 2)}

Genera un párrafo conciso con tendencias, riesgos y recomendaciones.`;

  return await callAI(apiKey, systemPrompt, userPrompt);
}

// ── Admin Summary ───────────────────────────────────────
async function handleAdminSummary(body: any, apiKey: string, empresaContext: string) {
  const { global_stats, department_stats, top_reincidentes, periodo } = body;

  const systemPrompt = `Eres el director de RRHH de una empresa. Genera resúmenes ejecutivos concisos sobre la situación disciplinaria global. Incluye datos clave, tendencias preocupantes y recomendaciones estratégicas.${empresaContext}`;

  const userPrompt = `Genera un resumen ejecutivo del periodo ${periodo || 'actual'}:

ESTADÍSTICAS GLOBALES:
${JSON.stringify(global_stats || {}, null, 2)}

POR DEPARTAMENTO:
${JSON.stringify(department_stats || [], null, 2)}

TOP REINCIDENTES:
${JSON.stringify(top_reincidentes || [], null, 2)}

Redacta un resumen ejecutivo con datos clave, alertas y 3 recomendaciones estratégicas.`;

  return await callAI(apiKey, systemPrompt, userPrompt);
}

// ── Analyze Patterns ────────────────────────────────────
async function handleAnalyzePatterns(body: any, apiKey: string, empresaContext: string) {
  const { department_name, stats, day_distribution, tendencia, top_workers, daily_metrics } = body;

  const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const distStr = (day_distribution || []).map((v: number, i: number) => `${dayNames[i]}: ${v}`).join(', ');

  const systemPrompt = `Eres un analista predictivo de RRHH especializado en patrones temporales de incidencias laborales. Analiza datos estadísticos y genera predicciones actionables.
${empresaContext}
${CONVENIO_CONTEXT}

INSTRUCCIONES:
- Analiza la distribución por día de la semana para detectar patrones.
- Evalúa la tendencia (subiendo/bajando/estable) y predice la evolución.
- Identifica factores de riesgo temporales (ej: lunes post-festivo, viernes pre-fin de semana).
- Genera alertas proactivas concretas y accionables.
- Sé conciso y basado en datos.`;

  const userPrompt = `Analiza patrones del departamento "${department_name || 'Sin nombre'}":

ESTADÍSTICAS GENERALES:
${JSON.stringify(stats || {}, null, 2)}

DISTRIBUCIÓN POR DÍA DE LA SEMANA:
${distStr}

TENDENCIA ACTUAL: ${tendencia || 'desconocida'}

TOP TRABAJADORES CON RIESGO:
${JSON.stringify(top_workers || [], null, 2)}

MÉTRICAS DIARIAS RECIENTES:
${JSON.stringify((daily_metrics || []).slice(0, 14), null, 2)}

Genera un análisis predictivo con patrones, predicciones y alertas proactivas.`;

  return await callAI(apiKey, systemPrompt, userPrompt, {
    tools: [{
      type: "function",
      function: {
        name: "analyze_patterns",
        description: "Análisis predictivo de patrones de incidencias",
        parameters: {
          type: "object",
          properties: {
            tendencia: { type: "string", enum: ["subiendo", "bajando", "estable"], description: "Tendencia detectada" },
            dia_pico: { type: "string", description: "Día de la semana con más incidencias" },
            patron_detectado: { type: "string", description: "Descripción del patrón temporal detectado" },
            prediccion_proxima_semana: { type: "string", description: "Predicción para la próxima semana" },
            nivel_alerta: { type: "string", enum: ["bajo", "medio", "alto", "critico"], description: "Nivel de alerta general" },
            alertas_proactivas: { type: "array", items: { type: "string" }, description: "Lista de alertas y recomendaciones proactivas" },
            acciones_preventivas: { type: "array", items: { type: "string" }, description: "Acciones preventivas recomendadas" },
            resumen: { type: "string", description: "Resumen ejecutivo de 2-3 frases" },
          },
          required: ["tendencia", "dia_pico", "patron_detectado", "prediccion_proxima_semana", "nivel_alerta", "alertas_proactivas", "acciones_preventivas", "resumen"],
          additionalProperties: false,
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "analyze_patterns" } },
  });
}

// ── Clean Voice Transcription ────────────────────────────
async function handleLimpiarTranscripcion(body: any, apiKey: string, aiConfig: any, empresaContext: string) {
  const { texto_crudo, fecha_actual, hora_actual, trabajadores, categoria, tiene_pruebas, num_pruebas } = body;

  if (!texto_crudo || texto_crudo.trim().length < 3) {
    return new Response(JSON.stringify({ error: "Texto vacío o demasiado corto" }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Build context block — extract first names only
  const contextParts: string[] = [];
  const numWorkers = trabajadores && Array.isArray(trabajadores) ? trabajadores.length : 0;
  const firstNames = numWorkers > 0 
    ? trabajadores.map((n: string) => n.split(' ')[0])
    : [];
  if (numWorkers > 0) {
    contextParts.push(`TRABAJADORES IMPLICADOS (${numWorkers}): ${trabajadores.join(', ')}`);
    contextParts.push(`NOMBRES DE PILA: ${firstNames.join(', ')}`);
  }
  if (categoria) {
    contextParts.push(`CATEGORÍA DE INCIDENCIA SELECCIONADA: ${categoria}`);
  }
  if (tiene_pruebas) {
    contextParts.push(`PRUEBAS ADJUNTAS: ${num_pruebas} archivo(s) (fotos/vídeos)`);
  }
  const extraContext = contextParts.length > 0
    ? `\n\nINFORMACIÓN YA REGISTRADA POR EL ENCARGADO:\n${contextParts.join('\n')}\n` +
      `IMPORTANTE SOBRE NOMBRES: Usa SOLO el nombre de pila (sin apellidos) para referirte a los trabajadores. ` +
      `Si solo hay UN trabajador implicado, cuando el encargado diga "el trabajador", "él", "ella" o similar, sustituye por "${firstNames[0] || 'el trabajador'}". ` +
      `Si hay VARIOS trabajadores, identifica quién hace qué usando solo su nombre de pila.`
    : '';

  const customBlock = aiConfig.instrucciones_custom?.trim() 
    ? `\n\nINSTRUCCIONES ADICIONALES DEL ADMINISTRADOR:\n${aiConfig.instrucciones_custom}` 
    : '';

  const systemPrompt = `Eres un asistente que limpia transcripciones de voz en español para convertirlas en texto profesional de informe laboral.
${empresaContext}
CONTEXTO IMPORTANTE:
El usuario es un ENCARGADO de departamento. Está dictando por voz la descripción de una INCIDENCIA LABORAL ocurrida en su departamento.
Puede tratarse de: faltas de asistencia, impuntualidad, desobediencia, negligencia, daños a material, accidentes, conflictos entre trabajadores, incumplimiento de normas de seguridad, abandonos de puesto, bajo rendimiento, etc.
Los nombres que mencione son de trabajadores reales. Las ubicaciones son zonas de la empresa.

FECHA Y HORA ACTUAL: ${fecha_actual || 'desconocida'} a las ${hora_actual || 'desconocida'}.
Usa esta referencia para interpretar expresiones temporales como "hoy", "ayer", "anteayer", "hace un rato", "hace media hora", "esta mañana", "hace una hora", "el lunes", "la semana pasada", etc. y calcular la fecha y hora exactas.${extraContext}

INSTRUCCIONES ESTRICTAS:
- Elimina TODAS las muletillas y repeticiones.
- Corrige errores gramaticales del reconocimiento de voz.
- Interpreta términos usando el contexto de la empresa (ej: "cámara" = cámara frigorífica, "carros" = carros de transporte de plantas).
- Reformatea como texto descriptivo de informe/nota interna.
- Mantén TODOS los hechos, nombres, lugares, horas y detalles EXACTAMENTE como los dice el encargado.
- REGLA CRÍTICA: NO INVENTES NI AÑADAS NINGUNA INFORMACIÓN que el encargado NO haya dicho. Si algo no se entiende bien, déjalo lo más fiel posible al audio original. Es mejor un texto imperfecto pero fiel que un texto inventado.
- Si el audio es confuso o ininteligible en alguna parte, escribe lo que más se aproxime sin inventar hechos, nombres o detalles.
- NO incluyas fecha/hora ni pruebas en el texto (van en campos separados).
- Escribe en tercera persona y en pasado.
- Usa SOLO el NOMBRE DE PILA del trabajador (sin apellidos). Sustituye "el trabajador", "él", "ella", "el chico", etc. por el nombre de pila.
- EXTRAE fecha y hora si se mencionan (incluyendo expresiones relativas como "ayer", "anteayer", "el martes", etc.).
- PREGUNTA DE ACLARACIÓN: Genera una pregunta SOLO si la descripción es tan vaga que no se entiende qué ocurrió. En la mayoría de los casos, NO generes pregunta.${customBlock}`;
  const userPrompt = `Limpia esta transcripción de voz y extrae la fecha/hora del incidente si se mencionan:\n"${texto_crudo}"`;

  return await callAI(apiKey, systemPrompt, userPrompt, {
    timeoutMs: 25000,
    model: MODEL,
    tools: [{
      type: "function",
      function: {
        name: "texto_limpio",
        description: "Devuelve el texto limpio, opcionalmente la fecha/hora extraídas, y opcionalmente una pregunta de aclaración",
        parameters: {
          type: "object",
          properties: {
            texto: { type: "string", description: "Texto limpio y profesional SIN mencionar fecha/hora del incidente ni pruebas adjuntas. Usa los nombres reales de los trabajadores implicados." },
            fecha_extraida: { type: "string", description: "Fecha del incidente en formato yyyy-MM-dd si se menciona en el audio. null si no se menciona." },
            hora_extraida: { type: "string", description: "Hora del incidente en formato HH:mm si se menciona en el audio. null si no se menciona." },
            pregunta_aclaracion: { type: "string", description: "Pregunta concreta si la descripción es insuficiente. null si la descripción es completa." },
          },
          required: ["texto"],
          additionalProperties: false,
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "texto_limpio" } },
  });
}

// ── Audio Transcription (Gemini Multimodal) ──────────────
async function handleTranscribirAudio(body: any, apiKey: string, aiConfig: any, empresaContext: string) {
  const { audio_base64, mime_type, fecha_actual, hora_actual, trabajadores, categoria, tiene_pruebas, num_pruebas } = body;

  if (!audio_base64) {
    return new Response(JSON.stringify({ error: "No se recibió audio" }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Build context block
  const contextParts: string[] = [];
  const numWorkers = trabajadores && Array.isArray(trabajadores) ? trabajadores.length : 0;
  const firstNames = numWorkers > 0 ? trabajadores.map((n: string) => n.split(' ')[0]) : [];
  if (numWorkers > 0) {
    contextParts.push(`TRABAJADORES IMPLICADOS (${numWorkers}): ${trabajadores.join(', ')}`);
    contextParts.push(`NOMBRES DE PILA: ${firstNames.join(', ')}`);
  }
  if (categoria) contextParts.push(`CATEGORÍA DE INCIDENCIA SELECCIONADA: ${categoria}`);
  if (tiene_pruebas) contextParts.push(`PRUEBAS ADJUNTAS: ${num_pruebas} archivo(s) (fotos/vídeos)`);

  const extraContext = contextParts.length > 0
    ? `\n\nINFORMACIÓN YA REGISTRADA POR EL ENCARGADO:\n${contextParts.join('\n')}\n` +
      `IMPORTANTE SOBRE NOMBRES: Usa SOLO el nombre de pila (sin apellidos). ` +
      `Si solo hay UN trabajador, cuando el encargado diga "el trabajador", "él", "ella" o similar, sustituye por "${firstNames[0] || 'el trabajador'}". ` +
      `Si hay VARIOS trabajadores, identifica quién hace qué usando solo su nombre de pila.`
    : '';

  const customBlock = aiConfig.instrucciones_custom?.trim()
    ? `\n\nINSTRUCCIONES ADICIONALES DEL ADMINISTRADOR:\n${aiConfig.instrucciones_custom}`
    : '';

  const textPrompt = `Escucha este audio de un encargado describiendo una incidencia laboral y REDACTA un texto profesional de informe.${extraContext}
Fecha actual: ${fecha_actual || '?'}, hora: ${hora_actual || '?'}.
INSTRUCCIONES:
- REESCRIBE y MEJORA lo que dice el encargado para que sea un texto claro, profesional y bien redactado de informe interno.
- Corrige gramática, ordena las ideas, elimina muletillas, repeticiones y expresiones coloquiales.
- Reformula frases confusas para que se entiendan perfectamente.
- Mantén TODOS los hechos, nombres, lugares y detalles que menciona, pero exprésalos de forma profesional.
- NO inventes información nueva que el encargado NO haya dicho.
- Tercera persona, pasado. Solo nombre de pila. Extrae fecha/hora si se mencionan.
- Si algo no se entiende: [inaudible]. Audio vacío = texto vacío.${customBlock}`;

  // Use Gemini direct API for multimodal audio
  const audioMime = mime_type || 'audio/webm';
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetchWithRetry(`${GEMINI_DIRECT_API}/${MODEL_LITE}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: textPrompt },
            { inline_data: { mime_type: audioMime, data: audio_base64 } },
          ],
        }],
        generationConfig: {
          maxOutputTokens: 4096,
          temperature: 0.1,
        },
        tools: [{
          function_declarations: [{
            name: "texto_limpio",
            description: "Devuelve el texto transcrito y limpio, opcionalmente la fecha/hora extraídas, y opcionalmente una pregunta de aclaración",
            parameters: {
              type: "object",
              properties: {
                texto: { type: "string", description: "Texto transcrito, limpio y profesional SIN mencionar fecha/hora ni pruebas adjuntas." },
                fecha_extraida: { type: "string", description: "Fecha del incidente en formato yyyy-MM-dd si se menciona. null si no." },
                hora_extraida: { type: "string", description: "Hora del incidente en formato HH:mm si se menciona. null si no." },
                pregunta_aclaracion: { type: "string", description: "Pregunta si la descripción es insuficiente. null si es completa." },
              },
              required: ["texto"],
            },
          }],
        }],
        tool_config: { function_calling_config: { mode: "ANY", allowed_function_names: ["texto_limpio"] } },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      if (res.status === 429) {
        return new Response(JSON.stringify({ error: "rate_limit", message: "Límite de peticiones IA excedido." }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errText = await res.text();
      console.error('Gemini audio transcription error:', res.status, errText);
      return new Response(JSON.stringify({ error: "ai_error", message: "Error transcribiendo audio" }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    
    // Extract function call from Gemini response
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    
    for (const part of parts) {
      if (part.functionCall) {
        const args = part.functionCall.args || {};
        return new Response(JSON.stringify(args), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Fallback: extract text content
    const textContent = parts.map((p: any) => p.text).filter(Boolean).join('');
    return new Response(JSON.stringify({ texto: textContent || '' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === 'AbortError') {
      return new Response(JSON.stringify({ error: "timeout", message: "La transcripción tardó demasiado" }), {
        status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    throw err;
  }
}

// ── NSPP Email Draft ─────────────────────────────────────
async function handleBorradorNSPP(body: any, apiKey: string, aiConfig: any, empresaContext: string, autoSavelearning: (t: string, c: string, cat: string) => Promise<void>) {
  const { trabajador_nombre, trabajador_numero, departamento, start_contract_date, days_remaining, justificacion, encargado_nombre, imagen_urls } = body;
  const imageUrls: string[] = Array.isArray(imagen_urls) ? imagen_urls.slice(0, 10) : [];

  const hora = new Date().getHours();
  const saludo = hora < 14 ? 'Buenos días' : 'Buenas tardes';
  const tono_config = aiConfig.tono || 'formal';
  const tonoInstruccion = tono_config === 'muy_formal'
    ? 'Tu tono es FORMAL y profesional, como una comunicación oficial de empresa.'
    : tono_config === 'directo'
    ? 'Tu tono es DIRECTO y breve, sin rodeos.'
    : 'Tu tono es CERCANO, INFORMAL pero profesional. Como si hablaras con compañeras de trabajo de confianza.';

  const customBlock = aiConfig.instrucciones_custom?.trim()
    ? `\n\nINSTRUCCIONES ADICIONALES DEL ADMINISTRADOR:\n${aiConfig.instrucciones_custom}`
    : '';

  const fechaContrato = start_contract_date ? new Date(start_contract_date).toLocaleDateString('es-ES') : null;
  const diasDesdeContrato = days_remaining != null ? (30 - days_remaining) : null;

  const systemPrompt = `Eres un compañero de trabajo que escribe emails internos al equipo de Recursos Humanos para informarles de que un trabajador no supera el periodo de prueba (NSPP). ${tonoInstruccion}
${empresaContext}
INSTRUCCIONES ESTRICTAS:
- El asunto SIEMPRE debe seguir este formato: "NSPP - [Nombre] ([Número de ficha si existe])"
- Empieza el cuerpo con "${saludo}," seguido de un salto de línea.
- Explica que el encargado considera que el trabajador no ha superado el periodo de prueba.
- Incluye los motivos justificados por el encargado.
- Menciona la fecha de inicio del contrato si está disponible y los días transcurridos.
- IMPORTANTE: Según el Art. 14.2 ET, la extinción durante el periodo de prueba no requiere preaviso ni indemnización.
- Sé claro, directo y profesional.
- NO incluyas ningún saludo de despedida al final (ni "Un saludo", ni "Saludos", etc.). El pie se añade automáticamente.
- Genera SOLO texto plano, sin HTML.${customBlock}`;

  const textoPrincipal = `Escribe un email para RRHH sobre la no superación del periodo de prueba de este trabajador:

TRABAJADOR: ${trabajador_nombre}${trabajador_numero ? ` (${trabajador_numero})` : ''}
${departamento ? `DEPARTAMENTO: ${departamento}` : ''}
${fechaContrato ? `FECHA INICIO CONTRATO: ${fechaContrato}` : ''}
${diasDesdeContrato != null ? `DÍAS TRANSCURRIDOS EN EL PERIODO DE PRUEBA: ${diasDesdeContrato} de 30` : ''}
${days_remaining != null ? `DÍAS RESTANTES DEL PERIODO DE PRUEBA: ${days_remaining}` : ''}
${encargado_nombre ? `ENCARGADO QUE COMUNICA: ${encargado_nombre}` : ''}

MOTIVOS DE NO SUPERACIÓN (según el encargado):
${justificacion}
${imageUrls.length > 0 ? `\nHAY ${imageUrls.length} IMAGEN(ES) ADJUNTA(S) como documentación. Menciónala de forma natural.` : ''}

Redacta el email informando a RRHH de esta situación, explicando los motivos aportados por el encargado.`;

  let emailUserMessage: any;
  if (imageUrls.length > 0) {
    const contentParts: any[] = [{ type: "text", text: textoPrincipal }];
    for (const url of imageUrls) {
      contentParts.push({ type: "image_url", image_url: { url } });
    }
    emailUserMessage = { role: "user", content: contentParts };
  } else {
    emailUserMessage = { role: "user", content: textoPrincipal };
  }

  const response = await callAIWithMessages(apiKey, systemPrompt, emailUserMessage, {
    timeoutMs: imageUrls.length > 0 ? 120000 : 60000,
    max_tokens: 8192,
    tools: [{
      type: "function",
      function: {
        name: "generar_borrador_nspp",
        description: "Genera borrador de email NSPP para RRHH",
        parameters: {
          type: "object",
          properties: {
            asunto: { type: "string", description: "Asunto: 'NSPP - Nombre (Número)'" },
            cuerpo: { type: "string", description: "Texto plano del email, cercano e informativo sobre la no superación del periodo de prueba." },
          },
          required: ["asunto", "cuerpo"],
          additionalProperties: false,
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "generar_borrador_nspp" } },
  });

  // Auto-save learning: record NSPP event
  const firstName = trabajador_nombre?.split(' ')[0] || 'Trabajador';
  autoSavelearning(
    `NSPP ${firstName}`,
    `${new Date().toLocaleDateString('es-ES')}: No superación periodo de prueba en ${departamento || 'departamento'}. Motivos: ${justificacion?.substring(0, 200) || 'no especificados'}. Días restantes: ${days_remaining ?? 'N/A'}.`,
    'nspp'
  ).catch(() => {});

  return response;
}

// ── NSPP Formal Document ─────────────────────────────────
async function handleGenerateNSPPDocument(body: any, apiKey: string, empresaContext: string) {
  const { worker_name, worker_number, worker_fiscal_id, department_name, start_contract_date, days_remaining, justificacion, encargado_nombre, imagen_urls } = body;
  const imageUrls: string[] = Array.isArray(imagen_urls) ? imagen_urls.slice(0, 10) : [];

  const fechaContrato = start_contract_date ? new Date(start_contract_date).toLocaleDateString('es-ES') : null;
  const diasTranscurridos = days_remaining != null ? (30 - days_remaining) : null;

  const systemPrompt = `Eres un abogado laboralista español experto en derecho laboral. Redactas comunicaciones formales de extinción del contrato durante el periodo de prueba según el Art. 14.2 del Estatuto de los Trabajadores.
${empresaContext}

MARCO LEGAL APLICABLE:
- Art. 14.1 ET: El periodo de prueba puede pactarse por escrito en el contrato de trabajo.
- Art. 14.2 ET: Durante el período de prueba, cualquiera de las partes podrá desistir de la relación laboral, SIN NECESIDAD DE PREAVISO y SIN DERECHO A INDEMNIZACIÓN ALGUNA, salvo pacto en contrario.
- Real Decreto Legislativo 2/2015, de 23 de octubre (Texto Refundido ET).
- La extinción durante el periodo de prueba NO es un despido disciplinario: no requiere causa justificada, preaviso ni indemnización.

INSTRUCCIONES ESTRICTAS:
- Redacta en tercera persona, tono extremadamente formal y jurídico.
- Fundamenta en el Art. 14.2 ET exclusivamente (no convenio colectivo de faltas disciplinarias).
- Deja claro que no hay derecho a indemnización por despido ni preaviso.
- Menciona los derechos del trabajador: liquidación de haberes devengados y partes proporcionales (vacaciones, pagas extras).
- El documento debe ser jurídicamente impecable.
- NO inventes hechos. Usa la justificación proporcionada por el encargado.`;

  const textoPrincipal = `Genera el texto de la comunicación formal de extinción del contrato durante el periodo de prueba con estos datos:

TRABAJADOR: ${worker_name}${worker_number ? ` (Ficha: ${worker_number})` : ''}${worker_fiscal_id ? ` — DNI/NIE: ${worker_fiscal_id}` : ''}
DEPARTAMENTO: ${department_name}
${fechaContrato ? `FECHA INICIO CONTRATO: ${fechaContrato}` : ''}
${diasTranscurridos != null ? `DÍAS TRANSCURRIDOS: ${diasTranscurridos} de 30` : ''}
${days_remaining != null ? `DÍAS RESTANTES DEL PERIODO DE PRUEBA: ${days_remaining}` : ''}
${encargado_nombre ? `COMUNICADO POR EL ENCARGADO: ${encargado_nombre}` : ''}

MOTIVOS COMUNICADOS POR EL ENCARGADO:
${justificacion}
${imageUrls.length > 0 ? `\nSe adjuntan ${imageUrls.length} imagen(es) de documentación aportada por el encargado.` : ''}

Redacta el documento completo.`;

  let userMessage: any;
  if (imageUrls.length > 0) {
    const contentParts: any[] = [{ type: "text", text: textoPrincipal }];
    for (const url of imageUrls) {
      contentParts.push({ type: "image_url", image_url: { url } });
    }
    userMessage = { role: "user", content: contentParts };
  } else {
    userMessage = { role: "user", content: textoPrincipal };
  }

  return await callAIWithMessages(apiKey, systemPrompt, userMessage, {
    tools: [{
      type: "function",
      function: {
        name: "generar_documento_nspp",
        description: "Genera documento formal de extinción en periodo de prueba",
        parameters: {
          type: "object",
          properties: {
            objeto: { type: "string", description: "Objeto formal de la comunicación" },
            fundamentacion_juridica: { type: "string", description: "Fundamentación en Art. 14.2 ET" },
            exposicion_hechos: { type: "string", description: "Valoración formal de los motivos de no superación" },
            efectos: { type: "string", description: "Efectos jurídicos de la extinción: liquidación de haberes, etc." },
          },
          required: ["objeto", "fundamentacion_juridica", "exposicion_hechos", "efectos"],
          additionalProperties: false,
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "generar_documento_nspp" } },
  });
}

// ── Legal Document Generation ───────────────────────────
async function handleGenerateLegalDocument(body: any, apiKey: string, empresaContext: string) {
  const { worker_name, worker_number, worker_fiscal_id, department_name, gravedad, tipo, descripcion_hechos, fecha_hechos, suspension_dias, fecha_inicio, sin_suspension_explicita, ai_motivo_legal, ai_articulos, categoria, imagen_urls, imagen_metadata, ai_modification, ai_analysis } = body;
  
  // Build multimodal image parts for Gemini if images are provided
  const imageUrls: string[] = Array.isArray(imagen_urls) ? imagen_urls.slice(0, 16) : [];
  const imageMeta: Array<{ source?: string; timestamp_s?: number; video_name?: string; description?: string }> = Array.isArray(imagen_metadata) ? imagen_metadata.slice(0, 16) : [];

  // Helper to format MM:SS
  const fmtTs = (s: number) => {
    const mm = Math.floor((s || 0) / 60).toString().padStart(2, '0');
    const ss = Math.floor((s || 0) % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  };

  // Build per-image metadata block describing source (photo vs video frame).
  // Captions for video frames MUST follow this exact, deterministic format so
  // they stay consistent between regenerations:
  //   <strong>[nombre_video] · MM:SS</strong> — frase factual breve (max 18 palabras)
  const imageMetadataBlock = imageMeta.length > 0
    ? `\n\nMETADATA POR ÍNDICE DE IMAGEN (úsala para componer las leyendas en imagenes_evidencia[].descripcion):\n` +
      imageMeta.map((m, i) => {
        if (m?.source === 'video') {
          const ts = fmtTs(Number(m.timestamp_s) || 0);
          const vname = (m.video_name || 'video').replace(/[<>"]/g, '');
          return `  [${i}] FRAME REAL del vídeo "${vname}" capturado en el segundo ${ts}. Descripción factual del frame (análisis IA): "${m.description || ''}".\n     REGLA ESTRICTA DE LEYENDA — la descripcion DEBE seguir EXACTAMENTE este formato sin variaciones: "<strong>${vname} · ${ts}</strong> — <frase factual breve, máx 18 palabras, en presente, sin opiniones ni adjetivos valorativos>". NO añadas comillas extra, NO repitas el timestamp dentro de la frase, NO uses "se observa", "puede verse" ni adjetivos como "claramente". Termina con punto. Esta leyenda debe ser idéntica si se regenera el documento.`;
        }
        return `  [${i}] FOTOGRAFÍA original aportada como prueba.`;
      }).join('\n')
    : '';

  // Load training reference documents
  let trainingBlock = '';
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, supabaseKey);
    const { data: trainingDocs } = await sb
      .from('incidencias_training_documents')
      .select('extracted_text, document_type')
      .eq('active', true)
      .limit(10);
    if (trainingDocs && trainingDocs.length > 0) {
      const examples = trainingDocs
        .filter(d => d.extracted_text?.trim())
        .map((d, i) => `--- EJEMPLO ${i + 1} (${d.document_type}) ---\n${d.extracted_text}`)
        .join('\n\n');
      if (examples) {
        trainingBlock = `\n\nDOCUMENTOS DE REFERENCIA DE RRHH (EJEMPLOS REALES):
Los siguientes documentos fueron redactados por el equipo de RRHH de la empresa.
IMITA su estilo, tono, estructura jurídica y nivel de detalle. Son tu modelo a seguir:\n\n${examples}\n`;
      }
    }
  } catch (e) {
    console.warn('Could not load training docs:', e);
  }

  // ── Detect repeated-tardiness ("impuntualidad") cases ──────────────
  const categoriaStr = String(categoria || '').toLowerCase();
  const customCatStr = String(body?.custom_category_name || '').toLowerCase();
  const descStr = String(descripcion_hechos || '');
  const tardinessKeywords = /(impuntual|retraso|tardanz|llegad[ao]s?\s+tarde)/i;
  const tardinessLineRegex = /(?:entrada|prevista)\s*\d{1,2}[:.]\d{2}[\s\S]{0,40}?llegada\s*\d{1,2}[:.]\d{2}/gi;
  const tardinessMatches = descStr.match(tardinessLineRegex) || [];
  const isImpuntualidadCase =
    tardinessKeywords.test(categoriaStr) ||
    tardinessKeywords.test(customCatStr) ||
    tardinessMatches.length >= 3;

  const impuntualidadInstruccion = isImpuntualidadCase
    ? `\n\n━━━ MODO IMPUNTUALIDAD REITERADA (OBLIGATORIO) ━━━
Esta propuesta es de impuntualidad / retrasos reiterativos. Aplica TODAS estas reglas SIN EXCEPCIÓN:

A) PARSEO DE LA DESCRIPCIÓN:
   Extrae de la "DESCRIPCIÓN DE LOS HECHOS" CADA línea con patrón "<fecha> entrada <HH:MM> hora de llegada <HH:MM>". Calcula los minutos de retraso (llegada − entrada) para cada una.

B) "exposicion_hechos" (estructura obligatoria, 3 bloques):
   1. Primer párrafo jurídico breve (≈60-90 palabras, tercera persona, tono formal) abriendo con la fecha del retraso más reciente y, en <strong>, el periodo total cubierto. Indica que el trabajador ha incurrido de forma sistemática en impuntualidad.
   2. A continuación, INCLUYE OBLIGATORIAMENTE un listado completo en HTML <ul><li>...</li></ul> con TODOS los retrasos detectados, uno por línea, con este formato exacto:
      <li><strong>20 abril 2026</strong> — entrada prevista 8:00, llegada 8:04 (+4 min)</li>
      NO omitas ningún día, aunque sean 18 o 25 entradas. NO los resumas. El listado completo es prueba documental.
   3. Tercer y último párrafo de cierre (≈40-60 palabras) con esta plantilla rellenada con datos reales:
      "En el periodo comprendido entre el <strong>{fecha_más_antigua}</strong> y el <strong>{fecha_más_reciente}</strong> ({días naturales} días naturales) se han contabilizado <strong>{N}</strong> retrasos por un total acumulado de <strong>{M} minutos</strong>, conducta encuadrable en el Art. 50 del XVIII Convenio Colectivo Estatal para las Empresas del Comercio de Flores y Plantas."

C) "calificacion_falta":
   Cita LITERALMENTE entre <em>"…"</em> el supuesto exacto del Art. 50 que aplica según el conteo:
     · Art. 50.1.a (LEVE): <em>"La impuntualidad no justificada en la entrada o en la salida del trabajo hasta tres ocasiones en un mes por un tiempo total inferior a veinte minutos."</em>
     · Art. 50.2.a (GRAVE): <em>"La impuntualidad no justificada en la entrada o en la salida del trabajo hasta en tres ocasiones en un mes por un tiempo total de hasta sesenta minutos."</em>
     · Art. 50.3.a (MUY GRAVE): <em>"La impuntualidad no justificada en la entrada o en la salida del trabajo en diez ocasiones durante seis meses o en veinte durante un año debidamente advertida."</em>
   Razona expresamente por qué los N retrasos / M minutos en ese periodo encajan en el supuesto elegido.
   OBLIGATORIO incluir, en el último párrafo de "calificacion_falta", una frase con el TOTAL de días con retraso y el TOTAL de minutos acumulados con este formato exacto:
     "En el periodo analizado se han constatado <strong>{N} días con entrada tardía</strong> y un total acumulado de <strong>{M} minutos de retraso</strong>."
   Esta frase es imprescindible. Sin ella el documento se considera incompleto.

D) IMÁGENES (capturas de fichajes semanales):
   Cada imagen aportada es una semana COMPLETA de fichajes (lunes a domingo). En "imagenes_evidencia[].descripcion" devuelve OBLIGATORIAMENTE este formato exacto (línea de título + guion largo + subtítulo en una sola cadena):
     "<strong>Semana del {DD de MMMM} al {DD de MMMM de YYYY}</strong> — Registro horario aportado como prueba documental · {N} retrasos detectados · {M} minutos acumulados."
   Reglas estrictas:
     · La primera palabra del subtítulo (después del guion largo) DEBE empezar SIEMPRE en mayúscula: "Registro horario...".
     · Detecta visualmente el rango exacto de fechas que aparece en la cabecera de cada captura (lunes a domingo). NO inventes fechas.
     · Cuenta solo los días con retraso visible en esa semana.
   Marca SIEMPRE "layout_recomendado" = "fila_grande" para CADA imagen de impuntualidad (deben verse grandes, una por fila, encajadas en el marco).
   Marca "seccion_recomendada" = "exposicion_hechos" para todas.

E) NO inventes minutos ni fechas. Si la descripción no contiene los datos, dilo expresamente.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    : '';

  const imagenInstruccion = imageUrls.length > 0
    ? `\n- Se adjuntan ${imageUrls.length} imagen(es) como pruebas del incidente. Para CADA imagen, DECIDE si es relevante para el documento legal. Devuelve en "imagenes_evidencia" un array con el campo "incluir_imagen" (boolean) indicando si debe incluirse. Solo incluye imágenes que aporten valor probatorio real. Imágenes borrosas, irrelevantes o repetitivas deben marcarse con incluir_imagen=false.${imageUrls.length >= 2 && !isImpuntualidadCase ? `\n- IMPORTANTE (múltiples imágenes): Cuando hay 2 o más capturas, trátalas como EVENTOS INDIVIDUALES. En cada "imagenes_evidencia[].descripcion" comienza OBLIGATORIAMENTE con un título corto envuelto en <strong>...</strong> que contenga el día y la hora detectados visualmente en la captura (ej: "<strong>20 abril 2026 — entrada 8:00 / llegada 8:04</strong>"), seguido de UNA frase contextual breve. NO incluyas listas (<ul>/<li>) dentro de exposicion_hechos repitiendo cada caso uno por uno: el texto debe RESUMIR el patrón global ("Se han registrado ${imageUrls.length} retrasos durante el último mes...") y delegar el detalle individual al pie de cada imagen.` : ''}`
    : '';

  // Build modification context block if AI proposed changes
  let modificationBlock = '';
  if (ai_modification && (ai_modification.tipo_ia || ai_modification.gravedad_ia)) {
    modificationBlock = `\n\nMODIFICACIÓN AUTOMÁTICA APLICADA POR LA IA:
La IA analizó la propuesta del encargado y determinó que no se ajustaba al convenio colectivo. Se aplicaron los siguientes cambios automáticos:
- Tipo original del encargado: ${ai_modification.tipo_original_encargado || 'N/A'}
- Tipo aplicado por IA: ${ai_modification.tipo_ia || 'N/A'}
${ai_modification.gravedad_original_encargado ? `- Gravedad original del encargado: ${ai_modification.gravedad_original_encargado}` : ''}
${ai_modification.gravedad_ia ? `- Gravedad aplicada por IA: ${ai_modification.gravedad_ia}` : ''}
${ai_modification.dias_suspension_ia ? `- Días de suspensión propuestos por IA: ${ai_modification.dias_suspension_ia}` : ''}
DEBES mencionar esta modificación en el documento, explicando por qué se ha aplicado un tipo/gravedad diferente al propuesto por el encargado, citando los artículos del convenio que lo justifican.\n`;
  }

  // Calculate alegaciones deadline (20 business days from today for grave/muy_grave, 15 for leve)
  const today = new Date();
  const plazoAlegacionesDias = gravedad === 'muy_grave' ? 20 : gravedad === 'grave' ? 20 : 15;
  const fechaLimiteAlegaciones = new Date(today);
  let businessDaysAdded = 0;
  while (businessDaysAdded < plazoAlegacionesDias) {
    fechaLimiteAlegaciones.setDate(fechaLimiteAlegaciones.getDate() + 1);
    const dow = fechaLimiteAlegaciones.getDay();
    if (dow !== 0 && dow !== 6) businessDaysAdded++;
  }
  const fechaLimiteStr = fechaLimiteAlegaciones.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

  // Map "moderada" to "leve" for legal purposes
  const gravedadLegal = gravedad === 'moderada' ? 'leve' : gravedad;

  // Suspension days validation
  const LIMITES: Record<string, {min: number; max: number}> = {
    leve: { min: 0, max: 2 },
    grave: { min: 3, max: 14 },
    muy_grave: { min: 14, max: 30 },
  };
  const limite = LIMITES[gravedadLegal] || LIMITES.leve;
  let validacionSuspension = '';
  if (suspension_dias && (suspension_dias < limite.min || suspension_dias > limite.max)) {
    validacionSuspension = `\n⚠️ ATENCIÓN: Los ${suspension_dias} días de suspensión solicitados están FUERA de los límites legales para falta ${gravedadLegal} (${limite.min}–${limite.max} días según Art. 51). DEBES ajustar a los límites legales y advertirlo en el documento.`;
  }

  // Type validation
  let validacionTipo = '';
  if (tipo === 'amonestacion' && gravedadLegal !== 'leve') {
    validacionTipo = `\n⚠️ ATENCIÓN: Se solicita "amonestación" pero la gravedad es "${gravedadLegal}". Según el convenio, la amonestación (verbal o escrita) SOLO aplica a faltas leves (Art. 51.a). Para faltas graves y muy graves se aplica suspensión de empleo y sueldo. Ajusta el documento en consecuencia.`;
  }

  // Clemency / atenuación empresarial: sanción tipificada SIN aplicar suspensión
  let clemenciaBlock = '';
  const esSancionSinSuspension = tipo === 'sancion'
    && (gravedadLegal === 'grave' || gravedadLegal === 'muy_grave')
    && (sin_suspension_explicita === true || !suspension_dias || suspension_dias === 0);
  if (esSancionSinSuspension) {
    clemenciaBlock = `\n\n⚖️ CASO ESPECIAL — SANCIÓN SIN SUSPENSIÓN (atenuación empresarial ex Art. 58 ET):
INSTRUCCIONES OBLIGATORIAS:
- En "medida_disciplinaria" sé BREVE y DIRECTO (máx. 2-3 frases). Indica únicamente que la empresa impone sanción formal por falta ${gravedadLegal === 'muy_grave' ? 'muy grave' : 'grave'} pero <strong>no aplica la suspensión de empleo y sueldo</strong>, y que esta atenuación <strong>no constituye precedente</strong>. PROHIBIDO mencionar el rango de días de suspensión que correspondería (NO digas "${limite.min}–${limite.max} días"), ni explicar la doctrina jurisprudencial, ni extenderte en la facultad de moderación.
- En "calificacion_falta" mantén la calificación de falta ${gravedadLegal === 'muy_grave' ? 'muy grave' : 'grave'}.
- Devuelve dias_suspension_final=0 y NO menciones fechas de suspensión.
- USO DE <strong>: en "medida_disciplinaria" envuelve en <strong>...</strong> las expresiones clave: "no aplicar la suspensión de empleo y sueldo" (o equivalente) y "no constituye precedente". Solo esas. No abuses del semibold.`;
  }

  const cancelacionMeses = gravedadLegal === 'leve' ? 2 : gravedadLegal === 'grave' ? 4 : 8;
  const prescripcionDias = gravedadLegal === 'leve' ? 10 : gravedadLegal === 'grave' ? 20 : 60;

  // Build AI analysis context block if available
  let aiAnalysisBlock = '';
  if (ai_analysis && typeof ai_analysis === 'object') {
    const knownKeys = ['resumen_ejecutivo','analisis_detallado','fundamentacion_legal','recomendacion','antecedentes_trabajador','riesgo_legal','gravedad_recomendada','tipo_recomendado','circunstancias_agravantes','circunstancias_atenuantes','articulos_aplicables'];
    const parts: string[] = [];
    if (ai_analysis.resumen_ejecutivo) parts.push(`RESUMEN EJECUTIVO: ${ai_analysis.resumen_ejecutivo}`);
    if (ai_analysis.analisis_detallado) parts.push(`ANÁLISIS DETALLADO: ${ai_analysis.analisis_detallado}`);
    if (ai_analysis.fundamentacion_legal) parts.push(`FUNDAMENTACIÓN LEGAL (del análisis): ${ai_analysis.fundamentacion_legal}`);
    if (ai_analysis.recomendacion) parts.push(`RECOMENDACIÓN IA: ${ai_analysis.recomendacion}`);
    if (ai_analysis.antecedentes_trabajador) parts.push(`ANTECEDENTES DEL TRABAJADOR: ${ai_analysis.antecedentes_trabajador}`);
    if (ai_analysis.riesgo_legal) parts.push(`RIESGO LEGAL IDENTIFICADO: ${ai_analysis.riesgo_legal}`);
    if (ai_analysis.articulos_aplicables && Array.isArray(ai_analysis.articulos_aplicables)) parts.push(`ARTÍCULOS APLICABLES (análisis): ${ai_analysis.articulos_aplicables.join(', ')}`);
    if (ai_analysis.gravedad_recomendada) parts.push(`GRAVEDAD RECOMENDADA POR ANÁLISIS: ${ai_analysis.gravedad_recomendada}`);
    if (ai_analysis.tipo_recomendado) parts.push(`TIPO RECOMENDADO POR ANÁLISIS: ${ai_analysis.tipo_recomendado}`);
    if (ai_analysis.circunstancias_agravantes) parts.push(`CIRCUNSTANCIAS AGRAVANTES: ${ai_analysis.circunstancias_agravantes}`);
    if (ai_analysis.circunstancias_atenuantes) parts.push(`CIRCUNSTANCIAS ATENUANTES: ${ai_analysis.circunstancias_atenuantes}`);
    for (const [key, val] of Object.entries(ai_analysis)) {
      if (typeof val === 'string' && val.trim() && !knownKeys.includes(key)) {
        parts.push(`${key.toUpperCase().replace(/_/g, ' ')}: ${val}`);
      }
    }
    if (parts.length > 0) {
      aiAnalysisBlock = `\n\nANÁLISIS PREVIO INTERNO DE LA IA (SOLO contexto de fondo, NUNCA contenido oficial):\n${parts.join('\n')}\n\n⚠️ REGLA ABSOLUTA DE COHERENCIA: el análisis previo puede contener recomendaciones antiguas (por ejemplo "elevar de leve a grave", "procede sanción", etc.) que YA NO SON VÁLIDAS. La DECISIÓN FINAL ADMINISTRATIVA del documento es SIEMPRE la indicada en los campos TIPO, FALTA y SUSPENSIÓN del bloque de datos del documento (más abajo). El documento NO PUEDE contradecir esa decisión final bajo ningún concepto. NO copies frases del análisis previo que hablen de otra gravedad u otro tipo distinto al final. Apóyate en el análisis para entender el contexto fáctico y los artículos aplicables, pero redacta SIEMPRE en coherencia con la decisión final.\n`;
    }
  }

  const systemPrompt = `Eres un abogado laboralista español experto en derecho disciplinario. Redactas documentos formales de amonestación y sanción para empresas.

${CONVENIO_CONTEXT}
${empresaContext}
${trainingBlock}

REGLAS ESTRICTAS SEGÚN GRAVEDAD (Art. 51 del Convenio):

A) FALTA LEVE → AMONESTACIÓN ESCRITA:
   - Sanciones permitidas: amonestación verbal, amonestación escrita, o suspensión de empleo y sueldo de HASTA 2 días.
   - Prescripción: 10 días desde conocimiento por la empresa.
   - Cancelación de anotaciones: 2 meses.
   - Estructura del documento: comunicación formal de amonestación, sin suspensión salvo que se indique expresamente.

B) FALTA GRAVE → SANCIÓN CON SUSPENSIÓN:
   - Sanción: suspensión de empleo y sueldo de 3 a 14 días. NO procede amonestación simple.
   - Prescripción: 20 días desde conocimiento por la empresa.
   - Cancelación de anotaciones: 4 meses.
   - El documento DEBE especificar los días exactos de suspensión y las fechas de inicio y fin.

C) FALTA MUY GRAVE → SANCIÓN SEVERA:
   - Sanciones: suspensión de empleo y sueldo de 14 días a 1 mes, traslado a otro centro (hasta 1 año), o despido disciplinario.
   - Prescripción: 60 días desde conocimiento por la empresa.
   - Cancelación de anotaciones: 8 meses.
   - El documento DEBE ser extremadamente riguroso en la fundamentación jurídica.

DATOS CALCULADOS PARA ESTE DOCUMENTO:
- Gravedad legal aplicable: ${gravedadLegal}
- Plazo de prescripción: ${prescripcionDias} días (Art. 60.2 ET)
- Cancelación de anotaciones: ${cancelacionMeses} meses (Art. 51 Convenio)
- Fecha límite de alegaciones calculada: ${fechaLimiteStr}
- Prescripción absoluta: 6 meses desde la comisión de los hechos (Art. 60.2 ET)
${validacionSuspension}${validacionTipo}${clemenciaBlock}
${aiAnalysisBlock}

INSTRUCCIONES ESTRICTAS PARA LA REDACCIÓN:
- ⚠️ FUENTE ÚNICA DE VERDAD: el TIPO (${tipo}) y la GRAVEDAD (${gravedadLegal}) indicados arriba son la DECISIÓN FINAL ADMINISTRATIVA. Todas las secciones (exposicion_hechos, fundamentacion_juridica, calificacion_falta, medida_disciplinaria, articulos_citados) deben ser COHERENTES con esos dos valores. Devuelve OBLIGATORIAMENTE tipo_final="${tipo}", gravedad_final="${gravedadLegal}" y dias_suspension_final coherente con esa gravedad. NO redactes nada que contradiga esa decisión: si el tipo es "amonestacion" NO uses "sanción" ni hables de "suspensión de empleo y sueldo"; si la gravedad es "leve" NO califiques los hechos como graves o muy graves ni sugieras elevar la falta. Si el análisis previo decía otra cosa, IGNÓRALO en este punto.
- ⚠️⚠️ REGLA ABSOLUTA DE CONFIDENCIALIDAD INTERNA (PROHIBIDO INFRINGIR — APLICA SIEMPRE, EN TODAS LAS SECCIONES SIN EXCEPCIÓN):
  El documento se entrega AL TRABAJADOR. El trabajador NUNCA debe conocer información interna, administrativa ni deliberativa de la empresa. PROHIBIDO TERMINANTEMENTE en TODAS las secciones (exposicion_hechos, fundamentacion_juridica, calificacion_falta, medida_disciplinaria, etc.):
    · Mencionar, comparar, justificar o aludir a cualquier "propuesta inicial", "propuesta del encargado", "recomendación previa", "valoración previa", "análisis interno", "decisión inicial" o similar. La medida final se presenta como ÚNICA decisión de la empresa, sin contraste con nada anterior.
    · Frases PROHIBIDAS (ejemplos no exhaustivos): "difiere de la propuesta inicial de amonestación", "se ha decidido elevar/reducir respecto a…", "a pesar de la propuesta inicial de…", "habiéndose determinado finalmente…", "tras valorar la recomendación de…", "el encargado propuso…", "inicialmente se planteó…", "en lugar de la amonestación inicialmente propuesta…", "modificando la valoración previa…".
    · Justificar la elección de la medida diciendo que se ha cambiado, agravado o atenuado respecto a otra medida previa. La medida se justifica SOLO por los hechos y los artículos del convenio, NUNCA por contraste con una propuesta anterior.
    · Mencionar nombres, roles internos, deliberaciones, opiniones de mandos intermedios, conversaciones internas, sistemas informáticos, IA, análisis automatizados, puntos, escalados internos, reglas de escalado, o cualquier proceso interno de toma de decisión.
    · Mencionar la existencia misma de un proceso interno previo. El documento debe leerse como si la empresa hubiera tomado UNA SOLA decisión directa basada en los hechos y el convenio.
  REDACCIÓN CORRECTA: presenta la medida como decisión empresarial directa y motivada únicamente en (a) los hechos descritos, (b) la calificación legal según el Art. 50 del convenio, y (c) la facultad disciplinaria del Art. 51. Punto. Nada más.
  Si detectas que estás a punto de incluir una comparación con una propuesta anterior o cualquier dato interno, REESCRIBE la frase eliminando esa información antes de devolver el documento. Esta regla PREVALECE sobre cualquier otra instrucción de extensión o detalle.
- Redacta en tercera persona, tono extremadamente formal, jurídico y neutro.
- Cita artículos EXACTOS del convenio según corresponda. ⚠️ REGLA INVIOLABLE DE NUMERACIÓN: las faltas tipificadas con letra (a, b, c, d, e, f, g, …) SIEMPRE están en el **Art. 50** (50.1.X leves / 50.2.X graves / 50.3.X muy graves). El **Art. 49** SOLO tiene principios generales (apartados 1-5) y NUNCA lleva letras: PROHIBIDO escribir "Art. 49.1.f", "Art. 49.2.f", "Art. 49.3.a" o cualquier "Art. 49.X.<letra>" — el artículo correcto es siempre el 50. Las sanciones se citan como Art. 51.a / 51.b / 51.c. Antes de devolver cualquier cita "Art. 4X.Y.letra" verifica que el primer número sea 50, jamás 49.
- Cita también el Estatuto de los Trabajadores: Art. 58 (faltas y sanciones de los trabajadores) y Art. 60.2 (prescripción).
- Fundamenta la proporcionalidad de la medida adoptada.
- TERMINOLOGÍA OBLIGATORIA SEGÚN TIPO: Si el tipo es AMONESTACIÓN, usa siempre "amonestación" (NUNCA "sanción") en todo el documento, ni siquiera en frases como "podrán dar lugar a sanciones" — usa "podrán dar lugar a medidas disciplinarias de mayor intensidad". Si el tipo es SANCIÓN, usa "sanción". Esto aplica a TODAS las secciones sin excepción.
- Usa cautela jurídica: evita afirmaciones absolutas. Usa "presuntamente", "conforme a los hechos comunicados".
- El documento debe ser jurídicamente defendible ante un tribunal.
- NO inventes hechos. Basa la exposición EXCLUSIVAMENTE en la descripción proporcionada.
- EXTENSIÓN: Cada sección debe tener una extensión MODERADA. No demasiado breve (telegráfico) ni demasiado extenso (relleno). Un punto medio profesional y concreto.
  * "exposicion_hechos": 2 párrafos completos (mínimo 90 palabras en total, máximo ~180). Detalla el contexto operativo, momento exacto, conducta concreta observada y afectación o riesgo derivado. NO te limites a una enumeración telegráfica ni a 4-5 frases sueltas: PROHIBIDO devolver una exposición de menos de 80 palabras. Mantén tono jurídico, tercera persona, cronológico. OBLIGATORIO: abre la primera frase mencionando SIEMPRE la fecha exacta de los HECHOS y, si está disponible, también la hora exacta, ambas en etiquetas <strong> (ej: "los hechos acaecidos el <strong>13 de abril de 2026</strong> a las <strong>09:17</strong>"). Si no hay hora disponible, destaca al menos la fecha con <strong>. ⚠️ PROHIBIDO ABSOLUTO en "exposicion_hechos": (a) mencionar las fechas de inicio/fin de la SUSPENSIÓN de empleo y sueldo — esas fechas SOLO van en "medida_disciplinaria"; (b) intercalar fechas, números o etiquetas <strong> en medio de una palabra o frase, rompiendo la sintaxis (ej: NUNCA "afecta a la calidad del 11 de mayo de 2026 al 13 de mayo de 2026liente"). Cada oración debe estar gramaticalmente cerrada y coherente antes de pasar a la siguiente. Revisa que no quedan palabras truncadas ni concatenadas con texto pegado sin espacio.
  * "fundamentacion_juridica": 1-2 párrafos. Cita los artículos relevantes y explica brevemente por qué aplican. No te extiendas innecesariamente.
  * "calificacion_falta": 1 párrafo. Justifica la calificación con la referencia legal correspondiente. Sé directo. FORMATO OBLIGATORIO: cuando cites el TEXTO LITERAL del apartado del convenio (lo que va entre comillas tras "que define como tal:" o similar), envuelve TODO ese texto literal — incluidas las comillas — en etiquetas <em>...</em> para que aparezca en cursiva. Ejemplo: <em>"Los descuidos en la conservación del material que se tuviere a cargo..."</em>. Solo el texto literal del artículo va en cursiva, nunca el resto del párrafo.
  * "medida_disciplinaria": 1 párrafo BREVE y directo. Indica únicamente: la medida adoptada, su base legal (Art. 51 del convenio) y, si aplica suspensión, las fechas exactas. PROHIBIDO incluir información sobre plazos de prescripción de la falta (10/20/60 días, Art. 60.2 ET), plazos de cancelación de anotaciones del expediente (2/4/8 meses, Art. 51), advertencias sobre futuras conductas o cualquier dato que no sea estrictamente la medida en sí. Esa información ya figura en otras secciones del documento; no la repitas aquí. USO OBLIGATORIO DE <strong> (semibold) para destacar lo importante: la MEDIDA CONCRETA adoptada (ej: <strong>AMONESTACIÓN POR ESCRITO</strong>, <strong>suspensión de empleo y sueldo de X días</strong>), las FECHAS de inicio/fin de suspensión cuando aplique, y expresiones clave como <strong>no aplicar la suspensión de empleo y sueldo</strong> o <strong>no constituye precedente</strong> en casos de atenuación. Destaca SIEMPRE estos elementos en semibold; el resto del párrafo en texto normal.
  * "imagenes_evidencia[].descripcion": (ver abajo)
  * "imagenes_evidencia[].descripcion": OBLIGATORIO — Máximo 1-2 frases por imagen, en tono ANALÍTICO y NATURAL, no meramente descriptivo. NO empieces con "Se observa…", "Se aprecia…", "La imagen muestra…" ni fórmulas similares de catálogo. En vez de listar lo que se ve, EXPLICA qué aporta la imagen al relato de los hechos: relaciona el contenido con la conducta imputada, con el momento, con la afectación operativa o con la responsabilidad del trabajador. Redacta como lo haría un instructor de expediente que glosa una prueba, no como un pie de foto. NUNCA dejes la descripción vacía ni genérica como "Imagen de evidencia 1".
- REGLA ANTI-INVENCIÓN DE PRODUCTOS (ESTRICTA — VIOLACIÓN = FALLO GRAVE):
  NUNCA uses las palabras "material vegetal", "plantas", "flores", "rosas", "claveles", "crisantemos" ni NINGÚN nombre específico de especie, producto, planta o flor.
  NUNCA pongas aclaraciones entre paréntesis como "(plantas)", "(flores)", "(material vegetal)".
  Si no conoces EXACTAMENTE qué es lo que aparece en las imágenes, usa SOLO estos términos genéricos: "material", "artículos", "mercancía", "referencias", "producto".
  Ejemplo CORRECTO: "Se observa material dispuesto de forma irregular."
  Ejemplo INCORRECTO: "Se observa material vegetal (plantas) dispuesto de forma irregular."
  Esta regla aplica a TODOS los campos: exposicion_hechos, imagenes_evidencia[].descripcion, calificacion_falta, medida_disciplinaria.
- Si hay suspensión de empleo y sueldo, especifica SIEMPRE las fechas exactas de inicio y fin.
- IMPORTANTE: Además del texto, debes devolver en "tipo_final" si es amonestacion o sancion, en "gravedad_final" la gravedad correcta según el convenio, y en "dias_suspension_final" los días de suspensión que correspondan. Si es amonestación sin suspensión, devuelve dias_suspension_final=0. Si el caso especial indica sanción formal sin suspensión por decisión empresarial, devuelve dias_suspension_final=0 y NO inventes fechas de suspensión. NUNCA devuelvas días fuera del rango legal salvo este caso especial explícito de atenuación empresarial.
${trainingBlock ? '- IMPORTANTE: Sigue el ESTILO y ESTRUCTURA de los documentos de referencia proporcionados por RRHH. Esos documentos son tu guía principal de formato y tono. Los documentos de ejemplo son LARGOS y detallados — tu documento debe tener una extensión SIMILAR.' : ''}${imagenInstruccion}${impuntualidadInstruccion}${imageMetadataBlock}${modificationBlock}

━━━ REGLA UNIVERSAL DE SEMIBOLD EN "medida_disciplinaria" (OBLIGATORIA, SIN EXCEPCIONES) ━━━
Independientemente del tipo (amonestación o sanción) y de la gravedad (leve, grave, muy grave), el campo "medida_disciplinaria" DEBE usar etiquetas <strong>...</strong> para destacar TODOS estos elementos cuando aparezcan:
  · La MEDIDA CONCRETA en mayúsculas: <strong>AMONESTACIÓN VERBAL</strong>, <strong>AMONESTACIÓN POR ESCRITO</strong>, <strong>SUSPENSIÓN DE EMPLEO Y SUELDO DE X DÍAS</strong>, <strong>DESPIDO DISCIPLINARIO</strong>.
  · Las FECHAS exactas de inicio y fin de suspensión cuando aplique (ej: del <strong>5 de mayo de 2026</strong> al <strong>9 de mayo de 2026</strong>).
  · El NÚMERO de días de suspensión (ej: <strong>5 días</strong>).
  · La BASE LEGAL principal (ej: <strong>Art. 51.b del Convenio</strong>).
  · Expresiones jurídicas clave de atenuación: <strong>no aplicar la suspensión de empleo y sueldo</strong>, <strong>no constituye precedente</strong>.
  · Advertencias formales: <strong>reincidencia</strong>, <strong>medidas disciplinarias de mayor intensidad</strong>.
PROHIBIDO devolver "medida_disciplinaria" SIN ningún <strong>. Si lo haces, el documento se considerará INVÁLIDO. La regla aplica POR IGUAL a amonestaciones leves, sanciones graves y muy graves. No abuses (no pongas todo en bold), pero los elementos listados son OBLIGATORIOS.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  const textoPrincipal = `Genera un documento disciplinario formal con estos datos:

TRABAJADOR: ${worker_name}${worker_number ? ` (Ficha: ${worker_number})` : ''}${worker_fiscal_id ? ` — DNI/NIE: ${worker_fiscal_id}` : ''}
DEPARTAMENTO: ${department_name}
TIPO: ${tipo === 'amonestacion' ? 'Amonestación escrita' : 'Sanción'} — Falta ${gravedad === 'muy_grave' ? 'muy grave' : gravedad}
${esSancionSinSuspension ? 'SUSPENSIÓN: NO APLICA — sanción formal SIN suspensión por moderación / atenuación empresarial (decisión consciente del empresario, ex Art. 58 ET).' : (suspension_dias ? `SUSPENSIÓN: ${suspension_dias} días de empleo y sueldo` : '')}
${esSancionSinSuspension ? '' : (fecha_inicio ? `FECHA INICIO SANCIÓN: ${fecha_inicio}` : '')}
FECHA DE LOS HECHOS: ${fecha_hechos ? new Date(fecha_hechos).toLocaleDateString('es-ES') : 'No especificada'}
CATEGORÍA: ${categoria}
DESCRIPCIÓN DE LOS HECHOS: ${descripcion_hechos}
${ai_motivo_legal ? `ANÁLISIS PREVIO IA: ${ai_motivo_legal}` : ''}
${ai_articulos?.length ? `ARTÍCULOS IDENTIFICADOS: ${ai_articulos.join(', ')}` : ''}
${imageUrls.length > 0 ? `\nIMAGENES ADJUNTAS COMO PRUEBA: ${imageUrls.length} imagen(es). Analiza VISUALMENTE cada imagen y devuelve los resultados en el campo "imagenes_evidencia". Cada entrada DEBE tener una "descripcion" específica describiendo qué se observa en la imagen (ej: "Se aprecia mercancía con embalaje dañado y disposición irregular"). NUNCA uses descripciones genéricas como "Imagen de evidencia 1".` : ''}
${esSancionSinSuspension ? `\n⚠️ SANCIÓN SIN SUSPENSIÓN — REGLAS:
- dias_suspension_final = 0 SIEMPRE.
- PROHIBIDO mencionar número de días de suspensión, rangos legales (ej. "3 a 14"), ni fechas de suspensión.
- "medida_disciplinaria" BREVE (máx. 2-3 frases): sanción formal por falta ${gravedad === 'muy_grave' ? 'muy grave' : 'grave'}, <strong>sin aplicar la suspensión de empleo y sueldo</strong>, y advertencia de que <strong>no constituye precedente</strong>. Nada más.` : ''}

Redacta el documento completo.`;

  // Build multimodal user message if there are images
  let userMessage: any;
  if (imageUrls.length > 0) {
    const contentParts: any[] = [{ type: "text", text: textoPrincipal }];
    for (const url of imageUrls) {
      contentParts.push({ type: "image_url", image_url: { url } });
    }
    userMessage = { role: "user", content: contentParts };
  } else {
    userMessage = { role: "user", content: textoPrincipal };
  }

  const response = await callAIWithMessages(apiKey, systemPrompt, userMessage, {
    tools: [{
      type: "function",
      function: {
        name: "generar_documento_legal",
        description: "Genera documento disciplinario formal",
        parameters: {
          type: "object",
          properties: {
            exposicion_hechos: { type: "string", description: "Exposición formal de los hechos en tercera persona" },
            fundamentacion_juridica: { type: "string", description: "Fundamentación jurídica con artículos del convenio" },
            calificacion_falta: { type: "string", description: "Calificación de la falta según Art. 50" },
            medida_disciplinaria: { type: "string", description: "Medida disciplinaria aplicada según Art. 51" },
            articulos_citados: { type: "array", items: { type: "string" }, description: "Lista de artículos del convenio citados" },
            plazo_alegaciones: { type: "integer", description: "Días de plazo para alegaciones" },
            tipo_final: { type: "string", enum: ["amonestacion", "sancion"], description: "Tipo definitivo del documento: amonestacion o sancion, según el convenio" },
            gravedad_final: { type: "string", enum: ["leve", "grave", "muy_grave"], description: "Gravedad definitiva según Art. 50-51 del convenio" },
            dias_suspension_final: { type: "integer", description: `Días de suspensión definitivos según Art. 51. ${esSancionSinSuspension ? 'OBLIGATORIO 0 — la empresa ha decidido no aplicar suspensión (atenuación empresarial). NUNCA devuelvas un valor distinto de 0.' : '0 si es amonestación sin suspensión. Leve: 0-2, Grave: 3-14, Muy grave: 14-30.'}` },
            imagenes_evidencia: {
              type: "array",
              description: "Array con una entrada por cada imagen analizada",
              items: {
                type: "object",
                properties: {
                  indice: { type: "integer", description: "Índice de la imagen (empezando en 0)" },
                  descripcion: { type: "string", description: "Glosa analítica (1-2 frases) que conecta la imagen con los hechos imputados y su relevancia probatoria. Tono natural, no descriptivo. Evita 'Se observa…' / 'Se aprecia…'." },
                  seccion_recomendada: { type: "string", enum: ["exposicion_hechos", "calificacion_falta", "medida_disciplinaria"], description: "Sección del documento donde encaja mejor esta imagen" },
                  incluir_imagen: { type: "boolean", description: "true si la imagen es relevante y debe incluirse en el documento legal, false si es borrosa, irrelevante o no aporta valor probatorio" },
                  layout_recomendado: { type: "string", enum: ["grid", "fila_grande"], description: "Layout sugerido para esta imagen en el documento. Usa 'fila_grande' (una imagen por fila a tamaño grande, ideal para capturas de fichajes semanales donde el detalle es crítico) o 'grid' (varias imágenes por fila, ideal para capturas variadas y autoevidentes). Para casos de impuntualidad reiterada, SIEMPRE 'fila_grande'." },
                },
                required: ["indice", "descripcion", "seccion_recomendada", "incluir_imagen"],
                additionalProperties: false,
              }
            },
          },
          required: imageUrls.length > 0
            ? ["exposicion_hechos", "fundamentacion_juridica", "calificacion_falta", "medida_disciplinaria", "articulos_citados", "tipo_final", "gravedad_final", "dias_suspension_final", "imagenes_evidencia"]
            : ["exposicion_hechos", "fundamentacion_juridica", "calificacion_falta", "medida_disciplinaria", "articulos_citados", "tipo_final", "gravedad_final", "dias_suspension_final"],
          additionalProperties: false,
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "generar_documento_legal" } },
  });

  return response;
}

// (Duplicate handleBorradorNSPP / handleGenerateNSPPDocument removed — kept full versions above with multimodal support)


// ── Retry helper for transient errors (429/503) ─────────
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);
    const shouldRetry = res.status === 429 || res.status === 503;

    if (shouldRetry && attempt < maxRetries) {
      const text = await res.text();
      const retryAfterHeader = res.headers.get('retry-after');
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
      const waitMs = Number.isFinite(retryAfterMs) && retryAfterMs > 0
        ? retryAfterMs
        : res.status === 429
          ? (attempt + 1) * 15000
          : (attempt + 1) * 2000;

      console.warn(`AI transient error ${res.status} (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(waitMs / 1000)}s...`, text);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    return res;
  }

  return await fetch(url, options);
}

// ── AI Gateway Caller ───────────────────────────────────
async function callAI(apiKey: string, systemPrompt: string, userPrompt: string, extras?: Record<string, unknown>) {
  const timeoutMs = extras?.timeoutMs ? Number(extras.timeoutMs) : 30000;
  const modelOverride = extras?.model as string | undefined;
  const cleanExtras = extras ? { ...extras } : {};
  delete cleanExtras.timeoutMs;
  delete cleanExtras.model;

  const primaryModel = modelOverride || MODEL;
  const fallbackModel = primaryModel === MODEL ? MODEL_FALLBACK : primaryModel === MODEL_LITE ? MODEL_LITE_FALLBACK : null;
  const modelsToTry = fallbackModel ? [primaryModel, fallbackModel] : [primaryModel];

  for (const currentModel of modelsToTry) {
    const payload: Record<string, unknown> = {
      model: currentModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      ...cleanExtras,
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetchWithRetry(AI_GATEWAY, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        if (res.status === 429) {
          return new Response(JSON.stringify({ error: "rate_limit", message: "Límite de peticiones IA excedido. Inténtalo en unos minutos." }), {
            status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (res.status === 402) {
          return new Response(JSON.stringify({ error: "credits_exhausted", message: "Créditos de IA agotados. Contacta con el administrador." }), {
            status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        // On 503, try fallback model if available
        if (res.status === 503 && currentModel !== modelsToTry[modelsToTry.length - 1]) {
          const text = await res.text();
          console.warn(`Model ${currentModel} unavailable (503), trying fallback ${modelsToTry[modelsToTry.indexOf(currentModel) + 1]}...`, text);
          continue;
        }
        const text = await res.text();
        console.error('AI gateway error:', res.status, text);
        return new Response(JSON.stringify({ error: "ai_error", message: "Error en el servicio de IA" }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (currentModel !== primaryModel) {
        console.log(`Successfully used fallback model: ${currentModel}`);
      }

      const data = await res.json();
      const choice = data.choices?.[0];
      if (choice?.message?.tool_calls?.[0]) {
        const toolCall = choice.message.tool_calls[0];
        try {
          const parsed = JSON.parse(toolCall.function.arguments);
          return new Response(JSON.stringify(parsed), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } catch {
          return new Response(JSON.stringify({ error: "parse_error", raw: toolCall.function.arguments }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      const content = choice?.message?.content || '';
      return new Response(JSON.stringify({ respuesta: content, resumen: content }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof DOMException && err.name === 'AbortError') {
        // On timeout, try fallback
        if (currentModel !== modelsToTry[modelsToTry.length - 1]) {
          console.warn(`Model ${currentModel} timed out, trying fallback...`);
          continue;
        }
        return new Response(JSON.stringify({ error: "timeout", message: "La consulta IA tardó demasiado" }), {
          status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw err;
    }
  }

  // Should never reach here
  return new Response(JSON.stringify({ error: "ai_error", message: "Error en el servicio de IA" }), {
    status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Chat Propuesta (multi-turn conversation about a proposal) ───────────────
async function handleChatPropuesta(body: any, apiKey: string, aiConfig: any, empresaContext: string) {
  const { messages, propuesta_context } = body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages array required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const customBlock = aiConfig.instrucciones_custom?.trim()
    ? `\nInstrucciones adicionales: ${aiConfig.instrucciones_custom}`
    : '';

  const ctx = propuesta_context || {};
  const systemPrompt = `Eres un asesor laboralista español. Hablas de forma DIRECTA, BREVE y en LENGUAJE NATURAL — como un colega experto dando su opinión sincera.

REGLAS ESTRICTAS:
- Respuestas CORTAS: máximo 3-4 frases. Ve al grano. Nada de introducciones ni resúmenes innecesarios.
- Usa un tono natural y directo: "Yo creo que...", "En mi opinión...", "Mira, con esos datos..."
- Si el usuario te da información nueva que cambia tu análisis, DILO CLARAMENTE: "Vale, con eso cambia la cosa..." y explica brevemente qué cambiaría.
- Solo cita artículos si es necesario para justificar un cambio. No repitas todo el convenio.
- Si cambias de opinión respecto al análisis previo, DEBES indicarlo.

${CONVENIO_CONTEXT}
${empresaContext}${customBlock}

PROPUESTA ACTUAL:
Tipo: ${ctx.tipo || '?'} | Gravedad: ${ctx.gravedad || '?'} | Trabajador: ${ctx.trabajadores || '?'} | Depto: ${ctx.departamento || '?'}
Hechos: ${ctx.descripcion || 'No proporcionada'} | Fecha: ${ctx.fecha || '?'}
${ctx.ai_analysis_summary ? `Análisis previo IA: ${ctx.ai_analysis_summary}` : ''}
${ctx.estadisticas ? `Stats: ${ctx.estadisticas}` : ''}`;

  const aiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m: any) => ({ role: m.role, content: m.content })),
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetchWithRetry(AI_GATEWAY, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL_LITE,
        messages: aiMessages,
        max_tokens: 400,
        tools: [
          {
            type: 'function',
            function: {
              name: 'chat_response',
              description: 'Responde al usuario sobre la propuesta disciplinaria.',
              parameters: {
                type: 'object',
                properties: {
                  respuesta: { type: 'string', description: 'Tu respuesta breve y directa al usuario.' },
                  cambio_opinion: { type: 'boolean', description: 'true si la información nueva del usuario te ha hecho cambiar de opinión sobre la gravedad, tipo de sanción o clasificación respecto al análisis previo. false si mantienes la misma opinión.' },
                },
                required: ['respuesta', 'cambio_opinion'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'chat_response' } },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      if (res.status === 429) {
        return new Response(JSON.stringify({ error: 'rate_limit', message: 'Límite de peticiones IA excedido.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const text = await res.text();
      console.error('Chat propuesta AI error:', res.status, text);
      return new Response(JSON.stringify({ error: 'ai_error', message: 'Error en el servicio de IA' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    const choice = data.choices?.[0];

    // Handle tool call response
    if (choice?.message?.tool_calls?.[0]) {
      try {
        const parsed = JSON.parse(choice.message.tool_calls[0].function.arguments);
        return new Response(JSON.stringify({
          reply: parsed.respuesta || '',
          cambio_opinion: parsed.cambio_opinion === true,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch {
        // Fallback to raw content
        const content = choice?.message?.content || '';
        return new Response(JSON.stringify({ reply: content, cambio_opinion: false }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const content = choice?.message?.content || '';
    return new Response(JSON.stringify({ reply: content, cambio_opinion: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === 'AbortError') {
      return new Response(JSON.stringify({ error: 'timeout', message: 'La consulta IA tardó demasiado' }), {
        status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    throw err;
  }
}

// Extract every <img ...> tag from an HTML string
function extractImgTags(html: string): string[] {
  if (!html) return [];
  const matches = html.match(/<img\b[^>]*>/gi);
  return matches ? matches : [];
}

// Get the src attribute value from an <img> tag
function getImgSrc(tag: string): string {
  const m = tag.match(/\bsrc\s*=\s*"([^"]+)"/i) || tag.match(/\bsrc\s*=\s*'([^']+)'/i);
  return m ? m[1] : '';
}

/**
 * Safety net: if the AI's edited HTML lost or corrupted any of the original
 * evidence <img> tags, restore them. This protects against the model returning
 * the alt text instead of the real <img>, truncating long signed URLs, or
 * silently dropping the entire <figure>/<aside> block.
 */
function preserveEvidenceImages(originalHtml: string, editedHtml: string): string {
  if (!originalHtml || !editedHtml) return editedHtml;
  const originalImgs = extractImgTags(originalHtml);
  if (originalImgs.length === 0) return editedHtml;

  const editedImgs = extractImgTags(editedHtml);
  const editedSrcs = new Set(editedImgs.map(getImgSrc).filter(Boolean));

  // Find original imgs (with valid http(s) src) that are missing from edited HTML
  const missing = originalImgs.filter((tag) => {
    const src = getImgSrc(tag);
    if (!src || !/^https?:\/\//i.test(src)) return false;
    return !editedSrcs.has(src);
  });

  if (missing.length === 0) return editedHtml;

  console.warn(`[preserveEvidenceImages] Restoring ${missing.length} missing evidence image(s) lost during AI edit`);

  let result = editedHtml;
  for (const origTag of missing) {
    const origSrc = getImgSrc(origTag);
    const altMatch = origTag.match(/\balt\s*=\s*"([^"]*)"/i);
    const alt = altMatch ? altMatch[1] : '';

    // 1) Try to find a broken <img> in edited that references the same alt — replace it
    let replaced = false;
    if (alt) {
      const brokenImgRe = new RegExp(`<img\\b[^>]*\\balt\\s*=\\s*"${alt.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}"[^>]*>`, 'i');
      if (brokenImgRe.test(result)) {
        result = result.replace(brokenImgRe, origTag);
        replaced = true;
      }
      // 2) Otherwise, look for the alt text rendered as plain text and inject the img there
      if (!replaced) {
        const plainAltRe = new RegExp(`(>|^)\\s*${alt.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*(<|$)`);
        if (plainAltRe.test(result)) {
          result = result.replace(plainAltRe, (_m, before, after) => `${before}${origTag}${after}`);
          replaced = true;
        }
      }
    }
    // 3) Last resort: append before </body> or at the end so the evidence is still visible
    if (!replaced) {
      const restoredBlock = `\n<div class="evidence-aside" style="margin:14px 0"><div class="evidence-aside-frame">${origTag}</div></div>\n`;
      if (/<\/body>/i.test(result)) {
        result = result.replace(/<\/body>/i, `${restoredBlock}</body>`);
      } else {
        result += restoredBlock;
      }
    }
  }
  return result;
}

// ── Edit Legal Document via chat instruction ───────────────
async function handleEditLegalDocument(body: any, apiKey: string, empresaContext: string) {
  const { html_content, instruccion, image_base64, selected_text } = body;
  if (!html_content || !instruccion) {
    return new Response(JSON.stringify({ error: 'html_content and instruccion required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Sanitize selected_text to avoid prompt injection
  const safeSelectedText = typeof selected_text === 'string'
    ? selected_text.replace(/```/g, '\\u0060\\u0060\\u0060').slice(0, 4000).trim()
    : '';

  const selectionBlock = safeSelectedText
    ? `

⚡ MODO SELECCIÓN PRECISA ACTIVADO
El usuario ha SELECCIONADO un fragmento literal del documento. Debes:
1. LOCALIZAR ese fragmento EXACTO dentro del HTML (puede estar entre etiquetas; ignora diferencias de espacios/saltos).
2. APLICAR la instrucción del usuario SOLO a ese fragmento (sustituyéndolo, reformulándolo, etc.).
3. NO TOCAR absolutamente NADA del resto del documento, ni añadir ni quitar elementos fuera de esa zona.
4. Mantener el formato HTML circundante intacto (etiquetas, clases, estilos).

FRAGMENTO SELECCIONADO POR EL USUARIO (literal):
"""
${safeSelectedText}
"""
`
    : '';

  const systemPrompt = `Eres un abogado laboralista español que edita documentos disciplinarios formales.
Se te proporciona un documento HTML legal existente y una instrucción de edición del usuario.
${image_base64 ? 'El usuario también ha adjuntado una imagen/captura del documento señalando la zona concreta que quiere modificar. Analiza la imagen para identificar exactamente qué parte del documento debe cambiarse.' : ''}
${selectionBlock}
REGLAS:
- Modifica SOLO lo que indica la instrucción. No cambies el resto del documento.
- Mantén la estructura HTML general y las clases CSS base.
- SÍ PUEDES modificar estilos inline (margin, padding, font-size, width, height, gap, max-height, max-width, etc.) cuando el usuario pida ajustes de maquetación, espaciado, tamaño de elementos o diseño visual. Aplica estos cambios directamente en los atributos style="" de los elementos afectados.
- Mantén todo el contenido que no se pida modificar.
- El resultado debe ser el HTML COMPLETO del documento (desde <!DOCTYPE html> hasta </html>).
- NUNCA uses "material vegetal", "plantas", "flores" ni nombres de especies. Usa SOLO términos genéricos: "material", "artículos", "mercancía", "producto".
- Mantén el tono formal, jurídico y neutro.
- ⚠️ COHERENCIA OBLIGATORIA: el documento tiene un TIPO y una GRAVEDAD finales (visibles en los badges del HTML, p.ej. "AMONESTACIÓN" + "LEVE", o "SANCIÓN GRAVE"). NO introduzcas frases que contradigan ese estado: si el documento es una AMONESTACIÓN no uses la palabra "sanción" ni hables de "suspensión de empleo y sueldo"; si la gravedad es LEVE no califiques los hechos como graves ni hables de "elevar la falta de leve a grave". Si la instrucción del usuario implica cambiar tipo/gravedad/días, devuelve también tipo_final, gravedad_final y dias_suspension_final reflejando el estado FINAL deseado, y respeta los límites del convenio (leve 0-2, grave 3-14, muy_grave 14-30). Si la instrucción NO toca esos campos, MANTÉN el tipo y gravedad actuales sin cambiarlos.
- 🖼️ EVIDENCIAS GRÁFICAS — INTOCABLES: TODAS las etiquetas <img> del documento (con clase "evidence-image", dentro de "evidence-aside", "evidence-aside-frame", figuras de "PRUEBAS APORTADAS", o cualquier <img src="https://..."/>) deben conservarse EXACTAMENTE como están. NUNCA modifiques, acortes, recompongas ni elimines el atributo src="..." de una imagen — las URLs son firmadas y largas, romperlas hace que la evidencia no se vea. NUNCA reemplaces una <img> por su texto alt. NUNCA quites el bloque de "PRUEBAS APORTADAS" / "Evidencias gráficas" / "evidence-aside" salvo que el usuario lo pida explícitamente. Si necesitas cambiar el pie de foto (figcaption), modifica SOLO el texto del figcaption dejando la <img> intacta. Si añades una nueva sección, no toques las imágenes existentes.
${empresaContext}

Devuelve el HTML completo del documento modificado.`;

  try {
    // If image is provided, use Gemini direct API for multimodal
    if (image_base64) {
      // Extract base64 data and mime type
      const match = image_base64.match(/^data:(image\/[^;]+);base64,(.+)$/);
      const mimeType = match?.[1] || 'image/png';
      const base64Data = match?.[2] || image_base64;

      const modelsToTry = [MODEL, MODEL_FALLBACK];
      let lastError = '';

      for (const currentModel of modelsToTry) {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 60000);

        try {
          const geminiUrl = `${GEMINI_DIRECT_API}/${currentModel}:generateContent?key=${apiKey}`;
          const res = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: `${systemPrompt}\n\nDOCUMENTO ACTUAL:\n\n${html_content}\n\nINSTRUCCIÓN DE EDICIÓN:\n${instruccion}` },
                  { inline_data: { mime_type: mimeType, data: base64Data } },
                ],
              }],
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 16384,
              },
            }),
            signal: ctrl.signal,
          });

          clearTimeout(to);

          if (!res.ok) {
            if (res.status === 429) {
              return new Response(JSON.stringify({ error: 'rate_limit', message: 'Límite de peticiones IA excedido.' }), {
                status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
            const errText = await res.text();
            lastError = errText;
            if (res.status === 503 && currentModel !== modelsToTry[modelsToTry.length - 1]) {
              console.warn(`Edit doc: model ${currentModel} unavailable (503), trying fallback...`, errText);
              continue;
            }
            // Last model: if 503 (overloaded), break out of loop to try Lovable AI Gateway fallback below
            if (res.status === 503) {
              console.warn(`Edit doc: last model ${currentModel} also unavailable (503), falling through to Lovable AI Gateway...`, errText);
              break;
            }
            console.error('Edit legal doc AI error (multimodal):', res.status, errText);
            return new Response(JSON.stringify({ error: 'ai_error', message: 'Error en el servicio de IA' }), {
              status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          if (currentModel !== modelsToTry[0]) {
            console.log(`Edit doc: successfully used fallback model: ${currentModel}`);
          }

          const data = await res.json();
          let content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const htmlMatch = content.match(/```html\n([\s\S]*?)```/);
          if (htmlMatch) content = htmlMatch[1];

          if (content) {
            content = sanitizeText(content);
            content = preserveEvidenceImages(html_content, content);
            return new Response(JSON.stringify({ html_content: content, cambios_realizados: 'Cambios aplicados según la imagen y la instrucción' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        } catch (err) {
          clearTimeout(to);
          if (err instanceof DOMException && err.name === 'AbortError' && currentModel !== modelsToTry[modelsToTry.length - 1]) {
            console.warn(`Edit doc: model ${currentModel} timed out, trying fallback...`);
            continue;
          }
          throw err;
        }
      }

      // All Google direct models failed for multimodal — try Lovable AI Gateway as final fallback
      console.warn('Edit doc multimodal: all Google models failed, trying Lovable AI Gateway...');
      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
      if (lovableApiKey) {
        try {
          const ctrl3 = new AbortController();
          const to3 = setTimeout(() => ctrl3.abort(), 90000);
          const userContent: any[] = [
            { type: 'text', text: `${systemPrompt}\n\nDOCUMENTO ACTUAL:\n\n${html_content}\n\nINSTRUCCIÓN DE EDICIÓN:\n${instruccion}` },
            { type: 'image_url', image_url: { url: image_base64 } },
          ];
          const lovRes = await fetch(LOVABLE_AI_GATEWAY, {
            method: 'POST',
            headers: { Authorization: `Bearer ${lovableApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: MODEL_LOVABLE_FALLBACK,
              messages: [{ role: 'user', content: userContent }],
            }),
            signal: ctrl3.signal,
          });
          clearTimeout(to3);
          if (lovRes.ok) {
            const lovData = await lovRes.json();
            let content = lovData.choices?.[0]?.message?.content || '';
            const htmlMatch = content.match(/```html\n([\s\S]*?)```/);
            if (htmlMatch) content = htmlMatch[1];
            if (content) {
              content = sanitizeText(content);
              content = preserveEvidenceImages(html_content, content);
              console.log('Edit doc multimodal: successfully used Lovable AI Gateway fallback');
              return new Response(JSON.stringify({ html_content: content, cambios_realizados: 'Cambios aplicados según la imagen y la instrucción' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
          } else {
            const errText = await lovRes.text();
            console.error('Lovable AI Gateway multimodal fallback failed:', lovRes.status, errText);
          }
        } catch (e) { console.error('Lovable AI Gateway multimodal fallback error:', e); }
      }

      console.warn('Edit doc multimodal: no usable HTML returned; falling back to text-only edit with the same instruction.');
    }

    // Standard text-only edit via OpenAI-compatible API with fallback
    const userMessage = `DOCUMENTO ACTUAL:\n\n${html_content}\n\nINSTRUCCIÓN DE EDICIÓN:\n${instruccion}`;
    const toolsDef = [{
      type: 'function',
      function: {
        name: 'edit_document',
        description: 'Devuelve el documento HTML editado junto con los metadatos disciplinarios extraídos del resultado',
        parameters: {
          type: 'object',
          properties: {
            html_content: { type: 'string', description: 'HTML completo del documento editado' },
            cambios_realizados: { type: 'string', description: 'Breve descripción de los cambios realizados' },
            tipo_final: { type: 'string', enum: ['amonestacion', 'sancion'], description: 'Tipo del documento tras la edición (amonestacion o sancion)' },
            gravedad_final: { type: 'string', enum: ['leve', 'grave', 'muy_grave'], description: 'Gravedad del documento tras la edición' },
            dias_suspension_final: { type: 'integer', description: 'Días de suspensión del documento tras la edición. 0 si no hay suspensión. Leve: 0-2, Grave: 3-14, Muy grave: 14-30' },
          },
          required: ['html_content', 'cambios_realizados'],
          additionalProperties: false,
        },
      },
    }];

    const modelsToTry = [MODEL, MODEL_FALLBACK];

    for (const currentModel of modelsToTry) {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 60000);

      try {
        // Use plain fetch (no internal retries) so 503s fall through to the next model / Lovable fallback fast.
        const res = await fetch(AI_GATEWAY, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: currentModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage },
            ],
            tools: toolsDef,
            tool_choice: { type: 'function', function: { name: 'edit_document' } },
          }),
          signal: ctrl.signal,
        });

        clearTimeout(to);

        if (!res.ok) {
          if (res.status === 429) {
            return new Response(JSON.stringify({ error: 'rate_limit', message: 'Límite de peticiones IA excedido.' }), {
              status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          if (res.status === 503 && currentModel !== modelsToTry[modelsToTry.length - 1]) {
            const errText = await res.text();
            console.warn(`Edit doc text: model ${currentModel} unavailable (503), trying fallback...`, errText);
            continue;
          }
          // Last model: if 503 (overloaded), break out of loop to try Lovable AI Gateway fallback below
          if (res.status === 503) {
            const errText = await res.text();
            console.warn(`Edit doc text: last model ${currentModel} also unavailable (503), falling through to Lovable AI Gateway...`, errText);
            break;
          }
          const text = await res.text();
          console.error('Edit legal doc AI error:', res.status, text);
          return new Response(JSON.stringify({ error: 'ai_error', message: 'Error en el servicio de IA' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (currentModel !== modelsToTry[0]) {
          console.log(`Edit doc text: successfully used fallback model: ${currentModel}`);
        }

        const data = await res.json();
        const choice = data.choices?.[0];
        if (choice?.message?.tool_calls?.[0]) {
          try {
            const parsed = JSON.parse(choice.message.tool_calls[0].function.arguments);
            if (parsed.html_content) {
              parsed.html_content = sanitizeText(parsed.html_content);
              parsed.html_content = preserveEvidenceImages(html_content, parsed.html_content);
            }
            if (parsed.cambios_realizados) parsed.cambios_realizados = sanitizeText(parsed.cambios_realizados);
            return new Response(JSON.stringify(parsed), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          } catch {
            return new Response(JSON.stringify({ error: 'parse_error' }), {
              status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }

        const content = choice?.message?.content || '';
        const safeContent = preserveEvidenceImages(html_content, sanitizeText(content));
        return new Response(JSON.stringify({ html_content: safeContent, cambios_realizados: 'Edición aplicada' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        clearTimeout(to);
        if (err instanceof DOMException && err.name === 'AbortError' && currentModel !== modelsToTry[modelsToTry.length - 1]) {
          console.warn(`Edit doc text: model ${currentModel} timed out, trying fallback...`);
          continue;
        }
        if (err instanceof DOMException && err.name === 'AbortError') {
          return new Response(JSON.stringify({ error: 'timeout', message: 'La edición tardó demasiado' }), {
            status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw err;
      }
    }

    // All Google models failed for text-only — try Lovable AI Gateway
    console.warn('Edit doc text: all Google models failed, trying Lovable AI Gateway...');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (lovableApiKey) {
      try {
        const ctrl4 = new AbortController();
        const to4 = setTimeout(() => ctrl4.abort(), 90000);
        const lovRes = await fetch(LOVABLE_AI_GATEWAY, {
          method: 'POST',
          headers: { Authorization: `Bearer ${lovableApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: MODEL_LOVABLE_FALLBACK,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage },
            ],
            tools: toolsDef,
            tool_choice: { type: 'function', function: { name: 'edit_document' } },
          }),
          signal: ctrl4.signal,
        });
        clearTimeout(to4);
        if (lovRes.ok) {
          const lovData = await lovRes.json();
          const lovChoice = lovData.choices?.[0];
          if (lovChoice?.message?.tool_calls?.[0]) {
            try {
              const parsed = JSON.parse(lovChoice.message.tool_calls[0].function.arguments);
              if (parsed.html_content) {
                parsed.html_content = sanitizeText(parsed.html_content);
                parsed.html_content = preserveEvidenceImages(html_content, parsed.html_content);
              }
              if (parsed.cambios_realizados) parsed.cambios_realizados = sanitizeText(parsed.cambios_realizados);
              console.log('Edit doc text: successfully used Lovable AI Gateway fallback');
              return new Response(JSON.stringify(parsed), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            } catch { /* parse error, fall through */ }
          }
          const content = lovChoice?.message?.content || '';
          if (content) {
            console.log('Edit doc text: successfully used Lovable AI Gateway fallback (content)');
            const safeContent = preserveEvidenceImages(html_content, sanitizeText(content));
            return new Response(JSON.stringify({ html_content: safeContent, cambios_realizados: 'Edición aplicada' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        } else {
          const errText = await lovRes.text();
          console.error('Lovable AI Gateway text fallback failed:', lovRes.status, errText);
        }
      } catch (e) { console.error('Lovable AI Gateway text fallback error:', e); }
    }

    return new Response(JSON.stringify({ error: 'ai_error', message: 'Todos los modelos están saturados. Inténtalo en unos minutos.' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return new Response(JSON.stringify({ error: 'timeout', message: 'La edición tardó demasiado' }), {
        status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    throw err;
  }
}

// ── Deterministic sanitization of banned terms ───────────────
// IMPORTANTE: usamos lookbehind negativo "(?<!Comercio de )" para NO tocar
// el nombre oficial del convenio: "...Empresas del Comercio de Flores y Plantas".
const BANNED_PATTERNS: Array<[RegExp, string]> = [
  [/material\s+vegetal/gi, 'material'],
  [/\(plantas?\)/gi, ''],
  [/\(flores?\)/gi, ''],
  [/\(material\s+vegetal\)/gi, ''],
  [/\(rosas?\)/gi, ''],
  [/\(claveles?\)/gi, ''],
  [/\(crisantemos?\)/gi, ''],
  [/plantas\s+ornamentales/gi, 'mercancía'],
  [/(?<!Comercio\s+de\s+)plantas\s+y\s+flores/gi, 'mercancía'],
  [/(?<!Comercio\s+de\s+)flores\s+y\s+plantas/gi, 'mercancía'],
];

// Lista canónica de variantes erróneas que la IA puede inventar para el nombre
// del convenio. Todas se reescriben al nombre OFICIAL "Comercio de Flores y
// Plantas". Documento legal — no se admite ninguna desviación.
const CONVENIO_NAME_FIXES: Array<[RegExp, string]> = [
  [/Comercio\s+de\s+mercanc[íi]a(s)?/gi, 'Comercio de Flores y Plantas'],
  [/Comercio\s+de\s+plantas\s+y\s+flores/gi, 'Comercio de Flores y Plantas'],
  [/Comercio\s+mayorista(\s+de\s+(flores|plantas|mercanc[íi]as?))?/gi, 'Comercio de Flores y Plantas'],
  [/Comercio\s+de\s+art[íi]culos/gi, 'Comercio de Flores y Plantas'],
  [/Comercio\s+de\s+productos/gi, 'Comercio de Flores y Plantas'],
];

function sanitizeText(text: string): string {
  let result = text;
  for (const [pattern, replacement] of BANNED_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  // Restaurar SIEMPRE el nombre oficial del convenio: el documento es legal
  // y no admite variantes inventadas por la IA o introducidas por la
  // sanitización anterior.
  for (const [pattern, replacement] of CONVENIO_NAME_FIXES) {
    result = result.replace(pattern, replacement);
  }
  // Clean up double spaces left by removals
  return result.replace(/\s{2,}/g, ' ').trim();
}

function sanitizeBannedTerms(obj: any): void {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'string') {
      obj[key] = sanitizeText(obj[key]);
    } else if (Array.isArray(obj[key])) {
      for (let i = 0; i < obj[key].length; i++) {
        if (typeof obj[key][i] === 'string') {
          obj[key][i] = sanitizeText(obj[key][i]);
        } else if (typeof obj[key][i] === 'object') {
          sanitizeBannedTerms(obj[key][i]);
        }
      }
    } else if (typeof obj[key] === 'object') {
      sanitizeBannedTerms(obj[key]);
    }
  }
}

// ── AI Gateway Caller with prebuilt user message (multimodal) ───────────────
async function callAIWithMessages(apiKey: string, systemPrompt: string, userMessage: any, extras?: Record<string, unknown>) {
  const timeoutMs = extras?.timeoutMs ? Number(extras.timeoutMs) : 60000;
  const modelOverride = extras?.model ? String(extras.model) : MODEL;
  const { timeoutMs: _t, model: _m, ...cleanExtras } = extras || {};

  const fallbackModel = modelOverride === MODEL ? MODEL_FALLBACK : modelOverride === MODEL_LITE ? MODEL_LITE_FALLBACK : null;
  const modelsToTry = fallbackModel ? [modelOverride, fallbackModel] : [modelOverride];

  for (const currentModel of modelsToTry) {
    const payload: Record<string, unknown> = {
      model: currentModel,
      messages: [
        { role: "system", content: systemPrompt },
        userMessage,
      ],
      ...cleanExtras,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetchWithRetry(AI_GATEWAY, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        if (res.status === 429) {
          return new Response(JSON.stringify({ error: "rate_limit", message: "Límite de peticiones IA excedido. Inténtalo en unos minutos." }), {
            status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (res.status === 402) {
          return new Response(JSON.stringify({ error: "credits_exhausted", message: "Créditos de IA agotados. Contacta con el administrador." }), {
            status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (res.status === 503 && currentModel !== modelsToTry[modelsToTry.length - 1]) {
          const text = await res.text();
          console.warn(`Model ${currentModel} unavailable (503, multimodal), trying fallback...`, text);
          continue;
        }
        const text = await res.text();
        console.error('AI gateway error (multimodal):', res.status, text);
        return new Response(JSON.stringify({ error: "ai_error", message: "Error en el servicio de IA" }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (currentModel !== modelOverride) {
        console.log(`Successfully used fallback model (multimodal): ${currentModel}`);
      }

      const data = await res.json();
      const choice = data.choices?.[0];
      if (choice?.message?.tool_calls?.[0]) {
        const toolCall = choice.message.tool_calls[0];
        try {
          const parsed = JSON.parse(toolCall.function.arguments);
          // Sanitize banned terms from AI output
          sanitizeBannedTerms(parsed);
          return new Response(JSON.stringify(parsed), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } catch {
          return new Response(JSON.stringify({ error: "parse_error", raw: toolCall.function.arguments }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      const content = choice?.message?.content || '';
      return new Response(JSON.stringify({ respuesta: content, resumen: content }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (currentModel !== modelsToTry[modelsToTry.length - 1]) {
          console.warn(`Model ${currentModel} timed out (multimodal), trying fallback...`);
          continue;
        }
        return new Response(JSON.stringify({ error: "timeout", message: "La consulta IA tardó demasiado con imágenes" }), {
          status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw err;
    }
  }

  return new Response(JSON.stringify({ error: "ai_error", message: "Error en el servicio de IA" }), {
    status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

