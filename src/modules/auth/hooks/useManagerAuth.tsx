import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Manager = {
  id: string;
  name: string;
  role: string;
  department_id: string | null;
  worker_team_id: string | null;
  candidaturas_only?: boolean;
};

type LoginResult = { success: boolean; error?: string; needsPassword?: boolean; remainingAttempts?: number; locked?: boolean };

type ManagerAuthContextType = {
  manager: Manager | null;
  isAdmin: boolean;
  isConsulta: boolean;
  isResponsable: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (managerId: string, password: string) => Promise<LoginResult>;
  loginByEmail: (email: string, password: string, remember?: boolean) => Promise<LoginResult>;
  logout: () => void;
  logoutAll: () => Promise<void>;
  setPassword: (managerId: string, password: string) => Promise<{ success: boolean; error?: string }>;
  getSessionToken: () => string | null;
};

const ManagerAuthContext = createContext<ManagerAuthContextType | undefined>(undefined);

export const ManagerAuthProvider = ({ children }: { children: ReactNode }) => {
  const [manager, setManager] = useState<Manager | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Validate stored session on mount
    const validateStoredSession = async () => {
      const storedToken = localStorage.getItem("manager_session_token") || sessionStorage.getItem("manager_session_token");
      
      if (!storedToken) {
        console.log('No stored session token found');
        setIsLoading(false);
        return;
      }

      console.log('Validating stored session token...');
      
      try {
        // Validate the session token server-side
        const response = await supabase.functions.invoke('manager-auth', {
          body: {
            action: 'validateSession',
            sessionToken: storedToken
          }
        });

        // On network error, trust local session to avoid logout
        if (response.error) {
          console.warn('Session validation network error - trusting local session:', response.error);
          // Try to rehydrate from localStorage
          const storedManager = localStorage.getItem("manager_session");
          if (storedManager) {
            try {
              const parsed = JSON.parse(storedManager);
              setManager(parsed);
              setSessionToken(storedToken);
              console.log('Rehydrated manager from local storage:', parsed.name);
            } catch {
              // If parsing fails, don't clear - just leave as-is
              console.warn('Could not parse stored manager session');
            }
          }
          setIsLoading(false);
          return;
        }

        const data = response.data;
        
        if (data.success && data.manager) {
          // Session is valid - use server-provided manager data
          console.log('Session valid for manager:', data.manager.name);
          setManager(data.manager);
          setSessionToken(storedToken);
        } else if (
          data.error === 'Invalid session token' ||
          data.error === 'Invalid session' ||
          data.error === 'Session expired' ||
          data.error === 'Manager not found' ||
          data.error?.includes('bloqueada')
        ) {
          // Only clear on EXPLICIT invalid session errors or blocked
          console.log('Session explicitly invalid, expired, or blocked - clearing');
          if (data.error?.includes('bloqueada')) {
            toast.error("Tu cuenta ha sido bloqueada. Contacta con un administrador.");
          }
          clearSession();
        } else {
          // Unknown response - trust local session
          console.warn('Unknown session validation response, trusting local:', data);
          const storedManager = localStorage.getItem("manager_session");
          if (storedManager) {
            try {
              const parsed = JSON.parse(storedManager);
              setManager(parsed);
              setSessionToken(storedToken);
            } catch {
              // Ignore
            }
          }
        }
      } catch (error) {
        // Network or parsing error - DO NOT clear session
        console.warn('Session validation exception - trusting local session:', error);
        const storedManager = localStorage.getItem("manager_session");
        if (storedManager) {
          try {
            const parsed = JSON.parse(storedManager);
            setManager(parsed);
            setSessionToken(storedToken);
          } catch {
            // Ignore
          }
        }
      }
      
      setIsLoading(false);
    };

    validateStoredSession();
  }, []);

  // SECURITY: Periodic session check every 5 min to auto-kick blocked users
  // Also tracks activity to keep session alive (2h inactivity timeout on backend)
  const lastActivityRef = useRef(Date.now());

  // Track user activity (mouse, keyboard, touch)
  useEffect(() => {
    const updateActivity = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener('mousemove', updateActivity, { passive: true });
    window.addEventListener('keydown', updateActivity, { passive: true });
    window.addEventListener('touchstart', updateActivity, { passive: true });
    window.addEventListener('click', updateActivity, { passive: true });
    return () => {
      window.removeEventListener('mousemove', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      window.removeEventListener('touchstart', updateActivity);
      window.removeEventListener('click', updateActivity);
    };
  }, []);

  useEffect(() => {
    if (!sessionToken || !manager) return;

    const checkSession = async () => {
      // Only validate if user has been active in the last 2 hours
      const inactiveMs = Date.now() - lastActivityRef.current;
      const TWO_HOURS = 2 * 60 * 60 * 1000;
      if (inactiveMs > TWO_HOURS) {
        // User has been inactive for 2h+, clear session locally
        clearSession();
        window.location.href = '/login';
        return;
      }

      try {
        const response = await supabase.functions.invoke('manager-auth', {
          body: { action: 'validateSession', sessionToken }
        });

        if (response.error) return; // Network error - don't kick

        const data = response.data;
        if (!data.success) {
          const isBlocked = data.error?.includes('bloqueada');
          if (isBlocked) {
            toast.error("Tu cuenta ha sido bloqueada. Contacta con un administrador.");
          }
          clearSession();
          window.location.href = '/login';
        }
      } catch {
        // Network error - don't kick
      }
    };

    const interval = setInterval(checkSession, 5 * 60 * 1000); // Every 5 minutes
    return () => clearInterval(interval);
  }, [sessionToken, manager]);

  const clearSession = () => {
    setManager(null);
    setSessionToken(null);
    localStorage.removeItem("manager_session");
    localStorage.removeItem("manager_session_token");
    sessionStorage.removeItem("manager_session");
    sessionStorage.removeItem("manager_session_token");
  };

  const storeSession = (managerData: Manager, token: string, remember: boolean = true) => {
    setManager(managerData);
    setSessionToken(token);
    
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem("manager_session", JSON.stringify(managerData));
    storage.setItem("manager_session_token", token);
    // Also keep in localStorage so validation on mount works
    if (remember) {
      localStorage.setItem("manager_session", JSON.stringify(managerData));
      localStorage.setItem("manager_session_token", token);
    } else {
      // Clear localStorage if not remembering
      localStorage.removeItem("manager_session");
      localStorage.removeItem("manager_session_token");
    }
  };

  const login = async (managerId: string, password: string): Promise<LoginResult> => {
    try {
      const response = await supabase.functions.invoke('manager-auth', {
        body: {
          action: 'login',
          managerId,
          password
        }
      });

      if (response.error) {
        console.error('Login error:', response.error);
        return { success: false, error: 'Error de conexión' };
      }

      const data = response.data;
      
      if (!data.success) {
        return { 
          success: false, 
          error: data.error,
          needsPassword: data.needsPassword,
          remainingAttempts: data.remainingAttempts,
          locked: data.remainingAttempts === 0 || data.locked,
        };
      }

      const managerData = data.manager as Manager;
      storeSession(managerData, data.sessionToken, true);
      
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Error de conexión' };
    }
  };

  const loginByEmail = async (email: string, password: string, remember: boolean = true): Promise<LoginResult> => {
    try {
      const response = await supabase.functions.invoke('manager-auth', {
        body: {
          action: 'loginByEmail',
          email,
          password
        }
      });

      if (response.error) {
        console.error('Login error:', response.error);
        return { success: false, error: 'Error de conexión' };
      }

      const data = response.data;
      
      if (!data.success) {
        return { 
          success: false, 
          error: data.error,
          needsPassword: data.needsPassword,
          remainingAttempts: data.remainingAttempts,
          locked: data.remainingAttempts === 0 || data.locked,
        };
      }

      const managerData = data.manager as Manager;
      storeSession(managerData, data.sessionToken, remember);
      
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Error de conexión' };
    }
  };

  const logout = async () => {
    // Invalidate session server-side
    if (sessionToken) {
      try {
        await supabase.functions.invoke('manager-auth', {
          body: {
            action: 'logout',
            sessionToken
          }
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
    }
    
    clearSession();
  };

  const logoutAll = async () => {
    // Invalidate ALL sessions for this manager (logout from all devices)
    if (sessionToken) {
      try {
        await supabase.functions.invoke('manager-auth', {
          body: {
            action: 'logoutAll',
            sessionToken
          }
        });
      } catch (error) {
        console.error('Logout all error:', error);
      }
    }
    
    clearSession();
  };

  const setPassword = async (managerId: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await supabase.functions.invoke('manager-auth', {
        body: {
          action: 'setPassword',
          managerId,
          newPassword: password
        }
      });

      if (response.error) {
        console.error('Set password error:', response.error);
        return { success: false, error: 'Error de conexión' };
      }

      const data = response.data;
      
      if (!data.success) {
        return { success: false, error: data.error };
      }
      
      return { success: true };
    } catch (error) {
      console.error('Set password error:', error);
      return { success: false, error: 'Error de conexión' };
    }
  };

  const getSessionToken = () => sessionToken;

  return (
    <ManagerAuthContext.Provider
      value={{
        manager,
        isAdmin: manager?.role === "admin",
        isConsulta: manager?.role === "consulta",
        isResponsable: manager?.role === "responsable",
        isAuthenticated: !!manager && !!sessionToken,
        isLoading,
        login,
        loginByEmail,
        logout,
        logoutAll,
        setPassword,
        getSessionToken,
      }}
    >
      {children}
    </ManagerAuthContext.Provider>
  );
};

export const useManagerAuth = () => {
  const context = useContext(ManagerAuthContext);
  if (!context) {
    throw new Error("useManagerAuth must be used within a ManagerAuthProvider");
  }
  return context;
};