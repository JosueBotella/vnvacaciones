import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useManagerAuth } from "@/hooks/useManagerAuth";
import LoadingScreen from "@/components/LoadingScreen";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FileUser, Loader2, LogIn, Mail } from "lucide-react";
import { LogoLink } from "@/components/LogoLink";
import { toast } from "sonner";

export default function CandidaturasLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { manager, isLoading: authLoading, loginByEmail } = useManagerAuth();

  const [email, setEmail] = useState(() => searchParams.get("email") || "");
  const [password, setPassword] = useState("");
  const [rememberSession, setRememberSession] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      if (manager) {
        if (manager.candidaturas_only) {
          navigate("/candidaturas", { replace: true });
          return;
        }
        if (manager.role === "admin" || manager.role === "consulta") {
          navigate("/admin?module=candidaturas&tab=candidaturas", { replace: true });
          return;
        }
      }
      setIsLoading(false);
    }
  }, [manager, authLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Introduce tu email y contraseña");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await loginByEmail(email, password, rememberSession);
      if (result.success) {
        toast.success("Bienvenido al panel de Candidaturas");
        // Redirect handled by useEffect once `manager` is set
      } else if (result.locked) {
        toast.error("Demasiados intentos fallidos. Espera 15 minutos.");
      } else if (result.remainingAttempts !== undefined && result.remainingAttempts <= 2) {
        toast.error(`Contraseña incorrecta. Te quedan ${result.remainingAttempts} intento(s).`);
      } else if (result.needsPassword) {
        toast.error("Tu cuenta no tiene contraseña configurada. Contacta con el administrador.");
      } else {
        toast.error(result.error || "Credenciales incorrectas");
      }
    } catch (error) {
      console.error("Login error:", error);
      toast.error("Error al iniciar sesión");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || authLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-3 py-4 sm:p-4">
      <div className="fixed right-4 z-50 animate-fade-in" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}>
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-md shadow-xl border-border/50 opacity-0 animate-scale-in overflow-hidden">
        <CardHeader className="space-y-2 text-center px-4 sm:px-6">
          <div className="flex justify-center mb-4 md:mb-6">
            <LogoLink to="/" className="h-16 w-16 md:h-20 md:w-20 object-contain" />
          </div>
          <div className="flex items-center justify-center gap-2">
            <FileUser className="h-6 w-6 text-blue-500" />
            <CardTitle className="text-2xl md:text-3xl font-semibold text-blue-500 tracking-tight">
              Candidaturas
            </CardTitle>
          </div>
          <CardDescription className="font-light tracking-tight">
            Filtrado inteligente de CVs con IA
          </CardDescription>
        </CardHeader>

        <CardContent className="px-4 sm:px-6">
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
                  placeholder="tu@email.com"
                  className="pl-9 transition-all duration-200 focus:ring-2 focus:ring-blue-500/20"
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="transition-all duration-200 focus:ring-2 focus:ring-blue-500/20"
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
              className="w-full rounded-xl font-normal h-12 text-base transition-all duration-200 active:scale-[0.98] bg-blue-500 hover:bg-blue-600"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Accediendo...
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  Iniciar sesión
                </>
              )}
            </Button>
          </form>

          <div className="text-xs text-center text-muted-foreground font-light mt-6 space-y-1">
            <p>Utiliza tu correo corporativo: <span className="font-medium">nombre@verdnatura.es</span></p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
