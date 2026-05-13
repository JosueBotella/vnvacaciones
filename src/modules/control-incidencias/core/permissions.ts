/**
 * Control de Incidencias - Permission Service
 * 
 * Determines permissions based on role and validates department access.
 */

import type { IncidenciasRole, IncidenciasPermissions, IncidenciasUserContext } from './types';

const ADMIN_PERMISSIONS: IncidenciasPermissions = {
  puedeCrearIncidencia: true,
  puedeEditarIncidencia: true,
  puedeBorrarIncidencia: true,
  puedeCambiarGravedad: true,
  puedeDecidirSancion: true,
  puedeDeterminarDias: true,
  puedeConfigurarCategorias: true,
  puedeConfigurarReglas: true,
  puedeVerDashboardGlobal: true,
  puedeEnviarEmails: true,
  puedeSolicitarEdicion: true,
  puedeProponerSancion: true,
  puedeSubirArchivos: true,
};

const ENCARGADO_PERMISSIONS: IncidenciasPermissions = {
  puedeCrearIncidencia: true,
  puedeEditarIncidencia: false,
  puedeBorrarIncidencia: false,
  puedeCambiarGravedad: false,
  puedeDecidirSancion: false,
  puedeDeterminarDias: false,
  puedeConfigurarCategorias: false,
  puedeConfigurarReglas: false,
  puedeVerDashboardGlobal: false,
  puedeEnviarEmails: false,
  puedeSolicitarEdicion: true,
  puedeProponerSancion: true,
  puedeSubirArchivos: true,
};

/**
 * Returns the permission set for a given role.
 */
export function getPermissions(role: IncidenciasRole): IncidenciasPermissions {
  return role === 'admin' ? { ...ADMIN_PERMISSIONS } : { ...ENCARGADO_PERMISSIONS };
}

/**
 * Checks if a user context has access to a specific department.
 * Admins have unrestricted access.
 */
export function canAccessDepartment(
  userContext: IncidenciasUserContext,
  departmentId: string
): boolean {
  if (userContext.role === 'admin') return true;
  return userContext.departmentIds.includes(departmentId);
}

/**
 * Returns the department IDs that should be used for filtering queries.
 * For admins, returns null (no filter needed).
 * For encargados, returns their assigned department IDs.
 */
export function getDepartmentFilter(
  userContext: IncidenciasUserContext
): string[] | null {
  if (userContext.role === 'admin') return null;
  return userContext.departmentIds;
}
