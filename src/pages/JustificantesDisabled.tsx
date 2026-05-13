import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

const JustificantesDisabled = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-6">
          <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground mb-2">
          Herramienta no disponible
        </h1>
        <p className="text-muted-foreground mb-6">
          La gestión de justificantes está temporalmente desactivada.
        </p>
        <Button onClick={() => navigate("/")} variant="outline">
          Volver al panel
        </Button>
      </div>
    </div>
  );
};

export default JustificantesDisabled;
