import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoLink } from "@/components/LogoLink";
import { Loader2, LogIn, Mail } from "lucide-react";
import LoadingScreen from "@/components/LoadingScreen";

// Admin access is validated server-side via user_roles table

const AdminLogin = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);

  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MS = 15 * 60 * 1000;

  const checkAdminRole = async (userId: string): Promise<boolean> => {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    return !!data;
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          const isAdmin = await checkAdminRole(session.user.id);
          if (isAdmin) {
            navigate("/admin");
          } else {
            supabase.auth.signOut();
            toast.error("No tienes permisos de administrador");
          }
        }
        setChecking(false);
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const isAdmin = await checkAdminRole(session.user.id);
        if (isAdmin) {
          navigate("/admin");
        } else {
          supabase.auth.signOut();
        }
      }
      setChecking(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (lockedUntil && Date.now() < lockedUntil) {
      const mins = Math.ceil((lockedUntil - Date.now()) / 60000);
      toast.error(`Cuenta bloqueada temporalmente. Espera ${mins} minutos.`);
      return;
    }

    if (!email.endsWith("@verdnatura.es")) {
      toast.error("Email no autorizado");
      return;
    }

    setLoading(true);
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (loginError) {
        if (loginError.message.includes("Invalid login credentials")) {
          const newAttempts = failedAttempts + 1;
          setFailedAttempts(newAttempts);
          if (newAttempts >= MAX_ATTEMPTS) {
            setLockedUntil(Date.now() + LOCKOUT_MS);
            toast.error(`Demasiados intentos fallidos. Cuenta bloqueada por 15 minutos.`);
          } else {
            const remaining = MAX_ATTEMPTS - newAttempts;
            if (remaining <= 2) {
              toast.error(`Credenciales incorrectas. Te quedan ${remaining} intento(s).`);
            } else {
              toast.error("Credenciales incorrectas");
            }
          }
        } else {
          toast.error(loginError.message);
        }
      } else {
        setFailedAttempts(0);
        setLockedUntil(null);
      }
    } catch (error: any) {
      toast.error("Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
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
          <CardTitle className="text-2xl md:text-3xl font-semibold text-primary tracking-tight">
            Gestión de Vacaciones
          </CardTitle>
          <CardDescription className="font-light tracking-tight">
            Acceso exclusivo para administradores
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
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
            <Button 
              type="submit"
              className="w-full rounded-xl font-normal h-12 text-base transition-all duration-200 active:scale-[0.98]"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Iniciando sesión...
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
            <p>Solo usuarios autorizados pueden acceder</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLogin;
