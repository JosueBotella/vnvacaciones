import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Loader2,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  Mail,
  CheckCircle,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useLanguage } from "@/hooks/useLanguage";
import { LogoLink } from "@/components/LogoLink";
import LoadingScreen from "@/components/LoadingScreen";

type AuthState = 'initial' | 'needsRegistration' | 'needsLogin' | 'forgotPassword';

type WorkerLookupResult = {
  worker: {
    id: string;
    name: string;
    worker_number: string;
    department_id: string;
    email?: string | null;
  } | null;
};

const WorkerScheduleLoginContent = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, isRTL } = useLanguage();
  
  // Get redirect parameter
  const redirectTo = searchParams.get('redirect') || '/mi-horario';
  
  const [workerNumber, setWorkerNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [lookupResult, setLookupResult] = useState<WorkerLookupResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  
  // Authentication state
  const [authState, setAuthState] = useState<AuthState>('initial');
  const [checkingAuth, setCheckingAuth] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [workerEmail, setWorkerEmail] = useState<string | null>(null);

  const resolveExistingSession = useCallback(async () => {
    const retryDelaysMs = [0, 300, 900, 1600];

    for (const delayMs of retryDelaysMs) {
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session) return session;
    }

    return null;
  }, []);

  // Check if already authenticated
  useEffect(() => {
    const checkExistingAuth = async () => {
      try {
        const session = await resolveExistingSession();

        if (session) {
          const { data, error } = await supabase.functions.invoke("worker-personal", {
            body: { action: "getMyGroup" },
          });

          if (!error && data?.success) {
            navigate(redirectTo, { replace: true });
            return;
          }
        }
      } catch (err) {
        console.error('Auth check error:', err);
      } finally {
        setInitialLoading(false);
      }
    };

    void checkExistingAuth();
  }, [navigate, redirectTo, resolveExistingSession]);

  const handleLookup = async () => {
    if (!workerNumber.trim()) {
      toast.error(t("enterWorkerNumber") || "Introduce tu número de fichar");
      return;
    }

    setLoading(true);
    setNotFound(false);
    setLookupResult(null);
    setAuthState('initial');

    try {
      const { data, error } = await supabase.functions.invoke("submit-vacation-request", {
        body: {
          action: 'lookup-worker-global',
          workerNumber: workerNumber.trim(),
        }
      });

      if (error) throw error;

      if (data?.success && data.worker) {
        setLookupResult({ worker: data.worker });
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
        body: { action: 'checkRegistration', workerId }
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
        if (email) setRegisterEmail(email);
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
          action: "register",
          workerId: lookupResult.worker.id,
          email: registerEmail.trim(),
          password,
          siteUrl: window.location.origin,
        },
      });

      if (error) {
        toast.error(error.message || "Error al crear cuenta");
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      // After registration, immediately log in to create a real session
      const loginRes = await supabase.functions.invoke("worker-auth", {
        body: {
          action: "login",
          workerId: lookupResult.worker.id,
          password,
        },
      });

      if (loginRes.error || loginRes.data?.error) {
        toast.error(loginRes.data?.error || t("invalidPassword"));
        return;
      }

      const session = loginRes.data?.session;
      if (session?.access_token && session?.refresh_token) {
        await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
      }

      toast.success(t("accountCreated"));
      navigate(redirectTo, { replace: true });
    } catch (err) {
      console.error("Error registering:", err);
      toast.error("Error al crear cuenta");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!lookupResult?.worker) return;

    if (!password.trim()) {
      toast.error(t("passwordPlaceholder"));
      return;
    }

    setAuthLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("worker-auth", {
        body: {
          action: "login",
          workerId: lookupResult.worker.id,
          password,
        },
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
      if (session?.access_token && session?.refresh_token) {
        await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
      }

      if (data?.success) {
        toast.success("¡Bienvenido!");
        navigate(redirectTo, { replace: true });
      }
    } catch (err) {
      console.error("Error logging in:", err);
      toast.error(t("invalidPassword"));
    } finally {
      setAuthLoading(false);
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

  const handleBack = () => {
    setLookupResult(null);
    setAuthState('initial');
    setPassword("");
    setConfirmPassword("");
    setNotFound(false);
    setWorkerNumber("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleLookup();
    }
  };

  if (initialLoading) {
    return <LoadingScreen />;
  }

  return (
    <div 
      className="min-h-screen bg-background flex flex-col"
      dir={isRTL ? "rtl" : "ltr"}
    >
      {/* Top Bar */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-border/50 bg-background/95 backdrop-blur-sm sticky top-0 z-50">
        <LanguageSelector />
        <ThemeToggle />
      </div>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-3 py-4 sm:p-4">
        <Card className="w-full max-w-md shadow-xl border-border/50 overflow-hidden">
          <CardHeader className="text-center pb-4 px-4 sm:px-6">
            <div className="flex justify-center mb-3">
              <LogoLink to="/" className="h-14 w-14 object-contain" />
            </div>
            <CardTitle className="text-xl sm:text-2xl">{t("mySchedule")}</CardTitle>
            <CardDescription className="text-sm">
              {t("scheduleLoginSubtitle")}
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
                onKeyPress={handleKeyPress}
                disabled={loading || !!lookupResult?.worker}
                className="text-center text-lg h-12"
              />
            </div>

            {/* Only show continue button if worker not found yet */}
            {!lookupResult?.worker && !notFound && (
              <Button 
                onClick={handleLookup} 
                disabled={loading || !workerNumber.trim()}
                className="w-full h-12"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    {t("searchingWorker") || "Buscando..."}
                  </>
                ) : (
                  t("continue")
                )}
              </Button>
            )}

            {/* Worker not found */}
            {notFound && (
              <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 space-y-3 animate-fade-in">
                <p className="text-sm text-destructive text-center">
                  {t("workerNotFound") || "No se encontró ningún trabajador con ese número"}
                </p>
                <Button 
                  variant="outline" 
                  onClick={handleBack}
                  className="w-full"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t("tryAgain") || "Intentar de nuevo"}
                </Button>
              </div>
            )}

            {/* Worker found - show info and authentication */}
            {lookupResult?.worker && (
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
                    </div>
                    
                    {/* Registration form for first-time users */}
                    {authState === 'needsRegistration' && (
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
                        
                        <Button variant="ghost" size="sm" onClick={handleBack} className="w-full">
                          <ArrowLeft className="h-4 w-4 mr-2" />
                          {t("changeNumber") || "Cambiar número"}
                        </Button>
                      </div>
                    )}
                    
                    {/* Login form for registered users */}
                    {authState === 'needsLogin' && (
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
                          onClick={handleLogin} 
                          disabled={authLoading || !password.trim()} 
                          className="w-full"
                        >
                          {authLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              {t("loggingIn")}
                            </>
                          ) : (
                            t("continue")
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
                        
                        <Button variant="ghost" size="sm" onClick={handleBack} className="w-full">
                          <ArrowLeft className="h-4 w-4 mr-2" />
                          {t("changeNumber") || "Cambiar número"}
                        </Button>
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
                  </>
                )}
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

const WorkerScheduleLogin = () => <WorkerScheduleLoginContent />;

export default WorkerScheduleLogin;
