import { useState, useEffect, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";

export type WorkerAuthState = 'initial' | 'needsRegistration' | 'needsLogin' | 'forgotPassword';

export type WorkerInfo = {
  id: string;
  name: string;
  worker_number: string;
  department_id: string;
  email?: string | null;
};

type UseWorkerAuthOptions = {
  onAuthenticated: (workerNumber: string) => void | Promise<void>;
  onSessionAlreadyValid?: (session: Session) => void | Promise<void>;
};

export function useWorkerAuth({ onAuthenticated, onSessionAlreadyValid }: UseWorkerAuthOptions) {
  const { t } = useLanguage();

  const [workerNumber, setWorkerNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [worker, setWorker] = useState<WorkerInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [authState, setAuthState] = useState<WorkerAuthState>('initial');
  const [checkingAuth, setCheckingAuth] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [workerEmail, setWorkerEmail] = useState<string | null>(null);

  // Retry-based session resolution: new sessions can take a few hundred ms to propagate
  const resolveExistingSession = useCallback(async (): Promise<Session | null> => {
    const delays = [0, 300, 900, 1600];
    for (const ms of delays) {
      if (ms > 0) await new Promise(r => setTimeout(r, ms));
      const { data: { session } } = await supabase.auth.getSession();
      if (session) return session;
    }
    return null;
  }, []);

  useEffect(() => {
    const checkExistingAuth = async () => {
      try {
        const session = await resolveExistingSession();
        if (session && onSessionAlreadyValid) {
          await onSessionAlreadyValid(session);
        }
      } catch (err) {
        console.error('Auth check error:', err);
      } finally {
        setInitialLoading(false);
      }
    };
    void checkExistingAuth();
  }, [resolveExistingSession, onSessionAlreadyValid]);

  const checkRegistration = async (workerId: string, email?: string | null) => {
    setCheckingAuth(true);
    try {
      const { data, error } = await supabase.functions.invoke("worker-auth", {
        body: { action: 'checkRegistration', workerId },
      });
      if (error) return;
      if (data?.isRegistered) {
        setAuthState('needsLogin');
        setWorkerEmail(data.workerEmailMasked ?? data.workerEmail ?? null);
      } else {
        setAuthState('needsRegistration');
        if (email) setRegisterEmail(email);
      }
    } finally {
      setCheckingAuth(false);
    }
  };

  const applySession = async (session: { access_token: string; refresh_token: string }) => {
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
  };

  const lookup = async () => {
    if (!workerNumber.trim()) {
      toast.error(t("enterWorkerNumber") || "Introduce tu número de fichar");
      return;
    }
    setLoading(true);
    setNotFound(false);
    setWorker(null);
    setAuthState('initial');
    try {
      const { data, error } = await supabase.functions.invoke("submit-vacation-request", {
        body: { action: 'lookup-worker-global', workerNumber: workerNumber.trim() },
      });
      if (error) throw error;
      if (data?.success && data.worker) {
        setWorker(data.worker);
        await checkRegistration(data.worker.id, data.worker.email);
      } else {
        setNotFound(true);
      }
    } catch {
      toast.error("Error al buscar trabajador");
    } finally {
      setLoading(false);
    }
  };

  const register = async () => {
    if (!worker) return;
    if (!registerEmail.trim()) { toast.error(t("emailRequired")); return; }
    if (password.length < 6) { toast.error(t("passwordMinLength")); return; }
    if (password !== confirmPassword) { toast.error(t("passwordsDontMatch")); return; }

    setAuthLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("worker-auth", {
        body: {
          action: "register",
          workerId: worker.id,
          email: registerEmail.trim(),
          password,
          siteUrl: window.location.origin,
        },
      });
      if (error || data?.error) {
        toast.error(data?.error || error?.message || "Error al crear cuenta");
        return;
      }

      const loginRes = await supabase.functions.invoke("worker-auth", {
        body: { action: "login", workerId: worker.id, password },
      });
      if (loginRes.error || loginRes.data?.error) {
        toast.error(loginRes.data?.error || t("invalidPassword"));
        return;
      }

      const session = loginRes.data?.session;
      if (session?.access_token && session?.refresh_token) await applySession(session);

      toast.success(t("accountCreated"));
      await onAuthenticated(worker.worker_number);
    } catch {
      toast.error("Error al crear cuenta");
    } finally {
      setAuthLoading(false);
    }
  };

  const login = async () => {
    if (!worker) return;
    if (!password.trim()) { toast.error(t("passwordPlaceholder")); return; }

    setAuthLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("worker-auth", {
        body: { action: "login", workerId: worker.id, password },
      });
      if (error || data?.error) {
        if (data?.locked) {
          toast.error(data.error || "Cuenta bloqueada temporalmente");
        } else if (data?.remainingAttempts !== undefined && data.remainingAttempts <= 2) {
          toast.error(`${data.error || t("invalidPassword")} (${data.remainingAttempts} intento${data.remainingAttempts !== 1 ? 's' : ''} restante${data.remainingAttempts !== 1 ? 's' : ''})`);
        } else {
          toast.error(data?.error || t("invalidPassword"));
        }
        return;
      }

      const session = data?.session;
      if (session?.access_token && session?.refresh_token) await applySession(session);

      if (data?.success) {
        toast.success("¡Bienvenido!");
        await onAuthenticated(worker.worker_number);
      }
    } catch {
      toast.error(t("invalidPassword"));
    } finally {
      setAuthLoading(false);
    }
  };

  const forgotPassword = async () => {
    if (!worker) return;
    setAuthLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("worker-auth", {
        body: { action: 'requestPasswordReset', workerId: worker.id, siteUrl: window.location.origin },
      });
      if (error || data?.error) { toast.error(data?.error || "Error al enviar email"); return; }
      toast.success(t("resetPasswordSent"));
      setAuthState('forgotPassword');
    } catch {
      toast.error("Error al enviar email");
    } finally {
      setAuthLoading(false);
    }
  };

  const back = () => {
    setWorker(null);
    setAuthState('initial');
    setPassword("");
    setConfirmPassword("");
    setNotFound(false);
    setWorkerNumber("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) void lookup();
  };

  return {
    workerNumber, setWorkerNumber,
    loading, initialLoading,
    worker, notFound,
    authState, setAuthState,
    checkingAuth,
    password, setPassword,
    confirmPassword, setConfirmPassword,
    registerEmail, setRegisterEmail,
    showPassword, setShowPassword,
    authLoading,
    workerEmail,
    lookup, register, login, forgotPassword, back, handleKeyPress,
  };
}
