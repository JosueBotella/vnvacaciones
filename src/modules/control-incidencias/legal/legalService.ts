/**
 * Control de Incidencias - Legal Service
 * 
 * Provides legal validation and consultation against the collective agreement.
 * This is the SINGLE SOURCE OF TRUTH for all disciplinary decisions.
 * 
 * CRITICAL RULE: No sanction may be generated outside what the convenio allows.
 */

import type { 
  FaltaGravedad, 
  TipoSancion, 
  SancionValidation, 
  ReincidenciaInfo, 
  PrescripcionInfo,
  ArticuloConvenio,
  LegalSearchResult,
  LimitesSancion 
} from '../core/types';
import { LIMITES_SANCION, PRESCRIPCION_DIAS, PRESCRIPCION_ABSOLUTA_MESES, REINCIDENCIA } from '../core/constants';
import { ARTICULOS_DISCIPLINARIOS } from './convenioData';

// ==========================================
// Article Search
// ==========================================

/**
 * Search articles by keyword (case-insensitive, accent-insensitive)
 */
export function buscarArticulos(query: string): LegalSearchResult {
  const normalizedQuery = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const results = ARTICULOS_DISCIPLINARIOS.filter(art => {
    const normalizedContent = (art.contenido + ' ' + art.titulo)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return normalizedContent.includes(normalizedQuery);
  });

  return {
    articulos: results,
    relevancia: results.length > 0 ? 1 : 0,
    contexto: `Búsqueda: "${query}" - ${results.length} artículo(s) encontrado(s)`,
  };
}

/**
 * Get a specific article by number (e.g., "50.1.a")
 */
export function obtenerArticulo(numero: string): ArticuloConvenio | undefined {
  return ARTICULOS_DISCIPLINARIOS.find(art => art.numero === numero);
}

/**
 * Get all articles for a specific severity level
 */
export function obtenerArticulosPorGravedad(gravedad: FaltaGravedad): ArticuloConvenio[] {
  return ARTICULOS_DISCIPLINARIOS.filter(art => art.gravedad === gravedad);
}

// ==========================================
// Sanction Validation
// ==========================================

/**
 * Validate whether a proposed sanction is legally permissible.
 * This is the core legal guard - MUST be called before any sanction is applied.
 */
export function validarSancion(
  gravedad: FaltaGravedad,
  sancion: TipoSancion,
  diasSuspension?: number
): SancionValidation {
  const limites = LIMITES_SANCION[gravedad];

  // Check if sanction type is allowed for this severity
  if (!limites.sanciones_permitidas.includes(sancion)) {
    return {
      es_valida: false,
      sancion_maxima: limites.sanciones_permitidas[limites.sanciones_permitidas.length - 1],
      dias_maximos_suspension: limites.suspension_max_dias,
      referencia_articulo: 'Art. 51',
      motivo_invalidez: `La sanción "${sancion}" no está permitida para faltas de gravedad "${gravedad}". Sanciones permitidas: ${limites.sanciones_permitidas.join(', ')}.`,
    };
  }

  // Check suspension days if applicable
  if (sancion === 'suspension_empleo_sueldo' && diasSuspension !== undefined) {
    if (diasSuspension < limites.suspension_min_dias) {
      return {
        es_valida: false,
        sancion_maxima: sancion,
        dias_maximos_suspension: limites.suspension_max_dias,
        referencia_articulo: 'Art. 51',
        motivo_invalidez: `Para falta ${gravedad}, la suspensión mínima es de ${limites.suspension_min_dias} días. Se propusieron ${diasSuspension} días.`,
      };
    }
    if (diasSuspension > limites.suspension_max_dias) {
      return {
        es_valida: false,
        sancion_maxima: sancion,
        dias_maximos_suspension: limites.suspension_max_dias,
        referencia_articulo: 'Art. 51',
        motivo_invalidez: `Para falta ${gravedad}, la suspensión máxima es de ${limites.suspension_max_dias} días. Se propusieron ${diasSuspension} días.`,
      };
    }
  }

  // Check dismissal
  if (sancion === 'despido_disciplinario' && !limites.permite_despido) {
    return {
      es_valida: false,
      sancion_maxima: limites.sanciones_permitidas[limites.sanciones_permitidas.length - 1],
      dias_maximos_suspension: limites.suspension_max_dias,
      referencia_articulo: 'Art. 51',
      motivo_invalidez: `El despido disciplinario solo está permitido para faltas muy graves.`,
    };
  }

  // Check transfer
  if (sancion === 'traslado' && !limites.permite_traslado) {
    return {
      es_valida: false,
      sancion_maxima: limites.sanciones_permitidas[limites.sanciones_permitidas.length - 1],
      dias_maximos_suspension: limites.suspension_max_dias,
      referencia_articulo: 'Art. 51',
      motivo_invalidez: `El traslado solo está permitido para faltas muy graves.`,
    };
  }

  return {
    es_valida: true,
    sancion_maxima: limites.sanciones_permitidas[limites.sanciones_permitidas.length - 1],
    dias_maximos_suspension: limites.suspension_max_dias,
    referencia_articulo: 'Art. 51',
  };
}

/**
 * Get the maximum allowed sanction limits for a severity level
 */
export function obtenerLimitesSancion(gravedad: FaltaGravedad): LimitesSancion {
  return LIMITES_SANCION[gravedad];
}

// ==========================================
// Prescription
// ==========================================

/**
 * Calculate whether a fault has prescribed (statute of limitations)
 */
export function calcularPrescripcion(
  gravedad: FaltaGravedad,
  fechaConocimiento: string, // Date employer learned of the fault
  fechaComision: string       // Date the fault was committed
): PrescripcionInfo {
  const now = new Date();
  const conocimiento = new Date(fechaConocimiento);
  const comision = new Date(fechaComision);

  // Short prescription: from knowledge date
  const diasDesdeConocimiento = Math.floor((now.getTime() - conocimiento.getTime()) / (1000 * 60 * 60 * 24));
  const diasLimite = PRESCRIPCION_DIAS[gravedad];

  // Absolute prescription: 6 months from commission date
  const mesesDesdeComision = (now.getFullYear() - comision.getFullYear()) * 12 + (now.getMonth() - comision.getMonth());

  const prescritaPorConocimiento = diasDesdeConocimiento > diasLimite;
  const prescritaPorAbsoluta = mesesDesdeComision >= PRESCRIPCION_ABSOLUTA_MESES;

  const estaPrescrita = prescritaPorConocimiento || prescritaPorAbsoluta;

  const fechaPrescripcionCorta = new Date(conocimiento);
  fechaPrescripcionCorta.setDate(fechaPrescripcionCorta.getDate() + diasLimite);

  const fechaPrescripcionAbsoluta = new Date(comision);
  fechaPrescripcionAbsoluta.setMonth(fechaPrescripcionAbsoluta.getMonth() + PRESCRIPCION_ABSOLUTA_MESES);

  const fechaPrescripcion = fechaPrescripcionCorta < fechaPrescripcionAbsoluta 
    ? fechaPrescripcionCorta 
    : fechaPrescripcionAbsoluta;

  const diasRestantes = Math.max(0, Math.floor((fechaPrescripcion.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  return {
    esta_prescrita: estaPrescrita,
    fecha_prescripcion: fechaPrescripcion.toISOString().split('T')[0],
    dias_restantes: diasRestantes,
    tipo_falta: gravedad,
  };
}

// ==========================================
// Recidivism
// ==========================================

/**
 * Evaluate recidivism (reincidencia) based on worker's history
 */
export function evaluarReincidencia(
  faltasLevesSancionadas: number,
  faltasGravesSancionadas: number,
  periodoMesesLeves: number,
  periodoMesesGraves: number
): ReincidenciaInfo {
  const escalaAGrave = periodoMesesLeves <= REINCIDENCIA.leves_periodo_meses 
    && faltasLevesSancionadas >= REINCIDENCIA.leves_para_grave;

  const escalaAMuyGrave = periodoMesesGraves <= REINCIDENCIA.graves_periodo_meses 
    && faltasGravesSancionadas >= REINCIDENCIA.graves_para_muy_grave;

  return {
    total_faltas_leves: faltasLevesSancionadas,
    total_faltas_graves: faltasGravesSancionadas,
    total_faltas_muy_graves: 0, // Provided by caller
    puede_escalar: escalaAGrave || escalaAMuyGrave,
    motivo_escalado: escalaAGrave 
      ? `Reincidencia Art.50.2.o: ${faltasLevesSancionadas} faltas leves sancionadas en ${periodoMesesLeves} meses (límite: ${REINCIDENCIA.leves_para_grave} en ${REINCIDENCIA.leves_periodo_meses} meses) → Escala a GRAVE`
      : escalaAMuyGrave 
        ? `Reincidencia Art.50.3.m: ${faltasGravesSancionadas} faltas graves sancionadas en ${periodoMesesGraves} meses (límite: ${REINCIDENCIA.graves_para_muy_grave} en ${REINCIDENCIA.graves_periodo_meses} meses) → Escala a MUY GRAVE`
        : undefined,
  };
}
