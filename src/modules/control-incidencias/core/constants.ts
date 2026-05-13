/**
 * Control de Incidencias - Constants
 * 
 * Centralized constants derived from the collective agreement (convenio colectivo).
 * XVIII Convenio Colectivo Estatal para las Empresas del Comercio de Flores y Plantas
 * BOE-A-2025-21424, published 24/10/2025
 */

import type { FaltaGravedad, LimitesSancion, TipoSancion } from './types';

// ==========================================
// Sanction Limits per Severity (Art. 51)
// ==========================================

export const LIMITES_SANCION: Record<FaltaGravedad, LimitesSancion> = {
  leve: {
    gravedad: 'leve',
    sanciones_permitidas: ['amonestacion_verbal', 'amonestacion_escrita', 'suspension_empleo_sueldo'],
    suspension_min_dias: 0,
    suspension_max_dias: 2,
    permite_despido: false,
    permite_traslado: false,
    cancelacion_meses: 2,
  },
  moderada: {
    gravedad: 'moderada',
    sanciones_permitidas: ['amonestacion_verbal', 'amonestacion_escrita', 'suspension_empleo_sueldo'],
    suspension_min_dias: 0,
    suspension_max_dias: 2,
    permite_despido: false,
    permite_traslado: false,
    cancelacion_meses: 2,
  },
  grave: {
    gravedad: 'grave',
    sanciones_permitidas: ['suspension_empleo_sueldo'],
    suspension_min_dias: 3,
    suspension_max_dias: 14,
    permite_despido: false,
    permite_traslado: false,
    cancelacion_meses: 4,
  },
  muy_grave: {
    gravedad: 'muy_grave',
    sanciones_permitidas: ['suspension_empleo_sueldo', 'traslado', 'despido_disciplinario'],
    suspension_min_dias: 14,
    suspension_max_dias: 30,
    permite_despido: true,
    permite_traslado: true,
    cancelacion_meses: 8,
  },
};

// ==========================================
// Prescription Periods (Estatuto Trabajadores Art. 60)
// ==========================================

export const PRESCRIPCION_DIAS: Record<FaltaGravedad, number> = {
  leve: 10,
  moderada: 10,
  grave: 20,
  muy_grave: 60,
};

// Absolute prescription: 6 months from commission date for all types
export const PRESCRIPCION_ABSOLUTA_MESES = 6;

// ==========================================
// Recidivism thresholds (Art. 50)
// ==========================================

export const REINCIDENCIA = {
  // 5 faltas leves sanctioned (not just verbal warning) in a quarter → falta grave (Art. 50.2.o)
  leves_para_grave: 5,
  leves_periodo_meses: 3, // quarter

  // 2+ faltas graves sanctioned in a year → falta muy grave (Art. 50.3.m)
  graves_para_muy_grave: 2,
  graves_periodo_meses: 12, // year
};

// ==========================================
// Label mappings for UI (future use)
// ==========================================

export const GRAVEDAD_LABELS: Record<FaltaGravedad, string> = {
  leve: 'Leve',
  moderada: 'Moderada',
  grave: 'Grave',
  muy_grave: 'Muy Grave',
};

export const SANCION_LABELS: Record<TipoSancion, string> = {
  amonestacion_verbal: 'Amonestación verbal',
  amonestacion_escrita: 'Amonestación escrita',
  suspension_empleo_sueldo: 'Suspensión de empleo y sueldo',
  traslado: 'Traslado a otro centro',
  despido_disciplinario: 'Despido disciplinario',
};

// ==========================================
// Convenio Metadata
// ==========================================

export const CONVENIO_INFO = {
  nombre: 'XVIII Convenio Colectivo Estatal para las Empresas del Comercio de Flores y Plantas',
  codigo: '99001125011982',
  boe: 'BOE-A-2025-21424',
  fecha_publicacion: '2025-10-24',
  vigencia_inicio: '2024-01-01',
  vigencia_fin: '2028-12-31',
  pdf_path: '/legal/convenio-colectivo-flores-plantas-2025.pdf',
};
