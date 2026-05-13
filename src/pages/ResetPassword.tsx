import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Lock, CheckCircle, Eye, EyeOff } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoLink } from "@/components/LogoLink";
import { useNavigate } from "react-router-dom";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Handle the password reset from email link
    const handlePasswordReset = async () => {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const type = hashParams.get('type');
      
      if (type === 'recovery' && accessToken) {
        // Set the session with the recovery token
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: hashParams.get('refresh_token') || '',
        });
      }
    };
    
    handlePasswordReset();
  }, []);

  const handleUpdatePassword = async () => {
    if (password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    
    if (password !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    
    setLoading(true);
    
    try {
      const { error } = await supabase.auth.updateUser({ password });
      
      if (error) {
        toast.error(error.message);
        return;
      }
      
      setSuccess(true);
      toast.success("Contraseña actualizada correctamente");
      
      // Sign out and redirect after 3 seconds
      setTimeout(async () => {
        await supabase.auth.signOut();
        navigate('/vacaciones');
      }, 3000);
    } catch (err) {
      console.error("Error updating password:", err);
      toast.error("Error al actualizar la contraseña");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex justify-end items-center px-4 py-3 border-b border-border/50">
          <ThemeToggle />
        </div>
        <main className="flex-1 flex items-center justify-center px-3 py-4 sm:p-4">
          <Card className="w-full max-w-md shadow-xl overflow-hidden">
            <CardContent className="pt-8 pb-6 text-center px-4 sm:px-6">
              <div className="mx-auto w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                <CheckCircle className="h-10 w-10 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">¡Contraseña actualizada!</h2>
              <p className="text-muted-foreground">
                Tu contraseña ha sido actualizada correctamente. Redirigiendo al formulario de vacaciones...
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex justify-end items-center px-4 py-3 border-b border-border/50">
        <ThemeToggle />
      </div>
      
      <main className="flex-1 flex items-center justify-center px-3 py-4 sm:p-4">
        <Card className="w-full max-w-md shadow-xl overflow-hidden">
          <CardHeader className="text-center pb-4 px-4 sm:px-6">
            <div className="flex justify-center mb-3">
              <LogoLink to="/" className="h-14 w-14 object-contain" />
            </div>
            <CardTitle className="text-xl">Nueva contraseña</CardTitle>
            <CardDescription>Introduce tu nueva contraseña</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-4 sm:px-6">
            <div className="space-y-2">
              <Label htmlFor="password">Nueva contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
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
            
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repite la contraseña"
                  className="pl-9"
                />
              </div>
            </div>
            
            <Button 
              onClick={handleUpdatePassword}
              disabled={loading || password.length < 6 || password !== confirmPassword}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Actualizando...
                </>
              ) : (
                "Actualizar contraseña"
              )}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ResetPassword;
