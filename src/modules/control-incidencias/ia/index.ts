/**
 * Control de Incidencias - AI Module
 * 
 * Public API for AI services.
 */

export {
  clasificarIncidencia,
  generarBorradorSancion,
  generarResumenTrabajador,
  consultarConvenio,
  analizarPatrones,
  limpiarTranscripcion,
  generarDocumentoLegal,
} from './aiService';

export type { PatternAnalysis } from './aiService';
