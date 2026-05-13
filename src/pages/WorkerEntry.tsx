import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Loader2,
  Users,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
  PenLine,
  Info,
  ChevronDown,
  Clock,
  Calendar,
  Lock,
  Mail,
  Eye,
  EyeOff,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useLanguage } from "@/hooks/useLanguage";
import { HalfDayCalendar, DaySelection } from "@/components/HalfDayCalendar";
import { SignaturePad } from "@/components/SignaturePad";
import { Switch } from "@/components/ui/switch";
import { applySessionPersistencePreference, getRememberSessionPreference } from "@/lib/workerSessionPersistence";
import { format } from "date-fns";
import { es, fr, arMA } from "date-fns/locale";
import { LogoLink } from "@/components/LogoLink";
import LoadingScreen from "@/components/LoadingScreen";

type WorkerLookupResult = {
  worker: {
    id: string;
    name: string;
    worker_number: string;
    department_id: string;
    worker_team_id: string | null;
    email?: string | null;
  } | null;
  department: {
    id: string;
    name: string;
    slug: string;
    public_token: string;
    max_days_per_employee: number;
    require_all_days: boolean;
  } | null;
  workGroup: {
    id: string;
    name: string;
    color: string;
    max_free_days?: number;
  } | null;
  team: {
    id: string;
    name: string;
  } | null;
  hasPendingCorrection?: boolean;
  allDepartments?: { id: string; name: string }[];
};

type AuthState = 'initial' | 'needsRegistration' | 'needsLogin' | 'authenticated' | 'forgotPassword';

const WorkerEntryContent = () => {
  const navigate = useNavigate();
  const { t, language, isRTL } = useLanguage();
  const [workerNumber, setWorkerNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<WorkerLookupResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  
  // Initial session check
  const [checkingSession, setCheckingSession] = useState(true);

  // Session persistence preference
  const [rememberSession, setRememberSession] = useState<boolean>(() => getRememberSessionPreference());

  const handleRememberSessionChange = async (checked: boolean) => {
    setRememberSession(checked);
    await applySessionPersistencePreference(checked);
  };

  // Authentication state
  const [authState, setAuthState] = useState<AuthState>('initial');
  const [checkingAuth, setCheckingAuth] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [workerEmail, setWorkerEmail] = useState<string | null>(null);
  
  // Join request form
  const [showJoinRequest, setShowJoinRequest] = useState(false);
  const [joinName, setJoinName] = useState("");
  const [joinEmail, setJoinEmail] = useState("");
  const [submittingJoin, setSubmittingJoin] = useState(false);
  const [joinSent, setJoinSent] = useState(false);
  
  // Department correction request
  const [showCorrectionForm, setShowCorrectionForm] = useState(false);
  const [selectedCorrectionDept, setSelectedCorrectionDept] = useState("");
  const [submittingCorrection, setSubmittingCorrection] = useState(false);
  const [correctionSent, setCorrectionSent] = useState(false);

  // Exception request modal state (blocked day)
  const [showExceptionModal, setShowExceptionModal] = useState(false);
  const [exceptionDate, setExceptionDate] = useState<string | null>(null);
  const [exceptionReason, setExceptionReason] = useState("");
  const [submittingException, setSubmittingException] = useState(false);
  const [workerExceptions, setWorkerExceptions] = useState<Set<string>>(new Set());

  // Vacation form state (after worker is verified)
  const [showVacationForm, setShowVacationForm] = useState(false);
  const [availableDays, setAvailableDays] = useState<DaySelection[]>([]);
  const [blockedByConcurrency, setBlockedByConcurrency] = useState<Set<string>>(new Set());
  const [selectedDays, setSelectedDays] = useState<DaySelection[]>([]);
  const [usedDays, setUsedDays] = useState(0);
  const [maxDays, setMaxDays] = useState(0);
  const [loadingForm, setLoadingForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    workerNumber: "",
    notes: "",
  });
  const [signature, setSignature] = useState<string | null>(null);

  // Días bloqueados efectivos: si ya existe una excepción aprobada, el día deja de estar bloqueado.
  const effectiveBlockedByConcurrency = useMemo(() => {
    if (!blockedByConcurrency || blockedByConcurrency.size === 0) return blockedByConcurrency;
    const next = new Set<string>();
    blockedByConcurrency.forEach((d) => {
      if (!workerExceptions.has(d)) next.add(d);
    });
    return next;
  }, [blockedByConcurrency, workerExceptions]);

  const locale = language === "ar" ? arMA : language === "fr" ? fr : es;

  // Check for existing session on mount - if logged in, load worker data and show form directly
  useEffect(() => {
    const checkExistingSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          setCheckingSession(false);
          return;
        }

        // Get worker data via backend personal endpoint
        const { data, error } = await supabase.functions.invoke("worker-personal", {
          body: { action: "getCalendar" },
        });

        if (error || !data?.success || !data?.worker) {
          setCheckingSession(false);
          return;
        }

        const worker = data.worker;
        const department = {
          id: worker.department_id,
          name: data.departmentName || "",
          slug: data.departmentSlug || "",
          public_token: data.departmentPublicToken || "",
          max_days_per_employee: data.departmentMaxDays || 0,
          require_all_days: data.departmentRequireAllDays ?? false,
        };

        setLookupResult({
          worker,
          department,
          workGroup: data.workGroup || null,
          team: data.workerTeam || null,
        } as any);

        setAuthState("authenticated");
        setWorkerEmail(session.user.email || null);

        await loadVacationFormForExistingSession(department, worker, session.user.email);
      } catch (err) {
        console.error("Error checking existing session:", err);
        setCheckingSession(false);
      }
    };

    checkExistingSession();
  }, []);

  // Helper function to load vacation form for existing session
  const loadVacationFormForExistingSession = async (department: any, worker: any, email: string | null | undefined) => {
    setLoadingForm(true);

    try {
      // Check used days for this worker
      const { data: checkData } = await supabase.functions.invoke("submit-vacation-request", {
        body: {
          action: 'check-used-days',
          departmentId: department.id,
          workerNumber: worker.worker_number,
        }
      });

      if (checkData?.success) {
        if (checkData.hasPendingRequest) {
          toast.info("Ya tienes una solicitud pendiente de revisión");
          setCheckingSession(false);
          setLoadingForm(false);
          return;
        }

        if (checkData.usedDays >= checkData.maxDays) {
          toast.info(`Ya has usado todos tus días de vacaciones (${checkData.maxDays})`);
          setCheckingSession(false);
          setLoadingForm(false);
          return;
        }

        setUsedDays(checkData.usedDays || 0);
        setMaxDays(checkData.maxDays || 0);
      }

      // Fetch available dates via edge function (secure)
      const availResponse = await supabase.functions.invoke("submit-vacation-request", {
        body: {
          action: 'get-department-availability',
          departmentId: department.id,
        }
      });

      if (availResponse.error || !availResponse.data?.success) {
        toast.error("Error al cargar fechas disponibles");
        setCheckingSession(false);
        setLoadingForm(false);
        return;
      }

      let days: DaySelection[] = (availResponse.data.availabilities || []).map((item: any) => ({
        date: item.date,
        halfDay: item.half_day || false,
      }));

      // Fetch worker's personal availability (days unlocked by admin modifications)
      try {
        const personalAvailResponse = await supabase.functions.invoke("submit-vacation-request", {
          body: {
            action: 'get-worker-personal-availability',
            departmentId: department.id,
            workerNumber: worker.worker_number,
          }
        });
        if (personalAvailResponse.data?.success && personalAvailResponse.data?.unlockedDays) {
          const unlockedDays = personalAvailResponse.data.unlockedDays as string[];
          if (unlockedDays.length > 0) {
            const existingDates = new Set(days.map(d => d.date));
            const newDays = unlockedDays
              .filter(date => !existingDates.has(date))
              .map(date => ({ date, halfDay: false }));
            if (newDays.length > 0) {
              console.log(`Added ${newDays.length} personal unlocked days for worker ${worker.worker_number}`);
              days = [...days, ...newDays];
            }
          }
        }
      } catch (err) {
        console.error("Error fetching personal availability:", err);
      }

      setAvailableDays(days);

      // Fetch blocked days due to concurrency limits
      try {
        const blockedResponse = await supabase.functions.invoke("submit-vacation-request", {
          body: {
            action: 'get-blocked-days-by-concurrency',
            departmentId: department.id,
            workerNumber: worker.worker_number,
          }
        });
        if (blockedResponse.data?.success && blockedResponse.data?.blockedDays) {
          setBlockedByConcurrency(new Set(blockedResponse.data.blockedDays));
        }
      } catch (err) {
        console.error("Error fetching blocked days:", err);
      }

      await fetchWorkerExceptionsForSession(department.id, worker.worker_number);

      // Pre-fill form data with authenticated email
      setFormData({
        name: worker.name,
        email: email || "",
        workerNumber: worker.worker_number,
        notes: "",
      });

      setShowVacationForm(true);
    } catch (err) {
      console.error("Error loading vacation form:", err);
      toast.error("Error al cargar el formulario");
    } finally {
      setLoadingForm(false);
      setCheckingSession(false);
    }
  };

  const fetchWorkerExceptionsForSession = async (departmentId: string, workerNum: string) => {
    try {
      const { data } = await supabase.functions.invoke("submit-vacation-request", {
        body: {
          action: "check-worker-exceptions",
          departmentId,
          workerNumber: workerNum,
        },
      });

      if (data?.success && data.exceptions) {
        setWorkerExceptions(new Set(data.exceptions.map((e: any) => e.exception_date)));
      }
    } catch (err) {
      console.error("Error fetching worker exceptions:", err);
    }
  };

  const handleLookup = async () => {
    if (!workerNumber.trim()) {
      toast.error("Introduce tu número de fichar");
      return;
    }

    setLoading(true);
    setNotFound(false);
    setLookupResult(null);
    setShowJoinRequest(false);
    setAuthState('initial');

    try {
      const { data, error } = await supabase.functions.invoke("submit-vacation-request", {
        body: {
          action: 'lookup-worker-global',
          workerNumber: workerNumber.trim(),
        }
      });

      if (error) {
        throw error;
      }

      if (data?.success && data.worker) {
        setLookupResult({
          worker: data.worker,
          department: data.department,
          workGroup: data.workGroup,
          team: data.team,
          hasPendingCorrection: data.hasPendingCorrection,
          allDepartments: data.allDepartments,
        });
        
        // Check if worker is registered
        await checkWorkerRegistration(data.worker.id, data.worker.email);
      } else {
        setNotFound(true);
      }
    } catch (err) {
      console.error("Error looking up worker:", err);
      toast.error("Error al buscar trabajador");
    } finally {
      setLoading(false);
    }
  };
  
  const checkWorkerRegistration = async (workerId: string, email?: string | null) => {
    setCheckingAuth(true);
    try {
      const { data, error } = await supabase.functions.invoke("worker-auth", {
        body: {
          action: 'checkRegistration',
          workerId
        }
      });
      
      if (error) {
        console.error("Error checking registration:", error);
        setCheckingAuth(false);
        return;
      }
      
      if (data?.isRegistered) {
        setAuthState('needsLogin');
        setWorkerEmail(data.workerEmailMasked ?? null);
      } else {
        setAuthState('needsRegistration');
        if (email) {
          setRegisterEmail(email);
        }
      }
    } catch (err) {
      console.error("Error checking registration:", err);
    } finally {
      setCheckingAuth(false);
    }
  };
  
  const handleRegister = async () => {
    if (!lookupResult?.worker) return;
    
    if (!registerEmail.trim()) {
      toast.error(t("emailRequired"));
      return;
    }
    
    if (password.length < 6) {
      toast.error(t("passwordMinLength"));
      return;
    }
    
    if (password !== confirmPassword) {
      toast.error(t("passwordsDontMatch"));
      return;
    }
    
    setAuthLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("worker-auth", {
        body: {
          action: 'register',
          workerId: lookupResult.worker.id,
          email: registerEmail.trim(),
          password,
          siteUrl: window.location.origin
        }
      });
      
      if (error) {
        console.error("Register error:", error);
        const errorMsg = error.message || "Error al crear cuenta";
        toast.error(errorMsg);
        return;
      }
      
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      
      toast.success(t("accountCreated"));
      setWorkerEmail(registerEmail);
      
      // After registration, login to get session and save it
      const { data: loginData } = await supabase.functions.invoke("worker-auth", {
        body: {
          action: 'login',
          workerId: lookupResult.worker.id,
          password
        }
      });
      
      if (loginData?.success && loginData?.session) {
        await supabase.auth.setSession({
          access_token: loginData.session.access_token,
          refresh_token: loginData.session.refresh_token,
        });
        await applySessionPersistencePreference(rememberSession);
      }
      
      setAuthState('authenticated');
      
      // Load vacation form instead of redirecting
      await handleContinue(registerEmail);
    } catch (err) {
      console.error("Error registering:", err);
      toast.error("Error al crear cuenta");
    } finally {
      setAuthLoading(false);
    }
  };
  
  const handleLogin = async (skipLoading = false) => {
    if (!lookupResult?.worker) return;
    
    if (!password.trim()) {
      toast.error(t("passwordPlaceholder"));
      return;
    }
    
    if (!skipLoading) setAuthLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("worker-auth", {
        body: {
          action: 'login',
          workerId: lookupResult.worker.id,
          password
        }
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
      
      if (data?.success) {
        // Save session to supabase.auth so worker-personal can use it
        if (data.session) {
          await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
          await applySessionPersistencePreference(rememberSession);
        }
        
        setAuthState('authenticated');
        const email = data.worker?.email || workerEmail;
        setWorkerEmail(email);
        
        // Check if worker is admin - redirect to admin panel
        if (data.worker?.isAdmin) {
          toast.success("Bienvenido, administrador");
          navigate('/admin/vacation-request');
          return;
        }
        
        // Load vacation form instead of redirecting
        toast.success("¡Bienvenido!");
        await handleContinue(email);
      }
    } catch (err) {
      console.error("Error logging in:", err);
      toast.error(t("invalidPassword"));
    } finally {
      if (!skipLoading) setAuthLoading(false);
    }
  };
  
  const handleForgotPassword = async () => {
    if (!lookupResult?.worker) return;
    
    setAuthLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("worker-auth", {
        body: {
          action: 'requestPasswordReset',
          workerId: lookupResult.worker.id,
          siteUrl: window.location.origin
        }
      });
      
      if (error || data?.error) {
        toast.error(data?.error || "Error al enviar email");
        return;
      }
      
      toast.success(t("resetPasswordSent"));
      setAuthState('forgotPassword');
    } catch (err) {
      console.error("Error requesting password reset:", err);
      toast.error("Error al enviar email");
    } finally {
      setAuthLoading(false);
    }
  };

  const fetchWorkerExceptions = async (departmentId: string, workerNum: string) => {
    try {
      const { data } = await supabase.functions.invoke("submit-vacation-request", {
        body: {
          action: "check-worker-exceptions",
          departmentId,
          workerNumber: workerNum,
        },
      });

      if (data?.success && data.exceptions) {
        setWorkerExceptions(new Set(data.exceptions.map((e: any) => e.exception_date)));
      }
    } catch (err) {
      console.error("Error fetching worker exceptions:", err);
    }
  };

  const handleBlockedDayClick = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");

    if (workerExceptions.has(dateStr)) {
      toast.info("Ya tienes aprobada una excepción para este día");
      return;
    }

    setExceptionDate(dateStr);
    setExceptionReason("");
    setShowExceptionModal(true);
  };

  const handleSubmitExceptionRequest = async () => {
    if (!lookupResult?.department || !lookupResult?.worker || !exceptionDate || !exceptionReason.trim()) {
      toast.error("Completa todos los campos");
      return;
    }

    setSubmittingException(true);
    try {
      const { data } = await supabase.functions.invoke("submit-vacation-request", {
        body: {
          action: "submit-day-exception-request",
          departmentId: lookupResult.department.id,
          workerNumber: lookupResult.worker.worker_number,
          workerName: lookupResult.worker.name,
          workerEmail: workerEmail || null,
          requestDate: exceptionDate,
          reason: exceptionReason.trim(),
        },
      });

      if (data?.success) {
        toast.success("Solicitud enviada. El encargado revisará tu petición.");
        setShowExceptionModal(false);
        setExceptionDate(null);
        setExceptionReason("");
        await fetchWorkerExceptions(lookupResult.department.id, lookupResult.worker.worker_number);
      } else {
        toast.error(data?.error || "Error al enviar solicitud");
      }
    } catch (err) {
      console.error("Error submitting exception request:", err);
      toast.error("Error al enviar solicitud");
    } finally {
      setSubmittingException(false);
    }
  };

  const handleContinue = async (email?: string | null) => {
    if (!lookupResult?.department || !lookupResult?.worker) return;

    setLoadingForm(true);

    try {
      // Check used days for this worker
      const { data: checkData } = await supabase.functions.invoke("submit-vacation-request", {
        body: {
          action: 'check-used-days',
          departmentId: lookupResult.department.id,
          workerNumber: lookupResult.worker.worker_number,
        }
      });

      if (checkData?.success) {
        if (checkData.hasPendingRequest) {
          toast.error("Ya tienes una solicitud pendiente de revisión");
          setLoadingForm(false);
          return;
        }

        if (checkData.usedDays >= checkData.maxDays) {
          toast.error(`Ya has usado todos tus días de vacaciones (${checkData.maxDays})`);
          setLoadingForm(false);
          return;
        }

        setUsedDays(checkData.usedDays || 0);
        setMaxDays(checkData.maxDays || 0);
      }

      // Fetch available dates for this department via edge function (security: no direct table access)
      let days: DaySelection[] = [];
      try {
        const { data: availResponse, error: availError } = await supabase.functions.invoke("submit-vacation-request", {
          body: {
            action: 'get-department-availability',
            departmentId: lookupResult.department.id,
          }
        });

        if (availError || !availResponse?.success) {
          toast.error("Error al cargar fechas disponibles");
          setLoadingForm(false);
          return;
        }

        days = (availResponse.availabilities || []).map((item: { date: string; half_day?: boolean }) => ({
          date: item.date,
          halfDay: item.half_day || false,
        }));
      } catch (err) {
        console.error('Error fetching department availability:', err);
        toast.error("Error al cargar fechas disponibles");
        setLoadingForm(false);
        return;
      }

      // Fetch worker's personal availability (days unlocked by admin modifications)
      try {
        const personalAvailResponse = await supabase.functions.invoke("submit-vacation-request", {
          body: {
            action: 'get-worker-personal-availability',
            departmentId: lookupResult.department.id,
            workerNumber: lookupResult.worker.worker_number,
          }
        });
        if (personalAvailResponse.data?.success && personalAvailResponse.data?.unlockedDays) {
          const unlockedDays = personalAvailResponse.data.unlockedDays as string[];
          if (unlockedDays.length > 0) {
            const existingDates = new Set(days.map(d => d.date));
            const newDays = unlockedDays
              .filter(date => !existingDates.has(date))
              .map(date => ({ date, halfDay: false }));
            if (newDays.length > 0) {
              console.log(`Added ${newDays.length} personal unlocked days for worker ${lookupResult.worker.worker_number}`);
              days = [...days, ...newDays];
            }
          }
        }
      } catch (err) {
        console.error("Error fetching personal availability:", err);
      }

      setAvailableDays(days);

      // Fetch blocked days due to concurrency limits
      try {
        const blockedResponse = await supabase.functions.invoke("submit-vacation-request", {
          body: {
            action: 'get-blocked-days-by-concurrency',
            departmentId: lookupResult.department.id,
            workerNumber: lookupResult.worker.worker_number,
          }
        });
        if (blockedResponse.data?.success && blockedResponse.data?.blockedDays) {
          setBlockedByConcurrency(new Set(blockedResponse.data.blockedDays));
        }
      } catch (err) {
        console.error("Error fetching blocked days:", err);
      }

      await fetchWorkerExceptions(lookupResult.department.id, lookupResult.worker.worker_number);

      // Pre-fill form data with authenticated email
      setFormData({
        name: lookupResult.worker.name,
        email: email || workerEmail || "",
        workerNumber: lookupResult.worker.worker_number,
        notes: "",
      });

      setShowVacationForm(true);
    } catch (err) {
      console.error("Error loading vacation form:", err);
      toast.error("Error al cargar el formulario");
    } finally {
      setLoadingForm(false);
    }
  };

  const handleSubmitJoinRequest = async () => {
    if (!joinName.trim() || !joinEmail.trim()) {
      toast.error("Completa todos los campos");
      return;
    }

    setSubmittingJoin(true);
    try {
      const { data: result } = await supabase.functions.invoke("submit-vacation-request", {
        body: {
          action: 'request-join-group-global',
          workerNumber: workerNumber.trim(),
          workerName: joinName.trim(),
          workerEmail: joinEmail.trim(),
        }
      });

      if (result?.success) {
        setJoinSent(true);
        toast.success("Solicitud enviada correctamente");
      } else {
        toast.error(result?.error || "Error al enviar solicitud");
      }
    } catch (err) {
      console.error("Error submitting join request:", err);
      toast.error("Error al enviar solicitud");
    } finally {
      setSubmittingJoin(false);
    }
  };

  const handleSubmitCorrectionRequest = async () => {
    if (!lookupResult?.worker || !lookupResult?.department || !selectedCorrectionDept) {
      toast.error(t("completeAllFields"));
      return;
    }

    if (selectedCorrectionDept === lookupResult.department.id) {
      toast.error("Selecciona un departamento diferente");
      return;
    }

    setSubmittingCorrection(true);
    try {
      const { data: result } = await supabase.functions.invoke("submit-vacation-request", {
        body: {
          action: 'submit-department-correction',
          workerId: lookupResult.worker.id,
          currentDepartmentId: lookupResult.department.id,
          requestedDepartmentId: selectedCorrectionDept,
          workerNumber: lookupResult.worker.worker_number,
          workerName: lookupResult.worker.name,
        }
      });

      if (result?.success) {
        setCorrectionSent(true);
        setLookupResult({
          ...lookupResult,
          hasPendingCorrection: true,
        });
        toast.success(t("correctionRequestSent"));
      } else {
        toast.error(result?.error || t("errorSendingCorrectionRequest"));
      }
    } catch (err) {
      console.error("Error submitting correction request:", err);
      toast.error(t("errorSendingCorrectionRequest"));
    } finally {
      setSubmittingCorrection(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleLookup();
    }
  };
  
  const handleBack = () => {
    setShowVacationForm(false);
    setSelectedDays([]);
    setSignature(null);
  };

  // Calculate total selected days (half days = 0.5)
  const totalSelectedDays = selectedDays.reduce((acc, d) => acc + (d.halfDay ? 0.5 : 1), 0);
  
  // Count selected Mondays and Fridays (0 = Sunday, 1 = Monday, 5 = Friday)
  const selectedMondays = selectedDays.filter(d => new Date(d.date + 'T00:00:00').getDay() === 1).length;
  const selectedFridays = selectedDays.filter(d => new Date(d.date + 'T00:00:00').getDay() === 5).length;

  const handleDayClick = (date: Date, halfDay: boolean, action: 'add' | 'remove' | 'convert') => {
    if (!lookupResult?.department) return;

    const dateStr = format(date, 'yyyy-MM-dd');
    const isBlocked = effectiveBlockedByConcurrency.has(dateStr);
    const availableDay = availableDays.find(d => d.date === dateStr);

    // If the day is blocked (red), it cannot be selected until it has an approved exception.
    // Clicking it will open the "Solicitar excepción" dialog.
    if (isBlocked && action === 'add') {
      // Ensure it never gets marked as selected in any edge case
      setSelectedDays((prev) => prev.filter((d) => d.date !== dateStr));
      handleBlockedDayClick(date);
      return;
    }

    if (!availableDay && !isBlocked) {
      toast.error("Esta fecha no está disponible");
      return;
    }
    const remainingDays = maxDays - usedDays;
    const currentHalfDays = selectedDays.filter(d => d.halfDay).length;
    
    // Check Monday/Friday limits
    const dayOfWeek = date.getDay();
    const isMonday = dayOfWeek === 1;
    const isFriday = dayOfWeek === 5;
    
    if (action === 'add') {
      // Enforce Monday/Friday limits
      if (isMonday && selectedMondays >= 1) {
        toast.error(t("maxMondaysReached"));
        return;
      }
      if (isFriday && selectedFridays >= 1) {
        toast.error(t("maxFridaysReached"));
        return;
      }
      
      const addValue = halfDay ? 0.5 : 1;
      if (totalSelectedDays + addValue > remainingDays) {
        toast.error(`Solo puedes seleccionar ${remainingDays} días más`);
        return;
      }
      if (halfDay && currentHalfDays >= 1) {
        toast.error("Solo puedes seleccionar un máximo de 1 medio día");
        return;
      }
      setSelectedDays([...selectedDays, { date: dateStr, halfDay }]);
    } else if (action === 'convert') {
      if (halfDay && currentHalfDays >= 1) {
        toast.error("Solo puedes seleccionar un máximo de 1 medio día");
        return;
      }
      setSelectedDays(selectedDays.map(d => 
        d.date === dateStr ? { ...d, halfDay } : d
      ));
    } else if (action === 'remove') {
      setSelectedDays(selectedDays.filter(d => d.date !== dateStr));
    }
  };

  const handleSubmitVacation = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!lookupResult?.department) return;

    // Detailed validation with specific error messages
    const missingFields: string[] = [];
    if (!formData.name.trim()) missingFields.push(t("fullName") || "Nombre");
    if (!formData.email.trim()) missingFields.push(t("email") || "Email");
    if (!formData.workerNumber.trim()) missingFields.push(t("workerNumber") || "Número de empleado");
    if (!signature) missingFields.push(t("signature") || "Firma (pulsa 'Confirmar firma' después de firmar)");
    
    if (missingFields.length > 0) {
      toast.error(`${t("errorMissingFields") || "Faltan campos obligatorios"}: ${missingFields.join(", ")}`, {
        duration: 5000,
      });
      return;
    }

    const remainingDays = maxDays - usedDays;
    
    if (lookupResult.department.require_all_days) {
      if (totalSelectedDays !== remainingDays) {
        toast.error(`Debes seleccionar exactamente ${remainingDays} días`);
        return;
      }
    } else {
      if (selectedDays.length === 0) {
        toast.error("Debes seleccionar al menos 1 día");
        return;
      }
      if (totalSelectedDays > remainingDays) {
        toast.error(`Solo puedes seleccionar hasta ${remainingDays} días más`);
        return;
      }
    }

    setSubmitting(true);

    try {
      const { data: result, error: submitError } = await supabase.functions.invoke("submit-vacation-request", {
        body: {
          token: lookupResult.department.public_token,
          employeeName: formData.name.trim(),
          employeeEmail: formData.email.trim(),
          workerNumber: formData.workerNumber.trim(),
          notes: formData.notes?.trim() || null,
          signature: signature,
          selectedDates: selectedDays.map(d => ({ date: d.date, halfDay: d.halfDay })),
        }
      });

      if (submitError) {
        console.error("Submit error:", submitError);
        toast.error("Error al enviar la solicitud");
        setSubmitting(false);
        return;
      }

      if (!result?.success) {
        // Handle blocked days from server
        const serverBlocked = Array.isArray((result as any)?.blockedDates) ? ((result as any).blockedDates as string[]) : null;
        if (serverBlocked && serverBlocked.length > 0) {
          setBlockedByConcurrency((prev) => {
            const next = new Set(prev);
            serverBlocked.forEach((d) => next.add(d));
            return next;
          });
          setSelectedDays((prev) => prev.filter((d) => !serverBlocked.includes(d.date)));
          setSubmitting(false);
          return;
        }
        toast.error(result?.error || "Error al enviar la solicitud");
        setSubmitting(false);
        return;
      }

      // Emails are now sent server-side by the submit-vacation-request edge function

      setSubmitted(true);
      toast.success("Solicitud enviada correctamente");
    } catch (err) {
      console.error("Error submitting vacation request:", err);
      toast.error("Error al enviar la solicitud");
    } finally {
      setSubmitting(false);
    }
  };

  // Show loading screen while checking for existing session
  if (checkingSession) {
    return <LoadingScreen />;
  }

  // Render vacation form
  if (showVacationForm && lookupResult?.department && lookupResult?.worker) {
    const remainingDays = maxDays - usedDays;
    
    if (submitted) {
      return (
        <div className="min-h-screen bg-background flex flex-col" dir={isRTL ? "rtl" : "ltr"}>
          {/* Header */}
          <div className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur-sm">
            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <LogoLink to="/vacaciones" className="h-8 w-8 flex-shrink-0 object-contain" />
                  <span className="text-sm sm:text-base font-semibold text-foreground truncate">
                    {t("vacationRequest")}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <LanguageSelector />
                  <ThemeToggle />
                </div>
              </div>

              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 text-xs sm:text-sm w-full"
                  onClick={() => navigate("/mi-horario")}
                >
                  <Clock className="h-3.5 w-3.5 mr-1.5" />
                  {t("mySchedule")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 text-xs sm:text-sm w-full"
                  onClick={() => {
                    const wn = lookupResult?.worker?.worker_number || workerNumber;
                    window.open(`https://salix.verdnatura.es/#/worker/${wn}/calendar`, '_blank');
                  }}
                >
                  <Calendar className="h-3.5 w-3.5 mr-1.5" />
                  {t("myCalendar")}
                </Button>
              </div>
            </div>
          </div>
          
          <main className="flex-1 flex items-center justify-center p-4">
            <Card className="w-full max-w-md shadow-xl border-border/50">
              <CardContent className="pt-8 pb-6 text-center">
                <div className="mx-auto w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle className="h-10 w-10 text-primary" />
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">{t("requestSubmitted")}</h2>
                <p className="text-muted-foreground mb-4">
                  {t("requestSubmittedDesc")}
                </p>
                <p className="text-sm text-muted-foreground">
                  <strong>{totalSelectedDays}</strong> {t("daysRequested")}
                </p>
              </CardContent>
            </Card>
          </main>
          
          <footer className="border-t border-border py-4">
            <div className="container mx-auto px-4 text-center text-xs text-muted-foreground">
              Verdnatura © {new Date().getFullYear()}
            </div>
          </footer>
        </div>
      );
    }
    
    return (
      <div className="min-h-screen bg-background flex flex-col" dir={isRTL ? "rtl" : "ltr"}>
        {/* Header */}
        <div className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur-sm">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleBack}
                  className="h-9 w-9 flex-shrink-0"
                  aria-label={t("back") || "Volver"}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <LogoLink to="/vacaciones" className="h-8 w-8 flex-shrink-0 object-contain" />
                <span className="text-sm sm:text-base font-semibold text-foreground truncate">
                  {t("vacationRequest")}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <LanguageSelector />
                <ThemeToggle />
              </div>
            </div>

            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3 text-xs sm:text-sm w-full"
                onClick={() => navigate("/mi-horario")}
              >
                <Clock className="h-3.5 w-3.5 mr-1.5" />
                {t("mySchedule")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3 text-xs sm:text-sm w-full"
                onClick={() => {
                  const wn = lookupResult?.worker?.worker_number || workerNumber;
                  window.open(`https://salix.verdnatura.es/#/worker/${wn}/calendar`, '_blank');
                }}
              >
                <Calendar className="h-3.5 w-3.5 mr-1.5" />
                {t("myCalendar")}
              </Button>
            </div>
          </div>
        </div>
        
        <main className="flex-1 container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-lg">
          {/* Worker info banner - Clean vertical layout for mobile */}
          <Card className="mb-4 border-primary/30 bg-primary/5">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="font-semibold text-foreground">{lookupResult.worker.name}</span>
                <span className="text-muted-foreground text-sm">•</span>
                <span className="text-sm text-muted-foreground">Nº {lookupResult.worker.worker_number}</span>
              </div>
              {(lookupResult.team || lookupResult.workGroup) && (
                <div className="flex items-center gap-3 text-sm">
                  {lookupResult.team && (
                    <span className="text-muted-foreground">{lookupResult.team.name}</span>
                  )}
                  {lookupResult.workGroup && (
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: lookupResult.workGroup.color }} />
                      <span className="text-muted-foreground">{lookupResult.workGroup.name}</span>
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Days summary */}
          <Card className="mb-4">
            <CardContent className="py-3 px-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">{t("availableDays")}:</span>
                <span className="font-semibold text-primary">{remainingDays} {t("days")}</span>
              </div>
              <div className="flex justify-between items-center text-sm mt-1">
                <span className="text-muted-foreground">{t("selectedDays")}:</span>
                <span className={totalSelectedDays > 0 ? "font-semibold text-foreground" : "text-muted-foreground"}>
                  {totalSelectedDays} {t("days")}
                </span>
              </div>
            </CardContent>
          </Card>
          
          {/* Calendar */}
          <Card className="mb-4">
            <CardHeader className="pb-2 px-4">
              <CardTitle className="text-base sm:text-lg">{t("selectYourVacationDays")}</CardTitle>
              <CardDescription className="text-sm">
                {t("clickAvailableDays")}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-2 sm:px-4">
              <HalfDayCalendar
                availableDays={availableDays}
                blockedDays={effectiveBlockedByConcurrency}
                approvedExceptionDays={workerExceptions}
                selectedDays={selectedDays}
                onDayClick={handleDayClick}
                onBlockedDayClick={handleBlockedDayClick}
                locale={locale}
                showFridayNotice={false}
                disableWeekends={true}
                t={t}
                disabled={(date) => !availableDays.some(
                  d => d.date === format(date, 'yyyy-MM-dd')
                )}
              />
              {/* Legend */}
              <div className="mt-3 flex flex-wrap justify-center gap-2 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--calendar-available))] flex-shrink-0"></div>
                  <span className="text-muted-foreground">{t("available")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--calendar-selected))] flex-shrink-0"></div>
                  <span className="text-muted-foreground">{t("fullDay")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--calendar-half-day))] flex-shrink-0"></div>
                  <span className="text-muted-foreground">{t("halfDay")}</span>
                </div>
                {effectiveBlockedByConcurrency.size > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-destructive flex-shrink-0"></div>
                    <span className="text-muted-foreground">{t("notAvailable")}</span>
                  </div>
                )}
              </div>

              {/* Blocked day instructions */}
              {effectiveBlockedByConcurrency.size > 0 && (
                <div className="mt-3">
                  <Alert className="p-3 [&>svg]:left-3 [&>svg]:top-3 [&>svg~*]:pl-6">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <AlertTitle className="text-xs">
                      {t("blockedDaysHelpTitle") !== "blockedDaysHelpTitle"
                        ? t("blockedDaysHelpTitle")
                        : "Días rojos (bloqueados)"}
                    </AlertTitle>
                    <AlertDescription className="text-[11px]">
                      {t("blockedDaysHelpDesc") !== "blockedDaysHelpDesc"
                        ? t("blockedDaysHelpDesc")
                        : "No puedes seleccionarlos. Pulsa el día rojo y envía el motivo en “Solicitar excepción”."}
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              {/* Monday/Friday limit notice */}
              <div className="mt-4 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-0.5">{t("mondayFridayLimitTitle")}</p>
                    <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80">
                      {t("mondayFridayLimitDesc")}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Dialog open={showExceptionModal} onOpenChange={setShowExceptionModal}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Solicitar excepción</DialogTitle>
                <DialogDescription>
                  {exceptionDate ? `Día: ${exceptionDate}` : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <Label htmlFor="exceptionReason">Motivo *</Label>
                <Textarea
                  id="exceptionReason"
                  value={exceptionReason}
                  onChange={(e) => setExceptionReason(e.target.value)}
                  placeholder="Explica por qué necesitas ese día"
                  className="min-h-[110px]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowExceptionModal(false)}
                  disabled={submittingException}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  onClick={handleSubmitExceptionRequest}
                  disabled={submittingException}
                >
                  {submittingException ? "Enviando..." : "Enviar"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Form */}
          <form onSubmit={handleSubmitVacation}>
            <Card className="mb-4">
              <CardHeader className="pb-2 px-4">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <PenLine className="h-4 w-4 text-primary" />
                  {t("contactData")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm">{t("fullNameRequired")} *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    disabled
                    className="bg-muted h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workerNumber" className="text-sm">{t("workerNumberRequired")} *</Label>
                  <Input
                    id="workerNumber"
                    value={formData.workerNumber}
                    disabled
                    className="bg-muted h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm">{t("emailRequired")} *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    disabled
                    className="bg-muted h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes" className="text-sm">{t("observationsOptional")}</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder={t("additionalNotes")}
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>
            
            {/* Signature */}
            <Card className="mb-4">
              <CardHeader className="pb-2 px-4">
                <CardTitle className="text-base sm:text-lg">{t("signatureRequired")} *</CardTitle>
                <CardDescription className="text-sm">{t("drawSignature")}</CardDescription>
              </CardHeader>
              <CardContent className="px-4">
                <SignaturePad onSignatureChange={setSignature} />
              </CardContent>
            </Card>
            
            {/* Missing fields indicator */}
            {(() => {
              const issues: string[] = [];
              if (selectedDays.length === 0) issues.push(t("selectDays") || "Selecciona días");
              if (!signature) issues.push(t("confirmSignature") || "Confirma tu firma");
              
              if (issues.length > 0 && !submitting) {
                return (
                  <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">
                      ⚠️ {t("beforeSubmitting") || "Antes de enviar"}:
                    </p>
                    <ul className="mt-1 text-xs text-amber-600 dark:text-amber-400 list-disc list-inside">
                      {issues.map((issue, i) => <li key={i}>{issue}</li>)}
                    </ul>
                  </div>
                );
              }
              return null;
            })()}
            
            {/* Submit button */}
            <Button
              type="submit"
              className="w-full h-11"
              disabled={
                submitting ||
                !signature ||
                !formData.email.trim() ||
                (lookupResult.department.require_all_days 
                  ? totalSelectedDays !== remainingDays 
                  : selectedDays.length === 0)
              }
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {t("sending")}
                </>
              ) : (
                t("submitVacationRequest")
              )}
            </Button>
          </form>
        </main>
        
        <footer className="border-t border-border py-3 mt-4">
          <div className="container mx-auto px-4 text-center text-xs text-muted-foreground">
            Verdnatura © {new Date().getFullYear()}
          </div>
        </footer>
      </div>
    );
  }

  if (loadingForm) {
    return <LoadingScreen />;
  }

  return (
    <div 
      className="min-h-screen bg-background flex flex-col"
      dir={isRTL ? "rtl" : "ltr"}
    >
      {/* Header */}
      <div className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur-sm">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <LogoLink to="/vacaciones" className="h-8 w-8 flex-shrink-0 object-contain" />
              <span className="text-sm sm:text-base font-semibold text-foreground truncate">
                {t("vacationRequest")}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <LanguageSelector />
              <ThemeToggle />
            </div>
          </div>

          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 text-xs sm:text-sm w-full"
              onClick={() => navigate("/mi-horario")}
            >
              <Clock className="h-3.5 w-3.5 mr-1.5" />
              {t("mySchedule")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 text-xs sm:text-sm w-full"
              onClick={() => {
                const wn = lookupResult?.worker?.worker_number || workerNumber;
                window.open(`https://salix.verdnatura.es/#/worker/${wn}/calendar`, '_blank');
              }}
            >
              <Calendar className="h-3.5 w-3.5 mr-1.5" />
              {t("myCalendar")}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-3 py-4 sm:p-4">
        <Card className="w-full max-w-md shadow-xl border-border/50 overflow-hidden">
          <CardHeader className="text-center pb-4 px-4 sm:px-6">
            <div className="flex justify-center mb-3">
              <LogoLink to="/" className="h-14 w-14 object-contain" />
            </div>
            <CardTitle className="text-xl sm:text-2xl">{t("workerEntryTitle")}</CardTitle>
            <CardDescription className="text-sm">
              {t("workerEntrySubtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 px-4 sm:px-6">
            {/* Worker number input */}
            <div className="space-y-2">
              <Label htmlFor="workerNumber">{t("workerNumber")}</Label>
              <Input
                id="workerNumber"
                type="text"
                placeholder="Ej: 1234"
                value={workerNumber}
                onChange={(e) => setWorkerNumber(e.target.value)}
              />
            </div>

            {/* Remember session */}
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
              <div className="space-y-0.5">
                <div className="text-sm font-medium text-foreground">{t("keepSessionActive")}</div>
                <div className="text-xs text-muted-foreground">{t("keepSessionActiveDesc")}</div>
              </div>
              <Switch checked={rememberSession} onCheckedChange={handleRememberSessionChange} />
            </div>

            {/* Only show continue button if worker not found yet */}
            {!lookupResult?.worker && (
              <Button 
                onClick={handleLookup} 
                disabled={loading || !workerNumber.trim()}
                className="w-full h-12"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    {t("searchingWorker")}
                  </>
                ) : (
                  t("continue")
                )}
              </Button>
            )}

            {/* Worker found - show info and authentication */}
            {lookupResult?.worker && !lookupResult.hasPendingCorrection && (
              <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3 animate-fade-in">
                {/* Show loading skeleton while checking auth */}
                {checkingAuth ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 text-primary animate-spin" />
                      <span className="text-primary font-medium text-sm">{t("loading")}...</span>
                    </div>
                    <div className="space-y-2">
                      <div className="h-4 bg-primary/10 rounded animate-pulse w-3/4" />
                      <div className="h-4 bg-primary/10 rounded animate-pulse w-2/3" />
                      <div className="h-4 bg-primary/10 rounded animate-pulse w-1/2" />
                    </div>
                    <div className="pt-3 border-t border-border/50 space-y-3">
                      <div className="h-4 bg-primary/10 rounded animate-pulse w-1/3" />
                      <div className="h-9 bg-primary/10 rounded animate-pulse" />
                      <div className="h-9 bg-primary/10 rounded animate-pulse" />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-primary">
                      <CheckCircle className="h-5 w-5" />
                      <span className="font-semibold">{t("workerFound")}</span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("name")}:</span>
                        <span className="font-medium">{lookupResult.worker.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("department")}</span>
                        <span className="font-medium">{lookupResult.department?.name}</span>
                      </div>
                      {lookupResult.team && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t("team")}:</span>
                          <span className="font-medium">{lookupResult.team.name}</span>
                        </div>
                      )}
                      {lookupResult.workGroup && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">{t("vacationGroup")}:</span>
                          <span className="font-medium flex items-center gap-2">
                            <span 
                              className="w-4 h-4 rounded-full inline-block" 
                              style={{ backgroundColor: lookupResult.workGroup.color }}
                            />
                            {lookupResult.workGroup.name}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {/* Registration form for first-time users */}
                    {authState === 'needsRegistration' && !correctionSent && (
                  <div className="pt-3 border-t border-border/50 space-y-3 animate-fade-in">
                    <div className="flex items-center gap-2 text-primary">
                      <Lock className="h-4 w-4" />
                      <span className="font-medium text-sm">{t("firstTimeSetup")}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("firstTimeSetupDesc")}</p>
                    
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label htmlFor="registerEmail" className="text-xs">{t("email")} *</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="registerEmail"
                            type="email"
                            value={registerEmail}
                            onChange={(e) => setRegisterEmail(e.target.value)}
                            placeholder={t("emailPlaceholder")}
                            className="pl-9"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="password" className="text-xs">{t("password")} *</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={t("passwordPlaceholder")}
                            className="pl-9 pr-9"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="confirmPassword" className="text-xs">{t("confirmPassword")} *</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="confirmPassword"
                            type={showPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder={t("confirmPassword")}
                            className="pl-9"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{t("passwordMinLength")}</p>
                    </div>
                    
                    <Button 
                      onClick={handleRegister} 
                      disabled={authLoading || !registerEmail.trim() || password.length < 6 || password !== confirmPassword} 
                      className="w-full"
                    >
                      {authLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          {t("registering")}
                        </>
                      ) : (
                        t("createAccount")
                      )}
                    </Button>
                  </div>
                )}
                
                {/* Login form for registered users */}
                {authState === 'needsLogin' && !correctionSent && (
                  <div className="pt-3 border-t border-border/50 space-y-3 animate-fade-in">
                    <p className="text-xs text-muted-foreground">{t("enterYourPassword")}</p>
                    
                    <div className="space-y-1">
                      <Label htmlFor="loginPassword" className="text-xs">{t("password")}</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="loginPassword"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={t("passwordPlaceholder")}
                          className="pl-9 pr-9"
                          onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    
                    <Button 
                      onClick={() => handleLogin()} 
                      disabled={authLoading || !password.trim()} 
                      className="w-full"
                    >
                      {authLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          {t("loggingIn")}
                        </>
                      ) : (
                        t("goToVacationForm")
                      )}
                    </Button>
                    
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={authLoading}
                      className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
                    >
                      {t("forgotPassword")}
                    </button>
                  </div>
                )}
                
                {/* Password reset sent confirmation */}
                {authState === 'forgotPassword' && (
                  <div className="pt-3 border-t border-border/50 space-y-2 animate-fade-in">
                    <div className="flex items-center gap-2 text-primary">
                      <Mail className="h-4 w-4" />
                      <span className="text-sm font-medium">{t("resetPasswordSent")}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("resetPasswordDesc")}</p>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setAuthState('needsLogin')}
                      className="w-full mt-2"
                    >
                      {t("back")}
                    </Button>
                  </div>
                )}
                
                {/* Quick links to personal calendar and schedule */}
                {!correctionSent && lookupResult.department && authState === 'authenticated' && (
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-border/50">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full gap-1.5 px-2"
                      onClick={() => {
                        const wn = lookupResult?.worker?.worker_number || workerNumber;
                        window.open(`https://salix.verdnatura.es/#/worker/${wn}/calendar`, '_blank');
                      }}
                    >
                      <Calendar className="h-4 w-4 flex-shrink-0" />
                      <span className="text-xs truncate">{t("viewAnnualCalendar")}</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full gap-1.5 px-2"
                      onClick={() => navigate('/mi-horario')}
                    >
                      <Clock className="h-4 w-4 flex-shrink-0" />
                      <span className="text-xs truncate">{t("viewSchedule")}</span>
                    </Button>
                  </div>
                )}
                
                {/* Department correction option */}
                {!showCorrectionForm && !correctionSent && (
                  <button
                    onClick={() => setShowCorrectionForm(true)}
                    className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1 pt-2"
                  >
                    <ChevronDown className="h-3 w-3" />
                    {t("wrongDepartmentQuestion")}
                  </button>
                )}
                
                {/* Correction form */}
                {showCorrectionForm && !correctionSent && (
                  <div className="pt-3 border-t border-border/50 space-y-3 animate-fade-in">
                    <Label className="text-xs text-muted-foreground">{t("selectCorrectDepartment")}</Label>
                    <Select value={selectedCorrectionDept} onValueChange={setSelectedCorrectionDept}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t("selectCorrectDepartment")} />
                      </SelectTrigger>
                      <SelectContent>
                        {(lookupResult.allDepartments || [])
                          .filter(d => d.id !== lookupResult.department?.id)
                          .map(dept => (
                            <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <div className="flex flex-col gap-2">
                      <Button
                        onClick={handleSubmitCorrectionRequest}
                        disabled={submittingCorrection || !selectedCorrectionDept}
                        className="w-full"
                        size="sm"
                      >
                        {submittingCorrection ? <Loader2 className="h-4 w-4 animate-spin" /> : t("sendCorrection")}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowCorrectionForm(false);
                          setSelectedCorrectionDept("");
                        }}
                        className="w-full"
                        size="sm"
                      >
                        {t("cancel")}
                      </Button>
                    </div>
                  </div>
                )}
                
                {/* Correction sent confirmation */}
                {correctionSent && (
                  <div className="pt-3 border-t border-border/50 space-y-2 animate-fade-in">
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                      <Clock className="h-4 w-4" />
                      <span className="text-sm font-medium">{t("correctionRequestSent")}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("correctionRequestSentDesc")}
                    </p>
                  </div>
                )}
                  </>
                )}
              </div>
            )}
            
            {/* Worker found but has pending correction request */}
            {lookupResult?.worker && lookupResult.hasPendingCorrection && (
              <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-3 animate-fade-in">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <Clock className="h-5 w-5" />
                  <span className="font-semibold">{t("pendingCorrectionRequest")}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("pendingCorrectionRequestDesc")}
                </p>
                <div className="space-y-2 text-sm pt-2 border-t border-amber-500/20">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("name")}:</span>
                    <span className="font-medium">{lookupResult.worker.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("department")}</span>
                    <span className="font-medium">{lookupResult.department?.name}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Worker not found */}
            {notFound && !showJoinRequest && !joinSent && (
              <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-3 animate-fade-in">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-5 w-5" />
                  <span className="font-semibold">{t("workerNotFound")}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("workerNotFoundDesc")} {t("requestToJoinGroup")}.
                </p>
                <Button 
                  variant="outline" 
                  onClick={() => setShowJoinRequest(true)}
                  className="w-full"
                >
                  {t("requestJoinGroup")}
                </Button>
              </div>
            )}

            {/* Join request form */}
            {showJoinRequest && !joinSent && (
              <div className="p-4 rounded-lg border border-border bg-card space-y-4 animate-fade-in">
                <h3 className="font-semibold">{t("requestJoinGroup")}</h3>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="joinName">{t("fullName")}</Label>
                    <Input
                      id="joinName"
                      value={joinName}
                      onChange={(e) => setJoinName(e.target.value)}
                      placeholder={t("fullNamePlaceholder")}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="joinEmail">{t("email")}</Label>
                    <Input
                      id="joinEmail"
                      type="email"
                      value={joinEmail}
                      onChange={(e) => setJoinEmail(e.target.value)}
                      placeholder={t("emailPlaceholder")}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowJoinRequest(false)}
                    className="flex-1"
                  >
                    {t("cancel")}
                  </Button>
                  <Button 
                    onClick={handleSubmitJoinRequest}
                    disabled={submittingJoin || !joinName.trim() || !joinEmail.trim()}
                    className="flex-1"
                  >
                    {submittingJoin ? <Loader2 className="h-4 w-4 animate-spin" /> : t("sendRequest")}
                  </Button>
                </div>
              </div>
            )}

            {/* Join request sent confirmation */}
            {joinSent && (
              <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-2 animate-fade-in">
                <div className="flex items-center gap-2 text-primary">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-semibold">{t("joinRequestSent")}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("joinRequestSentDesc")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-4">
        <div className="container mx-auto px-4 text-center text-xs text-muted-foreground">
          Verdnatura © {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  );
};

const WorkerEntry = () => {
  return <WorkerEntryContent />;
};

export default WorkerEntry;