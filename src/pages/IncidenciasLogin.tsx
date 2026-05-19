/**
 * Login page dedicated to Control de Incidencias module.
 * Uses email + password authentication.
 * Only allows admin and manager roles (consulta excluded).
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoLink } from "@/components/LogoLink";
import { Loader2, LogIn, ShieldAlert, Mail, Lock, CheckCircle2 } from "lucide-react";
import { useManagerAuth } from "@/modules/auth/hooks/useManagerAuth";
import { supabase } from "@/integrations/supabase/client";
import LoadingScreen from "@/components/LoadingScreen";

const IncidenciasLogin = () => {
  const navigate = useNavigate();
  const { loginByEmail, isAuthenticated, manager } = useManagerAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberSession, setRememberSession] = useState(true);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [settingPassword, setSettingPassword] = useState(false);
  const [passwordSet, setPasswordSet] = useState(false);

  useEffect(() => {
    if (isAuthenticated && manager) {
      if (manager.role === "admin" || manager.role === "manager") {
        navigate("/control-incidencias", { replace: true });
      } else {
        toast.error("No tienes acceso al módulo de incidencias");
        navigate("/", { replace: true });
      }
    }
    setCheckingSession(false);
  }, [isAuthenticated, manager, navigate]);

  const checkEmailNeedsPassword = async (emailToCheck: string) => {
    if (!emailToCheck || !emailToCheck.includes('@')) return;
    try {
      const response = await supabase.functions.invoke('manager-auth', {
        body: { action: 'checkEmailNeedsPassword', email: emailToCheck },
      });
      if (response.data?.success && response.data?.needsPassword) {
        setShowSetPassword(true);
      }
    } catch {}
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Introduce tu email y contraseña");
      return;
    }
    setLoading(true);
    const result = await loginByEmail(email, password, rememberSession);
    if (result.locked) {
      toast.error(result.error || "Cuenta bloqueada temporalmente");
    } else if (result.success) {
      navigate("/control-incidencias", { replace: true });
    } else if (result.needsPassword) {
      setShowSetPassword(true);
    } else {
      const msg = result.remainingAttempts !== undefined && result.remainingAttempts <= 2
        ? `${result.error} (${result.remainingAttempts} intento${result.remainingAttempts !== 1 ? 's' : ''} restante${result.remainingAttempts !== 1 ? 's' : ''})`
        : (result.error || "Credenciales incorrectas");
      toast.error(msg);
    }
    setLoading(false);
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    setSettingPassword(true);
    try {
      const response = await supabase.functions.invoke("manager-auth", {
        body: { action: "setPasswordByEmail", email, newPassword },
      });
      if (response.error || !response.data?.success) {
        toast.error(response.data?.error || "Error al configurar la contraseña");
      } else {
        setPasswordSet(true);
        toast.success("¡Contraseña configurada! Ahora puedes iniciar sesión.");
        setTimeout(() => {
          setShowSetPassword(false);
          setPasswordSet(false);
          setPassword("");
          setNewPassword("");
          setConfirmNewPassword("");
        }, 2000);
      }
    } catch {
      toast.error("Error de conexión");
    }
    setSettingPassword(false);
  };

  if (checkingSession) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-3 py-4 sm:p-4">
      <div className="fixed right-4 z-50 animate-fade-in" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}>
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-md shadow-xl border-border/50 opacity-0 animate-scale-in">
        <CardHeader className="space-y-2 text-center px-4 sm:px-6">
          <div className="flex justify-center mb-4 md:mb-6">
            <LogoLink to="/" className="h-16 w-16 md:h-20 md:w-20 object-contain" />
          </div>
          <div className="flex items-center justify-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
            <CardTitle className="text-2xl md:text-3xl font-semibold text-primary tracking-tight">
              {showSetPassword ? "Configurar contraseña" : "Control de Incidencias"}
            </CardTitle>
          </div>
          <CardDescription className="font-light tracking-tight">
            {showSetPassword
              ? "Tu cuenta no tiene contraseña. Configúrala para acceder."
              : "Acceso para encargados y administradores"}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          {showSetPassword ? (
            passwordSet ? (
              <div className="text-center space-y-4 py-4">
                <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
                <p className="text-lg font-medium">¡Contraseña configurada!</p>
                <p className="text-sm text-muted-foreground">Ya puedes iniciar sesión...</p>
              </div>
            ) : (
              <form onSubmit={handleSetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={email} disabled className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">Nueva contraseña</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      className="pl-9"
                      required
                      minLength={8}
                      autoFocus
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmNewPassword">Confirmar contraseña</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmNewPassword"
                      type="password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Repite la contraseña"
                      className="pl-9"
                      required
                      minLength={8}
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full rounded-xl font-normal h-12 text-base"
                  disabled={settingPassword || !newPassword || !confirmNewPassword}
                >
                  {settingPassword ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</>
                  ) : (
                    "Guardar contraseña"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => { setShowSetPassword(false); setNewPassword(""); setConfirmNewPassword(""); }}
                >
                  Volver al login
                </Button>
              </form>
            )
          ) : (
            <>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={(e) => checkEmailNeedsPassword(e.target.value)}
                      placeholder="tu@email.com"
                      className="pl-9 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                      required
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                    required
                    autoComplete="current-password"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="remember"
                    checked={rememberSession}
                    onCheckedChange={(checked) => setRememberSession(!!checked)}
                  />
                  <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">
                    Mantener sesión abierta
                  </Label>
                </div>

                <Button
                  type="submit"
                  className="w-full rounded-xl font-normal h-12 text-base transition-all duration-200 active:scale-[0.98]"
                  disabled={loading}
                >
                  {loading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Iniciando sesión...</>
                  ) : (
                    <><LogIn className="mr-2 h-4 w-4" />Iniciar sesión</>
                  )}
                </Button>
              </form>

              <div className="text-xs text-center text-muted-foreground font-light mt-6 space-y-1">
                <p>Utiliza tu correo corporativo: <span className="font-medium">nombre@verdnatura.es</span></p>
                <p>Si no tienes email configurado, contacta con el administrador.</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default IncidenciasLogin;
