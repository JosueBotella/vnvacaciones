/**
 * Control de Incidencias - Legal Module
 * 
 * Public API for legal services.
 */

export { 
  buscarArticulos, 
  obtenerArticulo,
  obtenerArticulosPorGravedad,
  validarSancion, 
  obtenerLimitesSancion,
  calcularPrescripcion, 
  evaluarReincidencia 
} from './legalService';

export { ARTICULOS_DISCIPLINARIOS } from './convenioData';
