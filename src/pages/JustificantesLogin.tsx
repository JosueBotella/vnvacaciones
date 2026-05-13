import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, LogIn, FileText, Copy, ExternalLink, Check } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoLink } from "@/components/LogoLink";
import LoadingScreen from "@/components/LoadingScreen";

type RrhhUser = {
  id: string;
  name: string;
  role: string;
  is_active: boolean;
  type: "manager" | "rrhh";
};

const JustificantesLogin = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [users, setUsers] = useState<RrhhUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);
  
  // Password creation flow
  const [needsPassword, setNeedsPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pendingUser, setPendingUser] = useState<{ id: string; name: string; role: string; type: string } | null>(null);

  const formUrl = "https://vnprod.app/justificantes";

  useEffect(() => {
    const checkExistingSession = async () => {
      const rrhhSession = localStorage.getItem("rrhh_session");
      if (rrhhSession) {
        try {
          const session = JSON.parse(rrhhSession);
          const { data } = await supabase.functions.invoke("justificantes-operations", {
            body: { action: "validateRrhhSession", data: { sessionToken: session.sessionToken } }
          });
          if (data?.success) {
            navigate("/admin/justificantes");
            return;
          }
        } catch (e) {
          console.error("Error validating session:", e);
        }
        localStorage.removeItem("rrhh_session");
      }

      const managerToken = localStorage.getItem("manager_session_token");
      if (managerToken) {
        try {
          const { data } = await supabase.functions.invoke("manager-auth", {
            body: { action: "validateSession", sessionToken: managerToken }
          });
          if (data?.success && data?.manager?.role === "admin") {
            localStorage.setItem("rrhh_session", JSON.stringify({
              userId: data.manager.id,
              name: data.manager.name,
              role: "admin",
              type: "manager",
              sessionToken: managerToken,
              isAdmin: true,
            }));
            navigate("/admin/justificantes");
            return;
          }
        } catch (e) {
          console.error("Error validating manager session:", e);
        }
      }
    };

    checkExistingSession();
    fetchRrhhUsers();
  }, [navigate]);

  const fetchRrhhUsers = async () => {
    try {
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: { action: "getPublicRrhhUsers", data: {} }
      });
      if (data?.success) {
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error("Error fetching RRHH users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUserSelect = async (userId: string) => {
    setSelectedUserId(userId);
    setPassword("");
    
    const selectedUser = users.find(u => u.id === userId);
    if (!selectedUser) return;

    try {
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: { 
          action: "checkNeedsPassword", 
          data: { userId, userType: selectedUser.type } 
        }
      });

      if (data?.needsPassword) {
        setPendingUser({ 
          id: userId, 
          name: selectedUser.name, 
          role: selectedUser.role, 
          type: selectedUser.type 
        });
        setNeedsPassword(true);
      }
    } catch (error) {
      console.error("Error checking password status:", error);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedUserId) {
      toast.error("Selecciona un usuario");
      return;
    }
    if (!password) {
      toast.error("Introduce la contraseña");
      return;
    }

    setLoginLoading(true);
    try {
      const selectedUser = users.find(u => u.id === selectedUserId);
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: { 
          action: "loginRrhhUser", 
          data: { userId: selectedUserId, password, userType: selectedUser?.type } 
        }
      });

      if (data?.needsPassword) {
        setPendingUser(data.user);
        setNeedsPassword(true);
        setPassword("");
      } else if (data?.success) {
        localStorage.setItem("rrhh_session", JSON.stringify({
          userId: data.user.id,
          name: data.user.name,
          role: data.user.role,
          type: data.user.type,
          sessionToken: data.sessionToken,
          isAdmin: data.isAdmin || false,
        }));
        toast.success(`Bienvenido/a, ${data.user.name}`);
        navigate("/admin/justificantes");
      } else if (data?.locked) {
        toast.error("Cuenta bloqueada temporalmente. Espera 15 minutos.");
      } else if (data?.remainingAttempts !== undefined && data.remainingAttempts <= 2) {
        toast.error(`Contraseña incorrecta. Te quedan ${data.remainingAttempts} intento(s).`);
      } else {
        toast.error(data?.error || "Error al iniciar sesión");
      }
    } catch (error) {
      console.error("Login error:", error);
      toast.error("Error al iniciar sesión");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newPassword || newPassword.length < 4) {
      toast.error("La contraseña debe tener al menos 4 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }

    setLoginLoading(true);
    try {
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: { 
          action: "setRrhhPassword", 
          data: { userId: pendingUser?.id, password: newPassword } 
        }
      });

      if (data?.success) {
        localStorage.setItem("rrhh_session", JSON.stringify({
          userId: data.user.id,
          name: data.user.name,
          role: data.user.role,
          type: data.user.type,
          sessionToken: data.sessionToken,
        }));
        toast.success(`¡Contraseña creada! Bienvenido/a, ${data.user.name}`);
        navigate("/admin/justificantes");
      } else {
        toast.error(data?.error || "Error al crear contraseña");
      }
    } catch (error) {
      console.error("Set password error:", error);
      toast.error("Error al crear contraseña");
    } finally {
      setLoginLoading(false);
    }
  };

  const copyFormLink = () => {
    navigator.clipboard.writeText(formUrl);
    setCopied(true);
    toast.success("Enlace copiado");
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
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
            <FileText className="h-6 w-6 text-primary" />
            <CardTitle className="text-2xl md:text-3xl font-semibold text-primary tracking-tight">
              Gestión de Justificantes
            </CardTitle>
          </div>
          <CardDescription className="font-light tracking-tight">
            Panel de administración para RRHH
          </CardDescription>
        </CardHeader>
        
        <CardContent className="px-4 sm:px-6">
          {users.length === 0 ? (
            <div className="text-center py-8 space-y-4">
              <p className="text-muted-foreground">
                No hay usuarios RRHH configurados.
              </p>
              <p className="text-sm text-muted-foreground">
                Contacta con el administrador para crear usuarios.
              </p>
            </div>
          ) : needsPassword && pendingUser ? (
            <form onSubmit={handleSetPassword} className="space-y-4">
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-center">
                <p className="font-medium text-primary">¡Hola, {pendingUser.name}!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Es tu primer inicio de sesión. Crea tu contraseña.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">Nueva contraseña</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 4 caracteres"
                  className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repite la contraseña"
                  className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <Button 
                type="submit" 
                className="w-full rounded-xl font-normal h-12 text-base transition-all duration-200 active:scale-[0.98]" 
                disabled={loginLoading}
              >
                {loginLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creando...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Crear Contraseña
                  </>
                )}
              </Button>

              <Button 
                type="button"
                variant="ghost" 
                className="w-full" 
                onClick={() => {
                  setNeedsPassword(false);
                  setPendingUser(null);
                  setNewPassword("");
                  setConfirmPassword("");
                }}
              >
                Volver
              </Button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="user">Usuario</Label>
                <Select value={selectedUserId} onValueChange={handleUserSelect}>
                  <SelectTrigger id="user" className="transition-all duration-200 focus:ring-2 focus:ring-primary/20">
                    <SelectValue placeholder="Selecciona tu usuario" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                        {user.type === "manager" && (
                          <span className="text-xs text-primary ml-2">(Admin)</span>
                        )}
                        {user.role === "admin_principal" && user.type === "rrhh" && (
                          <span className="text-xs text-muted-foreground ml-2">(Admin RRHH)</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <Button 
                type="submit" 
                className="w-full rounded-xl font-normal h-12 text-base transition-all duration-200 active:scale-[0.98]" 
                disabled={loginLoading}
              >
                {loginLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Accediendo...
                  </>
                ) : (
                  <>
                    <LogIn className="mr-2 h-4 w-4" />
                    Acceder
                  </>
                )}
              </Button>
            </form>
          )}

          {/* Form link section */}
          <div className="pt-6 mt-6 border-t border-border">
            <Label className="text-xs text-muted-foreground">
              Enlace del formulario para trabajadores
            </Label>
            <div className="flex items-center gap-2 mt-2">
              <Input
                value={formUrl}
                readOnly
                className="text-sm bg-muted"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={copyFormLink}
                className="shrink-0"
              >
                {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => window.open(formUrl, "_blank")}
                className="shrink-0"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default JustificantesLogin;
