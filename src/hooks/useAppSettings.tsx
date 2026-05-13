import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

type UserRole = 'admin' | 'manager' | 'worker' | 'user' | null;

interface AppSettings {
  id: string;
  max_rows: number;
  current_rows: number;
  is_locked: boolean;
  lock_reason: string | null;
  warning_threshold: number;
}

interface AppSettingsContextType {
  settings: AppSettings | null;
  isLoading: boolean;
  isLocked: boolean;
  isNearLimit: boolean;
  userRole: UserRole;
  canWrite: boolean;
  refreshSettings: () => Promise<void>;
}

const AppSettingsContext = createContext<AppSettingsContextType | undefined>(undefined);

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<UserRole>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching app settings:', error);
        return;
      }

      if (data) {
        setSettings(data as AppSettings);
        
        // Auto-lock if current_rows >= max_rows
        if (data.current_rows >= data.max_rows && !data.is_locked) {
          await supabase
            .from('app_settings')
            .update({
              is_locked: true,
              lock_reason: 'Límite del plan gratuito alcanzado'
            })
            .eq('id', data.id);
          
          setSettings(prev => prev ? {
            ...prev,
            is_locked: true,
            lock_reason: 'Límite del plan gratuito alcanzado'
          } : null);
        }
      }
    } catch (error) {
      console.error('Error in fetchSettings:', error);
    }
  }, []);

  const detectUserRole = useCallback(async () => {
    // Check if user is authenticated admin
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user) {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .maybeSingle();
      
      if (roleData?.role === 'admin') {
        setUserRole('admin');
        return;
      }
    }

    // Check if user is a manager (via manager session)
    const managerToken = localStorage.getItem('manager_session_token');
    if (managerToken) {
      setUserRole('manager');
      return;
    }

    // Default to worker/user for public pages
    setUserRole('worker');
  }, []);

  const refreshSettings = useCallback(async () => {
    await fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([fetchSettings(), detectUserRole()]);
      setIsLoading(false);
    };

    init();

    // Refresh settings periodically
    const interval = setInterval(fetchSettings, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [fetchSettings, detectUserRole]);

  const isLocked = settings?.is_locked ?? false;
  
  const isNearLimit = settings 
    ? (settings.current_rows >= (settings.max_rows * settings.warning_threshold / 100)) && !settings.is_locked
    : false;

  const canWrite = !isLocked;

  return (
    <AppSettingsContext.Provider value={{
      settings,
      isLoading,
      isLocked,
      isNearLimit,
      userRole,
      canWrite,
      refreshSettings
    }}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  const context = useContext(AppSettingsContext);
  if (context === undefined) {
    throw new Error('useAppSettings must be used within an AppSettingsProvider');
  }
  return context;
}
