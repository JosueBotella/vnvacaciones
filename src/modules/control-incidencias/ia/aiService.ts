/**
 * Control de Incidencias - AI Service
 * 
 * Provider-agnostic AI service for incident classification, 
 * sanction suggestion, and document generation.
 * 
 * IMPORTANT: All disciplinary intelligence flows through this service.
 * Never scatter AI logic across other modules.
 * 
 * Current backend: Lovable AI Gateway (google/gemini-3-flash-preview)
 * Can be swapped to any OpenAI-compatible API by changing the edge function.
 */

import type {
  AIClassificationRequest,
  AIClassificationResponse,
  AISancionDraft,
  FaltaGravedad,
  TipoSancion,
} from '../core/types';
import { supabase } from '@/integrations/supabase/client';

// ==========================================
// Classification
// ==========================================

/**
 * Classify the severity of an incident using AI.
 * The AI is instructed to base its response on the convenio colectivo articles.
 * 
 * @returns AI-suggested classification (must be validated by legalService before applying)
 */
export async function clasificarIncidencia(
  request: AIClassificationRequest
): Promise<AIClassificationResponse> {
  const { data, error } = await supabase.functions.invoke('control-incidencias-ai', {
    body: {
      action: 'clasificar',
      descripcion: request.descripcion,
      contexto_trabajador: request.contexto_trabajador,
    },
  });

  if (error) {
    throw new Error(`Error en clasificación IA: ${error.message}`);
  }

  return data as AIClassificationResponse;
}

// ==========================================
// Sanction Draft Generation
// ==========================================

/**
 * Generate a draft sanction letter/notification using AI.
 * The AI uses legal references from the convenio.
 */
export async function generarBorradorSancion(params: {
  trabajador_nombre: string;
  gravedad: FaltaGravedad;
  sancion: TipoSancion;
  dias_suspension?: number;
  descripcion_hechos: string;
  articulos_referencia: string[];
}): Promise<AISancionDraft> {
  const { data, error } = await supabase.functions.invoke('control-incidencias-ai', {
    body: {
      action: 'generar_borrador_sancion',
      ...params,
    },
  });

  if (error) {
    throw new Error(`Error generando borrador: ${error.message}`);
  }

  return data as AISancionDraft;
}

// ==========================================
// Summary Generation
// ==========================================

/**
 * Generate a summary report of worker incidents
 */
export async function generarResumenTrabajador(params: {
  trabajador_nombre: string;
  incidencias: Array<{
    fecha: string;
    descripcion: string;
    gravedad: FaltaGravedad;
    sancion?: TipoSancion;
  }>;
}): Promise<string> {
  const { data, error } = await supabase.functions.invoke('control-incidencias-ai', {
    body: {
      action: 'resumen_trabajador',
      ...params,
    },
  });

  if (error) {
    throw new Error(`Error generando resumen: ${error.message}`);
  }

  return data?.resumen as string;
}

// ==========================================
// Legal Query (AI + Convenio)
// ==========================================

export async function consultarConvenio(pregunta: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('control-incidencias-ai', {
    body: {
      action: 'consultar_convenio',
      pregunta,
    },
  });

  if (error) {
    throw new Error(`Error consultando convenio: ${error.message}`);
  }

  return data?.respuesta as string;
}

// ==========================================
// Voice Transcription Cleanup
// ==========================================

export async function limpiarTranscripcion(textoCrudo: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('control-incidencias-ai', {
    body: {
      action: 'limpiar_transcripcion',
      texto_crudo: textoCrudo,
    },
  });

  if (error) {
    throw new Error(`Error limpiando transcripción: ${error.message}`);
  }

  return data?.texto as string;
}

// ==========================================
// Legal Document Generation
// ==========================================

export async function generarDocumentoLegal(propuestaId: string): Promise<any> {
  const { data, error } = await supabase.functions.invoke('incidencias-operations', {
    body: {
      action: 'generateLegalDocument',
      sessionToken: localStorage.getItem('manager_session_token') || '',
      propuestaId,
    },
  });

  if (error) {
    throw new Error(`Error generando documento legal: ${error.message}`);
  }

  return data;
}

// ==========================================
// Pattern Analysis (Predictive AI)
// ==========================================

export interface PatternAnalysis {
  tendencia: 'subiendo' | 'bajando' | 'estable';
  dia_pico: string;
  patron_detectado: string;
  prediccion_proxima_semana: string;
  nivel_alerta: 'bajo' | 'medio' | 'alto' | 'critico';
  alertas_proactivas: string[];
  acciones_preventivas: string[];
  resumen: string;
}

export async function analizarPatrones(params: {
  department_name: string;
  stats: Record<string, unknown>;
  day_distribution: number[];
  tendencia: string;
  top_workers?: Array<Record<string, unknown>>;
  daily_metrics?: Array<Record<string, unknown>>;
}): Promise<PatternAnalysis> {
  const { data, error } = await supabase.functions.invoke('control-incidencias-ai', {
    body: {
      action: 'analyze_patterns',
      ...params,
    },
  });

  if (error) {
    throw new Error(`Error analizando patrones: ${error.message}`);
  }

  return data as PatternAnalysis;
}
