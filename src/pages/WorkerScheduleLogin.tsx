import { useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useWorkerAuth } from "@/modules/auth/hooks/useWorkerAuth";

const WorkerScheduleLoginContent = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, isRTL } = useLanguage();

  const redirectTo = searchParams.get('redirect') || '/mi-horario';

  const handleAuthenticated = useCallback(async (_workerNumber: string) => {
    navigate(redirectTo, { replace: true });
  }, [navigate, redirectTo]);

  const handleSessionAlreadyValid = useCallback(async (_session: Session) => {
    const { data, error } = await supabase.functions.invoke("worker-personal", {
      body: { action: "getMyGroup" },
    });
    if (!error && data?.success) {
      navigate(redirectTo, { replace: true });
    }
  }, [navigate, redirectTo]);

  const {
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
    lookup, register, login, forgotPassword, back, handleKeyPress,
  } = useWorkerAuth({ onAuthenticated: handleAuthenticated, onSessionAlreadyValid: handleSessionAlreadyValid });

  if (initialLoading) return <LoadingScreen />;

  return (
    <div
      className="min-h-screen bg-background flex flex-col"
      dir={isRTL ? "rtl" : "ltr"}
    >
      <div className="flex justify-between items-center px-4 py-3 border-b border-border/50 bg-background/95 backdrop-blur-sm sticky top-0 z-50">
        <LanguageSelector />
        <ThemeToggle />
      </div>

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
            <div className="space-y-2">
              <Label htmlFor="workerNumber">{t("workerNumber")}</Label>
              <Input
                id="workerNumber"
                type="text"
                placeholder="Ej: 1234"
                value={workerNumber}
                onChange={(e) => setWorkerNumber(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={loading || !!worker}
                className="text-center text-lg h-12"
              />
            </div>

            {!worker && !notFound && (
              <Button
                onClick={lookup}
                disabled={loading || !workerNumber.trim()}
                className="w-full h-12"
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t("searchingWorker") || "Buscando..."}</>
                ) : t("continue")}
              </Button>
            )}

            {notFound && (
              <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 space-y-3 animate-fade-in">
                <p className="text-sm text-destructive text-center">
                  {t("workerNotFound") || "No se encontró ningún trabajador con ese número"}
                </p>
                <Button variant="outline" onClick={back} className="w-full">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t("tryAgain") || "Intentar de nuevo"}
                </Button>
              </div>
            )}

            {worker && (
              <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3 animate-fade-in">
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
                        <span className="font-medium">{worker.name}</span>
                      </div>
                    </div>

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
                          onClick={register}
                          disabled={authLoading || !registerEmail.trim() || password.length < 6 || password !== confirmPassword}
                          className="w-full"
                        >
                          {authLoading ? (
                            <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t("registering")}</>
                          ) : t("createAccount")}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={back} className="w-full">
                          <ArrowLeft className="h-4 w-4 mr-2" />
                          {t("changeNumber") || "Cambiar número"}
                        </Button>
                      </div>
                    )}

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
                              onKeyPress={(e) => e.key === 'Enter' && login()}
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
                          onClick={login}
                          disabled={authLoading || !password.trim()}
                          className="w-full"
                        >
                          {authLoading ? (
                            <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t("loggingIn")}</>
                          ) : t("continue")}
                        </Button>
                        <button
                          type="button"
                          onClick={forgotPassword}
                          disabled={authLoading}
                          className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
                        >
                          {t("forgotPassword")}
                        </button>
                        <Button variant="ghost" size="sm" onClick={back} className="w-full">
                          <ArrowLeft className="h-4 w-4 mr-2" />
                          {t("changeNumber") || "Cambiar número"}
                        </Button>
                      </div>
                    )}

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
