import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, Lock } from "lucide-react";
import { LogoLink } from "@/components/LogoLink";

const SetupPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");
  const redirectTo = searchParams.get("redirect") || "/login";
  const prefilledEmail = searchParams.get("email") || "";

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [tokenValid, setTokenValid] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Enlace no válido. No se proporcionó un token.");
      setLoading(false);
      return;
    }
    validateToken();
  }, [token]);

  const validateToken = async () => {
    try {
      const response = await supabase.functions.invoke("manager-auth", {
        body: {
          action: "validateSetupToken",
          password: token, // pass token in password field
        },
      });

      if (response.error || !response.data?.success) {
        setError(response.data?.error || "El enlace no es válido o ya ha sido utilizado.");
        setLoading(false);
        return;
      }

      setEmail(response.data.email);
      setName(response.data.name);
      setTokenValid(true);
    } catch {
      setError("Error al validar el enlace.");
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await supabase.functions.invoke("manager-auth", {
        body: {
          action: "setupPasswordByToken",
          sessionToken: token, // pass token in sessionToken field
          newPassword: password,
        },
      });

      if (response.error || !response.data?.success) {
        setError(response.data?.error || "Error al configurar la contraseña.");
        setSaving(false);
        return;
      }

      setSuccess(true);
      const target = redirectTo + (prefilledEmail ? `?email=${encodeURIComponent(prefilledEmail)}` : "");
      setTimeout(() => navigate(target), 2500);
    } catch {
      setError("Error de conexión.");
    }
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <LogoLink to="/" />
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <Lock className="h-5 w-5" />
              Configurar contraseña
            </CardTitle>
            <CardDescription>
              {tokenValid ? `Configura tu contraseña para acceder al sistema` : "Verificando enlace..."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : success ? (
              <div className="text-center space-y-4 py-4">
                <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
                <p className="text-lg font-medium">¡Contraseña configurada!</p>
                <p className="text-sm text-muted-foreground">
                  Redirigiendo al login en unos segundos...
                </p>
                <Button onClick={() => navigate(redirectTo + (prefilledEmail ? `?email=${encodeURIComponent(prefilledEmail)}` : ""))} className="w-full">
                  Ir al login ahora
                </Button>
              </div>
            ) : !tokenValid ? (
              <div className="text-center space-y-4 py-4">
                <XCircle className="h-12 w-12 text-destructive mx-auto" />
                <p className="text-sm text-destructive">{error}</p>
                <Button variant="outline" onClick={() => navigate(redirectTo)}>
                  Ir al login
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input value={name} disabled className="bg-muted" />
                </div>

                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={email} disabled className="bg-muted" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    autoFocus
                    required
                    minLength={8}
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
                    required
                    minLength={8}
                  />
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button type="submit" className="w-full" disabled={saving || !password || !confirmPassword}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    "Guardar contraseña"
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SetupPassword;
