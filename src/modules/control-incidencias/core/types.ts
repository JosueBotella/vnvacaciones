/**
 * Control de Incidencias - Core Types
 * 
 * Central type definitions for the incident control module.
 * All sub-modules import types from here.
 */

// ==========================================
// Enums & Constants
// ==========================================

export type FaltaGravedad = 'leve' | 'moderada' | 'grave' | 'muy_grave';

export type EstadoIncidencia = 
  | 'abierta' 
  | 'en_investigacion' 
  | 'sancionada' 
  | 'archivada' 
  | 'prescrita'
  | 'recurrida';

export type TipoSancion = 
  | 'amonestacion_verbal' 
  | 'amonestacion_escrita' 
  | 'suspension_empleo_sueldo' 
  | 'traslado' 
  | 'despido_disciplinario';

export type OrigenIncidencia = 
  | 'fichaje' 
  | 'ausencia' 
  | 'conducta' 
  | 'rendimiento' 
  | 'seguridad' 
  | 'manual';

// ==========================================
// Core Interfaces
// ==========================================

export interface Incidencia {
  id: string;
  worker_id: string;
  worker_name: string;
  worker_number: string;
  department_id: string;
  fecha: string;
  origen: OrigenIncidencia;
  descripcion: string;
  gravedad_sugerida?: FaltaGravedad;
  gravedad_final?: FaltaGravedad;
  estado: EstadoIncidencia;
  referencia_legal?: string; // e.g. "Art. 50.1.a"
  sancion_aplicada?: TipoSancion;
  dias_suspension?: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  notas?: string;
}

export interface SancionValidation {
  es_valida: boolean;
  sancion_maxima: TipoSancion;
  dias_maximos_suspension: number;
  referencia_articulo: string;
  motivo_invalidez?: string;
}

export interface ReincidenciaInfo {
  total_faltas_leves: number;
  total_faltas_graves: number;
  total_faltas_muy_graves: number;
  puede_escalar: boolean;
  motivo_escalado?: string;
}

export interface PrescripcionInfo {
  esta_prescrita: boolean;
  fecha_prescripcion: string;
  dias_restantes: number;
  tipo_falta: FaltaGravedad;
}

// ==========================================
// AI Service Types
// ==========================================

export interface AIClassificationRequest {
  descripcion: string;
  contexto_trabajador?: {
    historial_incidencias: number;
    antigüedad_meses: number;
  };
}

export interface AIClassificationResponse {
  gravedad_sugerida: FaltaGravedad;
  confianza: number; // 0-1
  razonamiento: string;
  articulos_relevantes: string[];
  sancion_sugerida: TipoSancion;
  dias_suspension_sugeridos?: number;
}

export interface AISancionDraft {
  asunto: string;
  cuerpo: string;
  referencias_legales: string[];
  advertencias: string[];
}

// ==========================================
// Legal Service Types
// ==========================================

export interface ArticuloConvenio {
  numero: string;        // e.g. "50.1.a"
  titulo: string;
  contenido: string;
  capitulo: string;
  gravedad?: FaltaGravedad;
}

export interface LegalSearchResult {
  articulos: ArticuloConvenio[];
  relevancia: number;
  contexto: string;
}

export interface LimitesSancion {
  gravedad: FaltaGravedad;
  sanciones_permitidas: TipoSancion[];
  suspension_min_dias: number;
  suspension_max_dias: number;
  permite_despido: boolean;
  permite_traslado: boolean;
  cancelacion_meses: number; // When annotation is cleared from record
}

// ==========================================
// Roles & Permissions
// ==========================================

export type IncidenciasRole = 'admin' | 'encargado';

export interface IncidenciasPermissions {
  puedeCrearIncidencia: boolean;
  puedeEditarIncidencia: boolean;
  puedeBorrarIncidencia: boolean;
  puedeCambiarGravedad: boolean;
  puedeDecidirSancion: boolean;
  puedeDeterminarDias: boolean;
  puedeConfigurarCategorias: boolean;
  puedeConfigurarReglas: boolean;
  puedeVerDashboardGlobal: boolean;
  puedeEnviarEmails: boolean;
  puedeSolicitarEdicion: boolean;
  puedeProponerSancion: boolean;
  puedeSubirArchivos: boolean;
}

export interface IncidenciasUserContext {
  managerId: string;
  managerName: string;
  role: IncidenciasRole;
  departmentIds: string[];
  workerTeamIds?: string[];
  permissions: IncidenciasPermissions;
}
