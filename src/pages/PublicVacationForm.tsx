import { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HalfDayCalendar, DaySelection } from "@/components/HalfDayCalendar";
import { SignaturePad } from "@/components/SignaturePad";
import { toast } from "sonner";
import { CheckCircle, Calendar as CalendarIcon, AlertCircle, Info, PenLine, Users, Loader2, AlertTriangle, ShieldCheck } from "lucide-react";
import { es, fr, arMA } from "date-fns/locale";
import { format } from "date-fns";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSelector } from "@/components/LanguageSelector";
import { LanguageProvider, useLanguage } from "@/hooks/useLanguage";
import { LogoLink } from "@/components/LogoLink";
import LoadingScreen from "@/components/LoadingScreen";

type WorkerInfo = {
  name: string;
  workerNumber: string;
  team: { id: string; name: string } | null;
  workGroup: { id: string; name: string; color: string } | null;
};

type WorkerLookupResult = {
  success: boolean;
  worker: WorkerInfo | null;
  notInSystem: boolean;
};

type Department = {
  id: string;
  name: string;
  description: string | null;
  max_days_per_employee: number;
  require_all_days: boolean;
  // Note: manager_email excluded from public view for security
};

type PersonalCalendar = {
  id: string;
  department_id: string;
  worker_name: string;
  worker_number: string;
  max_days: number;
  slug: string | null;
};

const PublicVacationFormContent = () => {
  const { token, slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { t, language, isRTL } = useLanguage();
  const [department, setDepartment] = useState<Department | null>(null);
  const [personalCalendar, setPersonalCalendar] = useState<PersonalCalendar | null>(null);
  const [availableDays, setAvailableDays] = useState<DaySelection[]>([]);
  const [blockedByConcurrency, setBlockedByConcurrency] = useState<Set<string>>(new Set());
  const [selectedDays, setSelectedDays] = useState<DaySelection[]>([]);
  const [usedDays, setUsedDays] = useState(0); // Days already used by this worker (can be decimal)
  const [maxDays, setMaxDays] = useState(0); // Max days for this worker (from group or department)
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [departmentToken, setDepartmentToken] = useState<string | null>(null);
  const [personalCalendarToken, setPersonalCalendarToken] = useState<string | null>(null);
  const [workerNumberVerified, setWorkerNumberVerified] = useState(false);
  const [verificationNumber, setVerificationNumber] = useState("");
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [checkingUsedDays, setCheckingUsedDays] = useState(false);
  const [usedDaysChecked, setUsedDaysChecked] = useState(false);
  const [workerInfo, setWorkerInfo] = useState<WorkerInfo | null>(null);
  const [loadingWorkerInfo, setLoadingWorkerInfo] = useState(false);
  const [workerNotInSystem, setWorkerNotInSystem] = useState(false);
  const [showJoinRequestForm, setShowJoinRequestForm] = useState(false);
  const [joinRequestName, setJoinRequestName] = useState("");
  const [joinRequestEmail, setJoinRequestEmail] = useState("");
  const [isWorkerAdmin, setIsWorkerAdmin] = useState(false);
  const [submittingJoinRequest, setSubmittingJoinRequest] = useState(false);
  const [joinRequestSent, setJoinRequestSent] = useState(false);
  
  // Exception request modal state
  const [showExceptionModal, setShowExceptionModal] = useState(false);
  const [exceptionDate, setExceptionDate] = useState<string | null>(null);
  const [exceptionReason, setExceptionReason] = useState("");
  const [submittingException, setSubmittingException] = useState(false);
  const [workerExceptions, setWorkerExceptions] = useState<Set<string>>(new Set());
  
  // Fetch worker exceptions after verification
  const fetchWorkerExceptions = async (departmentId: string, workerNum: string) => {
    try {
      const { data } = await supabase.functions.invoke("submit-vacation-request", {
        body: {
          action: 'check-worker-exceptions',
          departmentId,
          workerNumber: workerNum,
        }
      });
      if (data?.success && data.exceptions) {
        setWorkerExceptions(new Set(data.exceptions.map((e: any) => e.exception_date)));
      }
    } catch (err) {
      console.error("Error fetching worker exceptions:", err);
    }
  };
  
  // Handler for clicking a blocked day (to request exception)
  const handleBlockedDayClick = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    // Check if worker already has an exception for this day
    if (workerExceptions.has(dateStr)) {
      toast.info(t("urgentRequestAlreadyPending") || "Ya tienes aprobada una excepción para este día");
      return;
    }
    
    setExceptionDate(dateStr);
    setExceptionReason("");
    setShowExceptionModal(true);
  };
  
  // Submit exception request
  const handleSubmitExceptionRequest = async () => {
    if (!department || !exceptionDate || !exceptionReason.trim() || !formData.workerNumber) {
      toast.error(t("errorRequired") || "Completa todos los campos obligatorios");
      return;
    }
    
    setSubmittingException(true);
    try {
      const { data } = await supabase.functions.invoke("submit-vacation-request", {
        body: {
          action: 'submit-day-exception-request',
          departmentId: department.id,
          workerNumber: formData.workerNumber,
          workerName: formData.name,
          workerEmail: formData.email || null,
          requestDate: exceptionDate,
          reason: exceptionReason.trim(),
        }
      });
      
      if (data?.success) {
        toast.success(t("urgentRequestSuccess") || "Solicitud enviada. El encargado revisará tu petición.");
        setShowExceptionModal(false);
        setExceptionDate(null);
        setExceptionReason("");
      } else {
        const errorMsg = data?.error || t("errorSubmit");
        if (errorMsg.includes("pendiente")) {
          toast.error(t("urgentRequestAlreadyPending") || errorMsg);
        } else {
          toast.error(errorMsg);
        }
      }
    } catch (err) {
      console.error("Error submitting exception request:", err);
      toast.error(t("errorSubmit") || "Error al enviar solicitud");
    } finally {
      setSubmittingException(false);
    }
  };
  
  // Get pre-verified worker info from navigation state (from WorkerEntry)
  const navigationState = location.state as {
    verifiedWorkerNumber?: string;
    workerName?: string;
    workerTeam?: { id: string; name: string } | null;
    workGroup?: { id: string; name: string; color: string } | null;
  } | null;
  
  const [formData, setFormData] = useState({
    name: navigationState?.workerName || "",
    email: "",
    workerNumber: navigationState?.verifiedWorkerNumber || "",
    notes: "",
  });
  const [signature, setSignature] = useState<string | null>(null);

  const locale = language === "ar" ? arMA : language === "fr" ? fr : es;

  // If a day becomes blocked by concurrency, ensure it is not selectable (auto-unselect)
  useEffect(() => {
    if (blockedByConcurrency.size === 0) return;
    setSelectedDays((prev) => prev.filter((d) => !blockedByConcurrency.has(d.date)));
  }, [blockedByConcurrency]);

  // Detect if this is a personal calendar route (starts with /p/)
  const isPersonalCalendarRoute = window.location.pathname.startsWith('/p/');

  // If coming from WorkerEntry with verified worker, set workerInfo and pre-verified state
  useEffect(() => {
    if (navigationState?.verifiedWorkerNumber && navigationState?.workerName) {
      setVerificationNumber(navigationState.verifiedWorkerNumber);
      setWorkerInfo({
        name: navigationState.workerName,
        workerNumber: navigationState.verifiedWorkerNumber,
        team: navigationState.workerTeam || null,
        workGroup: navigationState.workGroup || null,
      });
    }
  }, []);

  useEffect(() => {
    if (token || slug) {
      if (isPersonalCalendarRoute) {
        fetchPersonalCalendar();
      } else {
        fetchDepartment();
      }
    }
  }, [token, slug, isPersonalCalendarRoute]);

  const fetchPersonalCalendar = async () => {
    setLoading(true);
    const tokenOrSlug = token || slug;
    
    if (!tokenOrSlug) {
      toast.error(t("errorInvalidLink"));
      setLoading(false);
      return;
    }

    // Use SECURITY DEFINER function to safely get personal calendar data
    const { data: calendarData, error: calError } = await supabase.rpc(
      "get_personal_calendar_public", 
      { p_token: tokenOrSlug }
    );
    
    if (calError || !calendarData || calendarData.length === 0) {
      console.error("Error fetching personal calendar:", calError);
      toast.error(t("errorInvalidLink"));
      setLoading(false);
      return;
    }

    const cal = calendarData[0];
    setPersonalCalendar(cal);
    setPersonalCalendarToken(tokenOrSlug);

    // Get department info for display purposes
    const { data: departments } = await supabase.rpc("get_public_departments");
    const deptData = departments?.find((d: any) => d.id === cal.department_id);
    
    if (deptData) {
      setDepartment({
        ...deptData,
        max_days_per_employee: cal.max_days, // Override with personal calendar's max_days
        require_all_days: true, // Personal calendars require all days
      });
      setDepartmentToken(deptData.public_token);
    }

    // Pre-fill worker name from personal calendar
    setFormData(prev => ({
      ...prev,
      name: cal.worker_name,
    }));

    // Fetch personal calendar availabilities via edge function (security: no direct table access)
    try {
      const { data: availResponse, error: availError } = await supabase.functions.invoke("submit-vacation-request", {
        body: {
          action: 'get-personal-calendar-availability',
          personalCalendarId: cal.id,
        }
      });

      if (availError || !availResponse?.success) {
        toast.error(t("errorLoadDates"));
        setLoading(false);
        return;
      }

      const days: DaySelection[] = (availResponse.availabilities || []).map((item: { date: string; half_day?: boolean }) => ({
        date: item.date,
        halfDay: item.half_day || false,
      }));
      setAvailableDays(days);
    } catch (err) {
      console.error('Error fetching personal calendar availability:', err);
      toast.error(t("errorLoadDates"));
      setLoading(false);
      return;
    }
    setLoading(false);
  };

  // Fetch worker info when typing worker number (debounced)
  useEffect(() => {
    if (!department || personalCalendar || verificationNumber.trim().length < 2) {
      setWorkerInfo(null);
      setWorkerNotInSystem(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setLoadingWorkerInfo(true);
      try {
        const { data } = await supabase.functions.invoke("submit-vacation-request", {
          body: {
            action: 'get-worker-by-number',
            departmentId: department.id,
            workerNumber: verificationNumber.trim(),
          }
        });
        
        if (data?.success && data.worker) {
          setWorkerInfo(data.worker);
          setWorkerNotInSystem(false);
          setIsWorkerAdmin(data.isAdmin || false);
        } else {
          setWorkerInfo(null);
          setWorkerNotInSystem(data?.notInSystem || false);
          setIsWorkerAdmin(false);
        }
      } catch (err) {
        console.error("Error fetching worker info:", err);
        setWorkerInfo(null);
        setWorkerNotInSystem(false);
      } finally {
        setLoadingWorkerInfo(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [verificationNumber, department?.id, personalCalendar]);

  const handleRequestJoinGroup = async () => {
    if (!department || !joinRequestName.trim() || !joinRequestEmail.trim()) return;
    
    setSubmittingJoinRequest(true);
    try {
      const { data } = await supabase.functions.invoke("submit-vacation-request", {
        body: {
          action: 'request-join-group',
          departmentId: department.id,
          workerNumber: verificationNumber.trim(),
          workerName: joinRequestName.trim(),
          workerEmail: joinRequestEmail.trim(),
        }
      });

      if (data?.success) {
        setJoinRequestSent(true);
        toast.success(t("joinRequestSent"));
      } else {
        toast.error(data?.error || "Error al enviar solicitud");
      }
    } catch (err) {
      console.error("Error requesting join group:", err);
      toast.error("Error al enviar solicitud");
    } finally {
      setSubmittingJoinRequest(false);
    }
  };

  const handleVerifyWorkerNumber = async () => {
    if (!department) return;
    
    // For personal calendars, verify worker number matches
    if (personalCalendar && verificationNumber.trim() !== personalCalendar.worker_number) {
      setVerificationError(t("workerNumberMismatch") || "El número de trabajador no coincide");
      return;
    }

    setCheckingUsedDays(true);
    setVerificationError(null);

    try {
      const workerNum = personalCalendar ? personalCalendar.worker_number : verificationNumber.trim();
      
      const { data } = await supabase.functions.invoke("submit-vacation-request", {
        body: {
          action: 'check-used-days',
          departmentId: department.id,
          workerNumber: workerNum,
        }
      });
      
      if (data?.success) {
        setUsedDays(data.usedDays || 0);
        setMaxDays(data.maxDays || 0);
        setUsedDaysChecked(true);
        
        if (data.hasPendingRequest) {
          setVerificationError(t("pendingRequestError"));
          setCheckingUsedDays(false);
          return;
        }
        
        if (data.usedDays >= data.maxDays) {
          setVerificationError(`${t("allDaysUsedError")} (${data.maxDays})`);
          setCheckingUsedDays(false);
          return;
        }

        // Fetch blocked days due to concurrency limits
        try {
          const blockedResponse = await supabase.functions.invoke("submit-vacation-request", {
            body: {
              action: 'get-blocked-days-by-concurrency',
              departmentId: department.id,
              workerNumber: workerNum,
            }
          });
          if (blockedResponse.data?.success && blockedResponse.data?.blockedDays) {
            setBlockedByConcurrency(new Set(blockedResponse.data.blockedDays));
          }
        } catch (err) {
          console.error("Error fetching blocked days:", err);
        }

        // Fetch worker's personal availability (days unlocked by admin modifications)
        try {
          const personalAvailResponse = await supabase.functions.invoke("submit-vacation-request", {
            body: {
              action: 'get-worker-personal-availability',
              departmentId: department.id,
              workerNumber: workerNum,
            }
          });
          if (personalAvailResponse.data?.success && personalAvailResponse.data?.unlockedDays) {
            const unlockedDays = personalAvailResponse.data.unlockedDays as string[];
            if (unlockedDays.length > 0) {
              // Add these days to available days if not already present
              setAvailableDays(prev => {
                const existingDates = new Set(prev.map(d => d.date));
                const newDays = unlockedDays
                  .filter(date => !existingDates.has(date))
                  .map(date => ({ date, halfDay: false }));
                if (newDays.length > 0) {
                  console.log(`Added ${newDays.length} personal unlocked days for worker ${workerNum}`);
                  return [...prev, ...newDays];
                }
                return prev;
              });
            }
          }
        } catch (err) {
          console.error("Error fetching personal availability:", err);
        }

        // Fetch worker's approved exceptions
        await fetchWorkerExceptions(department.id, workerNum);

        // Success - set form data and proceed (use worker name from system if available)
        setWorkerNumberVerified(true);
        setFormData(prev => ({
          ...prev,
          workerNumber: workerNum,
          name: personalCalendar ? personalCalendar.worker_name : (workerInfo?.name || prev.name),
        }));
        
        toast.success(`${data.maxDays - data.usedDays} ${t("availableDaysInfo")}`);
      } else {
        setVerificationError(data?.error || "Error al verificar");
      }
    } catch (err) {
      console.error("Error checking used days:", err);
      setVerificationError("Error al verificar días");
    } finally {
      setCheckingUsedDays(false);
    }
  };

  const fetchDepartment = async () => {
    setLoading(true);
    
    // Use SECURITY DEFINER function to safely get departments
    const { data: departments, error: rpcError } = await supabase.rpc("get_public_departments");
    
    if (rpcError) {
      console.error("Error fetching departments:", rpcError);
      toast.error(t("errorInvalidLink"));
      setLoading(false);
      return;
    }

    // Find department by token or slug
    let deptData = null;
    
    if (token) {
      deptData = departments?.find((d: any) => d.public_token === token) || null;
    }
    
    if (!deptData && slug) {
      deptData = departments?.find((d: any) => d.slug === slug) || null;
    }

    if (!deptData) {
      toast.error(t("errorInvalidLink"));
      setLoading(false);
      return;
    }

    // Ensure require_all_days has a default value
    const departmentWithDefaults = {
      ...deptData,
      require_all_days: deptData.require_all_days !== false
    };

    setDepartment(departmentWithDefaults);
    setDepartmentToken(deptData.public_token);

    // Fetch available dates via edge function (secure)
    const availResponse = await supabase.functions.invoke("submit-vacation-request", {
      body: {
        action: 'get-department-availability',
        departmentId: deptData.id,
      }
    });

    if (availResponse.error || !availResponse.data?.success) {
      toast.error(t("errorLoadDates"));
      setLoading(false);
      return;
    }

    // All available dates are full days from admin config
    const days: DaySelection[] = (availResponse.data.availabilities || []).map((item: any) => ({
      date: item.date,
      halfDay: false,
    }));
    setAvailableDays(days);
    setLoading(false);
  };

  // Calculate total selected days (half days = 0.5)
  const totalSelectedDays = selectedDays.reduce((acc, d) => acc + (d.halfDay ? 0.5 : 1), 0);
  
  // Count selected Mondays and Fridays (0 = Sunday, 1 = Monday, 5 = Friday)
  const selectedMondays = selectedDays.filter(d => new Date(d.date + 'T00:00:00').getDay() === 1).length;
  const selectedFridays = selectedDays.filter(d => new Date(d.date + 'T00:00:00').getDay() === 5).length;

  const handleDayClick = (date: Date, halfDay: boolean, action: 'add' | 'remove' | 'convert') => {
    if (!department) return;

    const dateStr = format(date, 'yyyy-MM-dd');
    const availableDay = availableDays.find(d => d.date === dateStr);
    
    // Check if day is blocked by concurrency (UI should already disable it)
    if (blockedByConcurrency.has(dateStr)) {
      return;
    }
    
    if (!availableDay) {
      toast.error(t("errorInvalidDate"));
      return;
    }

    const remainingDays = maxDays - usedDays;

    // Count how many half days are already selected
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
      
      // Adding a new day
      const addValue = halfDay ? 0.5 : 1;
      if (totalSelectedDays + addValue > remainingDays) {
        toast.error(`${t("errorMaxDays")} ${remainingDays} ${t("days")}`);
        return;
      }
      // Check half day limit
      if (halfDay && currentHalfDays >= 1) {
        toast.error("Solo puedes seleccionar un máximo de 1 medio día");
        return;
      }
      setSelectedDays([...selectedDays, { date: dateStr, halfDay }]);
    } else if (action === 'convert') {
      // Check half day limit when converting to half
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!department || !departmentToken) return;

    // Never allow submitting blocked dates; they must appear red and be unselectable.
    if (selectedDays.some((d) => blockedByConcurrency.has(d.date))) {
      setSelectedDays((prev) => prev.filter((d) => !blockedByConcurrency.has(d.date)));
      return;
    }

    // Calculate remaining days for this worker
    const remainingDays = maxDays - usedDays;

    // Check if worker has no days available
    if (remainingDays <= 0) {
      toast.error(t("errorNoDaysAvailable") || "No te quedan días disponibles para solicitar");
      return;
    }

    // Check if any days are selected
    if (selectedDays.length === 0 || totalSelectedDays === 0) {
      toast.error(t("errorSelectDay") || "Debes seleccionar al menos un día");
      return;
    }

    // Client-side validation (UX only - server validates too)
    const missingFields: string[] = [];
    if (!formData.name.trim()) missingFields.push(t("fullName") || "Nombre");
    if (!formData.email.trim()) missingFields.push(t("email") || "Email");
    if (!formData.workerNumber.trim()) missingFields.push(t("workerNumber") || "Número");
    if (!signature) missingFields.push(t("signature") || "Firma");
    
    if (missingFields.length > 0) {
      toast.error(`${t("errorMissingFields") || "Faltan campos obligatorios"}: ${missingFields.join(", ")}`);
      return;
    }

    // Validate based on require_all_days setting
    if (department.require_all_days) {
      if (totalSelectedDays !== remainingDays) {
        toast.error(`Debes seleccionar exactamente ${remainingDays} días`);
        return;
      }
    } else {
      if (totalSelectedDays > remainingDays) {
        toast.error(`Solo puedes seleccionar hasta ${remainingDays} días más`);
        return;
      }
    }

    setSubmitting(true);

    try {
      console.log("Submitting vacation request...", { token: departmentToken, selectedDays: selectedDays.length });
      
      // Use edge function for server-side validated submission
      const { data: result, error: submitError } = await supabase.functions.invoke("submit-vacation-request", {
        body: {
          token: departmentToken,
          employeeName: formData.name.trim(),
          employeeEmail: formData.email.trim(),
          workerNumber: formData.workerNumber.trim(),
          notes: formData.notes?.trim() || null,
          signature: signature,
          selectedDates: selectedDays.map(d => ({ date: d.date, halfDay: d.halfDay })),
        }
      });

      console.log("Response:", { result, submitError });

      // Handle network/invoke errors
      if (submitError) {
        console.error("Submit error:", submitError);
        toast.error(t("errorSubmit"));
        setSubmitting(false);
        return;
      }

      // Handle business logic errors (returned in body with success: false)
      if (!result?.success) {
        const errorMessage = result?.error || t("errorSubmit");
        console.error("Request failed:", errorMessage);

        // If server rejected due to capacity, sync UI: mark those days as blocked/red and unselect them (no toast).
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

        // Backward-compat: older server messages
        if (typeof errorMessage === "string" && errorMessage.includes("Fechas no disponibles por capacidad")) {
          const datesPart = errorMessage.split(":")[1] || "";
          const blockedDates = datesPart
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

          if (blockedDates.length > 0) {
            setBlockedByConcurrency((prev) => {
              const next = new Set(prev);
              blockedDates.forEach((d) => next.add(d));
              return next;
            });
            setSelectedDays((prev) => prev.filter((d) => !blockedDates.includes(d.date)));
          }

          setSubmitting(false);
          return;
        }

        toast.error(errorMessage);
        setSubmitting(false);
        return;
      }

      // Emails are now sent server-side by the submit-vacation-request edge function

      // Refresh blocked days immediately so the calendar reflects the new capacity
      try {
        const blockedResponse = await supabase.functions.invoke("submit-vacation-request", {
          body: {
            action: 'get-blocked-days-by-concurrency',
            departmentId: department.id,
            workerNumber: formData.workerNumber.trim(),
          }
        });
        if (blockedResponse.data?.success && blockedResponse.data?.blockedDays) {
          setBlockedByConcurrency(new Set(blockedResponse.data.blockedDays));
        }
      } catch (err) {
        console.error("Error refreshing blocked days after submit:", err);
      }

      setSubmitted(true);
    } catch (error) {
      console.error("Error submitting vacation request:", error);
      toast.error(t("errorSubmit"));
    } finally {
      setSubmitting(false);
    }
  };

  // Workers can select up to 1 half day within the period
  const currentHalfDays = selectedDays.filter(d => d.halfDay).length;

  if (loading) {
    return <LoadingScreen />;
  }

  if (!department) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-3 py-4 sm:p-4">
        <Card className="max-w-md w-full shadow-lg overflow-hidden">
          <CardContent className="pt-6 text-center px-4 sm:px-6">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2 tracking-tight">{t("invalidLink")}</h2>
            <p className="text-muted-foreground font-light tracking-tight">
              {t("invalidLinkDesc")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Worker verification step (for both personal calendars AND regular departments)
  if (!workerNumberVerified) {
    return (
      <div className="min-h-screen flex flex-col bg-background" dir={isRTL ? "rtl" : "ltr"}>
        {/* Top Bar - Integrated, not overlapping */}
        <div className="flex justify-between items-center px-4 py-3 border-b border-border/50 bg-background/95 backdrop-blur-sm">
          <LanguageSelector />
          <ThemeToggle />
        </div>
        
        <div className="flex-1 flex items-center justify-center px-3 py-4 sm:p-4">
        <Card className="max-w-md w-full shadow-lg overflow-hidden">
          <CardHeader className="text-center px-4 sm:px-6">
            <div className="flex justify-center mb-3">
              <LogoLink to="/" className="h-14 w-14 object-contain" />
            </div>
            <CardTitle className="text-xl font-semibold tracking-tight">
              {t("vacationRequest")}
            </CardTitle>
            <CardDescription className="font-light">
              {personalCalendar ? (
                <>Calendario personal de <span className="font-semibold text-primary">{personalCalendar.worker_name}</span></>
              ) : (
                <span className="font-semibold text-primary">{department.name}</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-4 sm:px-6">
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
              <p className="text-sm text-muted-foreground">
                {t("verifyIdentityDesc")}
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="verification_number">{t("workerNumber")}</Label>
              <Input
                id="verification_number"
                placeholder={t("workerNumberPlaceholder")}
                value={verificationNumber}
                onChange={(e) => {
                  setVerificationNumber(e.target.value);
                  setVerificationError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleVerifyWorkerNumber();
                  }
                }}
                className={verificationError ? 'border-destructive' : ''}
              />
              {verificationError && (
                <p className="text-sm text-destructive">{verificationError}</p>
              )}
              
              {/* Worker info display when found */}
              {loadingWorkerInfo && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">{t("searchingWorker")}</span>
                </div>
              )}
              
              {workerInfo && !loadingWorkerInfo && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">{workerInfo.name}</span>
                    {isWorkerAdmin && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                        <ShieldCheck className="h-3 w-3" />
                        Admin
                      </span>
                    )}
                  </div>
                  
                  {workerInfo.team && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{t("team")}:</span>
                      <span className="text-sm font-medium">{workerInfo.team.name}</span>
                    </div>
                  )}
                  
                  {workerInfo.workGroup && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{t("vacationGroup")}:</span>
                      <div className="flex items-center gap-2">
                        <div 
                          className="h-4 w-4 rounded-full border border-border/50"
                          style={{ backgroundColor: workerInfo.workGroup.color }}
                        />
                        <span className="text-sm font-medium">{workerInfo.workGroup.name}</span>
                      </div>
                    </div>
                  )}

                  {/* Admin mode button */}
                  {isWorkerAdmin && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => navigate('/admin/vacation-request')}
                      className="w-full bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20"
                    >
                      <ShieldCheck className="h-4 w-4 mr-2" />
                      Solicitar vacaciones para otro trabajador
                    </Button>
                  )}
                </div>
              )}

              {/* Worker not in system - request to join group */}
              {workerNotInSystem && !workerInfo && !loadingWorkerInfo && !joinRequestSent && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm font-semibold">{t("notInGroup")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("notInGroupDesc")}</p>
                  
                  {!showJoinRequestForm ? (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setShowJoinRequestForm(true)}
                      className="w-full"
                    >
                      {t("requestJoinGroup")}
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <Label className="text-xs">{t("fullName")} *</Label>
                      <Input
                        placeholder={t("fullNamePlaceholder")}
                        value={joinRequestName}
                        onChange={(e) => setJoinRequestName(e.target.value)}
                        className="h-10"
                      />
                      <Label className="text-xs">{t("email")} *</Label>
                      <Input
                        type="email"
                        placeholder={t("emailPlaceholder")}
                        value={joinRequestEmail}
                        onChange={(e) => setJoinRequestEmail(e.target.value)}
                        className="h-10"
                      />
                      <Button 
                        onClick={handleRequestJoinGroup}
                        disabled={!joinRequestName.trim() || !joinRequestEmail.trim() || submittingJoinRequest}
                        className="w-full"
                        size="sm"
                      >
                        {submittingJoinRequest ? t("loading") : t("requestJoinGroup")}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Join request sent confirmation */}
              {joinRequestSent && (
                <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-primary">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm font-semibold">{t("joinRequestSent")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("joinRequestSentDesc")}</p>
                </div>
              )}
            </div>
            
            <Button 
              onClick={handleVerifyWorkerNumber} 
              className="w-full"
              disabled={!verificationNumber.trim() || checkingUsedDays}
            >
              {checkingUsedDays ? t("loading") : t("verifyAndContinue")}
            </Button>
          </CardContent>
        </Card>
        </div>
      </div>
    );
  }
  if (submitted) {
    const salixCalendarUrl = formData.workerNumber 
      ? `https://salix.verdnatura.es/#/worker/${formData.workerNumber}/calendar` 
      : null;
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-3 py-4 sm:p-4" dir={isRTL ? "rtl" : "ltr"}>
        <Card className="max-w-md w-full shadow-lg overflow-hidden">
          <CardContent className="pt-6 text-center px-4 sm:px-6">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold text-primary mb-2 tracking-tight">{t("requestSent")}</h2>
            <p className="text-muted-foreground mb-4 font-light tracking-tight">
              {t("requestSentDesc")}
            </p>
            <div className="bg-secondary/50 rounded-xl p-4 text-start mb-4">
              <p className="text-sm font-semibold mb-2 tracking-tight">{t("summary")}</p>
              <p className="text-sm text-muted-foreground mb-1 font-light tracking-tight">
                <span className="font-normal text-foreground">{t("department")}</span> {department.name}
              </p>
              <p className="text-sm text-muted-foreground mb-1 font-light tracking-tight">
                <span className="font-normal text-foreground">{t("requestedDays")}</span> {totalSelectedDays}
              </p>
              <p className="text-sm text-muted-foreground font-light tracking-tight">
                <span className="font-normal text-foreground">{t("email")}</span> {formData.email}
              </p>
            </div>
            
            {/* Salix Calendar Link */}
            {salixCalendarUrl && (
              <Button 
                variant="outline" 
                className="w-full gap-2"
                onClick={() => window.open(salixCalendarUrl, '_blank')}
              >
                <CalendarIcon className="h-4 w-4" />
                {t("myCalendar") || "Mi Calendario"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col" dir={isRTL ? "rtl" : "ltr"}>
      {/* Top Bar - Integrated, not overlapping */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-border/50 bg-background/95 backdrop-blur-sm sticky top-0 z-50">
        <LanguageSelector />
        <ThemeToggle />
      </div>
      
      <div className="flex-1 py-4 px-3 sm:py-6 sm:px-4">
        <div className="container mx-auto max-w-lg">
          {/* Header */}
          <div className="text-center mb-5">
            <div className="flex justify-center mb-3">
              <LogoLink to="/" className="h-12 w-12 sm:h-14 sm:w-14 object-contain" />
            </div>
            <h1 className="text-lg sm:text-2xl font-semibold text-foreground mb-1 tracking-tight">
              {t("vacationRequest")}
            </h1>
            <p className="text-sm text-muted-foreground font-light tracking-tight">
              {department.name}
            </p>
          </div>

        {/* Instructions Card */}
        <Card className="mb-4 bg-primary/5 border-primary/20">
          <CardContent className="py-3 px-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="text-sm space-y-1">
                <p className="font-semibold text-foreground">{t("howToUse")}</p>
                <p className="text-muted-foreground">{t("step1")}</p>
                <p className="text-muted-foreground">{t("step2")}</p>
                <p className="text-muted-foreground">{t("step3")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Calendar Card - FIRST on mobile for visibility */}
          <Card className="shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold tracking-tight flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-primary" />
                {t("selectYourDays")}
              </CardTitle>
              <CardDescription className="font-light tracking-tight text-sm">
                {t("tapDaysToSelect")}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-2 sm:px-4">
          {/* Day Counter - Prominent */}
              {(() => {
                const workerMaxDays = maxDays || Number(department.max_days_per_employee) || 0;
                const remainingDays = workerMaxDays - usedDays;
                const isComplete = department.require_all_days 
                  ? totalSelectedDays === remainingDays
                  : selectedDays.length > 0;
                return (
                  <>
                    <div className={`rounded-xl p-3 mb-3 flex items-center justify-between ${
                      isComplete ? 'bg-primary/10' : 'bg-secondary'
                    }`}>
                      <span className="text-sm font-medium text-foreground">{t("selected")}:</span>
                      <span className={`text-2xl font-bold ${
                        department.require_all_days
                          ? (totalSelectedDays === remainingDays ? 'text-primary' : 'text-destructive')
                          : (selectedDays.length > 0 ? 'text-primary' : 'text-muted-foreground')
                      }`}>
                        {totalSelectedDays} <span className="text-base font-normal text-muted-foreground">{t("daysOf")} {remainingDays}</span>
                      </span>
                    </div>
                    {usedDays > 0 && (
                      <p className="text-xs text-muted-foreground mb-3 text-center">
                        {t("usedDaysOf").replace("{used}", String(usedDays)).replace("{total}", String(maxDays || department.max_days_per_employee))}
                      </p>
                    )}
                    {department.require_all_days && totalSelectedDays < remainingDays && (
                      <p className="text-xs text-destructive mb-3 text-center font-medium">
                        {t("mustSelectAllDays")}
                      </p>
                    )}
                    {!department.require_all_days && selectedDays.length === 0 && (
                      <p className="text-xs text-muted-foreground mb-3 text-center">
                        {t("selectAtLeastOneDay").replace("{max}", String(remainingDays))}
                      </p>
                    )}
                  </>
                );
              })()}

              {/* Mobile-Optimized Calendar with Half-Day Support */}
              <div className="flex justify-center px-2">
                <HalfDayCalendar
                  selectedDays={selectedDays}
                  onDayClick={handleDayClick}
                  onBlockedDayClick={handleBlockedDayClick}
                  locale={locale}
                  availableDays={availableDays}
                  blockedDays={blockedByConcurrency}
                  showHalfDayOption={true}
                  showFridayNotice={false}
                  disableWeekends={true}
                  t={t}
                  disabled={(date) => !availableDays.some(
                    d => d.date === format(date, 'yyyy-MM-dd')
                  )}
                  className="rounded-lg border border-border/50"
                />
              </div>

              {/* Legend */}
              <div className="mt-3 flex flex-wrap justify-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-[hsl(var(--calendar-available))] flex-shrink-0"></div>
                  <span className="text-muted-foreground">{t("available")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-[hsl(var(--calendar-selected))] flex-shrink-0"></div>
                  <span className="text-muted-foreground">{t("fullDay")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-[hsl(var(--calendar-half-day))] flex-shrink-0"></div>
                  <span className="text-muted-foreground">{t("halfDay")}</span>
                </div>
                {blockedByConcurrency.size > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="h-3 w-3 rounded-full bg-destructive flex-shrink-0"></div>
                    <span className="text-muted-foreground">{t("notAvailable") || "No disponible"}</span>
                  </div>
                )}
              </div>
              
              {/* Urgent request notice for blocked days */}
              {blockedByConcurrency.size > 0 && (
                <div className="mt-3 bg-destructive/10 border border-destructive/30 rounded-xl p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-destructive">{t("urgentRequestTitle")}</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {t("urgentRequestMessage")}
                      </p>
                      <p className="text-[11px] text-destructive/80 font-medium mt-1">
                        {t("clickBlockedDayHint")}
                      </p>
                    </div>
                  </div>
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
              {selectedDays.length > 0 && (
                <div className="mt-3 bg-secondary/50 rounded-xl p-3">
                  <p className="text-xs font-semibold mb-2 text-foreground">{t("requestedDays")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedDays
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((day, idx) => (
                        <span 
                          key={idx}
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            day.halfDay 
                              ? 'bg-[hsl(var(--calendar-half-day))]/20 text-[hsl(var(--calendar-half-day-foreground))]' 
                              : 'bg-primary/10 text-primary'
                          }`}
                        >
                          {format(new Date(day.date + 'T00:00:00'), "d MMM", { locale })}
                          {day.halfDay && ' ½'}
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Form Card */}
          <Card className="shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold tracking-tight">{t("yourData")}</CardTitle>
              <CardDescription className="font-light tracking-tight">
                {t("completeYourInfo")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Worker info display in form (from verification step) */}
              {workerInfo && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-2">
                  {workerInfo.team && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{t("team")}:</span>
                      <span className="text-sm font-medium">{workerInfo.team.name}</span>
                    </div>
                  )}
                  {workerInfo.workGroup && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{t("vacationGroup")}:</span>
                      <div className="flex items-center gap-2">
                        <div 
                          className="h-4 w-4 rounded-full border border-border/50"
                          style={{ backgroundColor: workerInfo.workGroup.color }}
                        />
                        <span className="text-sm font-medium">{workerInfo.workGroup.name}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">{t("fullName")} *</Label>
                <Input
                  id="name"
                  placeholder={t("fullNamePlaceholder")}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  disabled={!!workerInfo}
                  className={`h-12 text-base ${workerInfo ? 'bg-muted' : ''}`}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">{t("email")} *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t("emailPlaceholder")}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="h-12 text-base"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workerNumber" className="text-sm font-medium">{t("workerNumber")} *</Label>
                <Input
                  id="workerNumber"
                  value={formData.workerNumber}
                  disabled
                  className="h-12 text-base bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  {usedDays > 0 
                    ? t("usedDaysOf").replace("{used}", String(usedDays)).replace("{total}", String(maxDays || department.max_days_per_employee))
                    : `${(maxDays || department.max_days_per_employee) - usedDays} ${t("availableDaysInfo")}`
                  }
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes" className="text-sm font-medium">{t("observations")}</Label>
                <Textarea
                  id="notes"
                  placeholder={t("observationsPlaceholder")}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="text-base"
                />
              </div>
            </CardContent>
          </Card>

          {/* Signature Card */}
          <Card className="shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold tracking-tight flex items-center gap-2">
                <PenLine className="h-5 w-5 text-primary" />
                {t("signature")} *
              </CardTitle>
              <CardDescription className="font-light tracking-tight">
                {t("signatureDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SignaturePad
                onSignatureChange={setSignature}
                clearLabel={t("clearSignature")}
                confirmLabel={t("confirmSignature")}
              />
            </CardContent>
          </Card>

          {/* No days available message */}
          {usedDaysChecked && maxDays > 0 && usedDays >= maxDays && (
            <Card className="bg-destructive/10 border-destructive/30">
              <CardContent className="py-4 text-center">
                <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
                <p className="text-destructive font-semibold">
                  Ya has utilizado todos tus {maxDays} días de vacaciones
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  No puedes enviar más solicitudes para este departamento.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Submit Button - Large and prominent */}
          <Button
            type="submit"
            size="lg"
            disabled={
              submitting || 
              !signature || 
              selectedDays.length === 0 ||
              (maxDays > 0 && usedDays >= maxDays) ||
              (department.require_all_days && totalSelectedDays !== ((maxDays || department.max_days_per_employee) - usedDays)) ||
              totalSelectedDays > ((maxDays || department.max_days_per_employee) - usedDays)
            }
            className="w-full h-14 rounded-xl font-semibold text-lg shadow-lg"
          >
            {submitting ? t("sending") : t("submitRequest")}
          </Button>
        </form>
        </div>
      </div>
      
      {/* Exception Request Modal */}
      <Dialog open={showExceptionModal} onOpenChange={setShowExceptionModal}>
        <DialogContent className="max-w-md mx-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {t("urgentRequestModalTitle")}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {t("urgentRequestModalDesc")}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-2">
            {/* Selected date display */}
            {exceptionDate && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                <p className="text-sm font-medium text-foreground">
                  {t("requestedDays")} {format(new Date(exceptionDate + 'T00:00:00'), "d MMMM yyyy", { locale })}
                </p>
              </div>
            )}
            
            {/* Reason textarea */}
            <div className="space-y-2">
              <Label htmlFor="exception_reason" className="text-sm font-medium">
                {t("urgentRequestReasonLabel")}
              </Label>
              <Textarea
                id="exception_reason"
                placeholder={t("urgentRequestReasonPlaceholder")}
                value={exceptionReason}
                onChange={(e) => setExceptionReason(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>
            
            {/* Action buttons */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowExceptionModal(false)}
                className="flex-1"
                disabled={submittingException}
              >
                {t("cancel")}
              </Button>
              <Button
                onClick={handleSubmitExceptionRequest}
                disabled={!exceptionReason.trim() || submittingException}
                className="flex-1"
              >
                {submittingException ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t("sending")}
                  </>
                ) : (
                  t("urgentRequestSubmit")
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const PublicVacationForm = () => {
  return (
    <LanguageProvider>
      <PublicVacationFormContent />
    </LanguageProvider>
  );
};

export default PublicVacationForm;
