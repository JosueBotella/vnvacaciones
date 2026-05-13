import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Settings, Save, Loader2 } from "lucide-react";

interface BalanceSettings {
  id: string;
  hours_format: string;
  rounding: string;
  alert_threshold: number | null;
}

export function BalanceSettingsTab() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<BalanceSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [hoursFormat, setHoursFormat] = useState("decimal");
  const [rounding, setRounding] = useState("none");
  const [alertThreshold, setAlertThreshold] = useState("");

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const sessionToken = localStorage.getItem("manager_session_token") || localStorage.getItem("managerSessionToken");
      if (!sessionToken) {
        throw new Error("No session token");
      }

      const { data, error } = await supabase.functions.invoke("hour-balance-operations", {
        body: { action: "getSettings", sessionToken },
      });

      if (error) throw error;

      if (data.data) {
        setSettings(data.data);
        setHoursFormat(data.data.hours_format || "decimal");
        setRounding(data.data.rounding || "none");
        setAlertThreshold(data.data.alert_threshold?.toString() || "");
      }
    } catch (error: any) {
      console.error("Error fetching settings:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudieron cargar los ajustes",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const sessionToken = localStorage.getItem("manager_session_token") || localStorage.getItem("managerSessionToken");

      const { data, error } = await supabase.functions.invoke("hour-balance-operations", {
        body: {
          action: "updateSettings",
          sessionToken,
          hours_format: hoursFormat,
          rounding,
          alert_threshold: alertThreshold ? parseFloat(alertThreshold) : null,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      setSettings(data.data);
      toast({
        title: "Ajustes guardados",
        description: "La configuración se ha actualizado correctamente",
      });
    } catch (error: any) {
      toast({
        title: "Error al guardar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Ajustes del Módulo
        </CardTitle>
        <CardDescription>
          Configura cómo se muestran y procesan los balances de horas
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Hours Format */}
        <div className="space-y-2">
          <Label htmlFor="hours-format">Formato de horas</Label>
          <Select value={hoursFormat} onValueChange={setHoursFormat}>
            <SelectTrigger id="hours-format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="decimal">Decimal (ej: 15.5h)</SelectItem>
              <SelectItem value="hhmm">Horas:Minutos (ej: 15:30)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            Cómo se muestran las horas en las tablas y badges
          </p>
        </div>

        {/* Rounding */}
        <div className="space-y-2">
          <Label htmlFor="rounding">Redondeo</Label>
          <Select value={rounding} onValueChange={setRounding}>
            <SelectTrigger id="rounding">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin redondeo</SelectItem>
              <SelectItem value="integer">Enteros</SelectItem>
              <SelectItem value="half">Media hora (0.5h)</SelectItem>
              <SelectItem value="quarter">Cuarto de hora (0.25h)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            Redondeo aplicado a los valores mostrados
          </p>
        </div>

        {/* Alert Threshold */}
        <div className="space-y-2">
          <Label htmlFor="alert-threshold">Umbral de alerta (opcional)</Label>
          <div className="flex items-center gap-2">
            <Input
              id="alert-threshold"
              type="number"
              value={alertThreshold}
              onChange={(e) => setAlertThreshold(e.target.value)}
              placeholder="Ej: -20"
              className="max-w-[150px]"
            />
            <span className="text-muted-foreground">horas</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Los balances por debajo de este valor se destacarán visualmente.
            Deja vacío para desactivar.
          </p>
        </div>

        {/* Save Button */}
        <div className="pt-4">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Guardar ajustes
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
