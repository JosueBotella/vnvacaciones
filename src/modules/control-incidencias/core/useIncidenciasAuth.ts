/**
 * Control de Incidencias - Auth Hook
 * 
 * Consumes the existing useManagerAuth and builds the
 * IncidenciasUserContext with department assignments and permissions.
 */

import { useState, useEffect, useMemo } from 'react';
import { useManagerAuth } from '@/hooks/useManagerAuth';
import { supabase } from '@/integrations/supabase/client';
import type { IncidenciasUserContext, IncidenciasRole } from './types';
import { getPermissions } from './permissions';

interface UseIncidenciasAuthReturn {
  userContext: IncidenciasUserContext | null;
  isAdmin: boolean;
  isEncargado: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAccessDenied: boolean;
  selectedDepartmentId: string | null;
  setSelectedDepartmentId: (id: string | null) => void;
}

export function useIncidenciasAuth(): UseIncidenciasAuthReturn {
  const { manager, isAuthenticated, isLoading: authLoading, getSessionToken } = useManagerAuth();
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [workerTeamIdsState, setWorkerTeamIds] = useState<string[] | undefined>(undefined);
  const [depsLoading, setDepsLoading] = useState(false);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);

  // Map manager role to incidencias role
  const incidenciasRole: IncidenciasRole | null = useMemo(() => {
    if (!manager) return null;
    if (manager.role === 'admin') return 'admin';
    if (manager.role === 'manager') return 'encargado';
    if (manager.role === 'responsable') return 'encargado';
    return null; // 'consulta' role has no access
  }, [manager]);

  // Access denied if authenticated but role not allowed
  const isAccessDenied = isAuthenticated && incidenciasRole === null;

  // Fetch department assignments when authenticated
  useEffect(() => {
    if (!manager || !isAuthenticated || !incidenciasRole) return;
    if (incidenciasRole === 'admin') {
      // Admins don't need department filtering
      setDepartmentIds([]);
      return;
    }

    const fetchDepartments = async () => {
      setDepsLoading(true);
      try {
        const sessionToken = getSessionToken();
        if (!sessionToken) return;

        const response = await supabase.functions.invoke('incidencias-operations', {
          body: { action: 'getMyDepartments', sessionToken }
        });

        if (response.data?.success && response.data.departments) {
          const ids = response.data.departments.map((d: { id: string }) => d.id);
          setDepartmentIds(ids);
          // Auto-select first department if none selected
          if (!selectedDepartmentId && ids.length > 0) {
            setSelectedDepartmentId(ids[0]);
          }
        }

        // For responsable role, use responsableTeamIds from backend
        if (manager.role === 'responsable' && response.data?.responsableTeamIds) {
          setWorkerTeamIds(response.data.responsableTeamIds);
        } else if (manager.role === 'responsable' && (manager as any).worker_team_id) {
          // Fallback to worker_team_id
          setWorkerTeamIds([(manager as any).worker_team_id]);
        }
      } catch (error) {
        console.error('Failed to fetch departments for incidencias:', error);
      } finally {
        setDepsLoading(false);
      }
    };

    fetchDepartments();
  }, [manager, isAuthenticated, incidenciasRole]);

  // Build user context
  const userContext: IncidenciasUserContext | null = useMemo(() => {
    if (!manager || !incidenciasRole) return null;
    return {
      managerId: manager.id,
      managerName: manager.name,
      role: incidenciasRole,
      departmentIds,
      workerTeamIds: workerTeamIdsState,
      permissions: getPermissions(incidenciasRole),
    };
  }, [manager, incidenciasRole, departmentIds, workerTeamIdsState]);

  return {
    userContext,
    isAdmin: incidenciasRole === 'admin',
    isEncargado: incidenciasRole === 'encargado',
    isAuthenticated: isAuthenticated && incidenciasRole !== null,
    isLoading: authLoading || depsLoading,
    isAccessDenied,
    selectedDepartmentId,
    setSelectedDepartmentId,
  };
}
