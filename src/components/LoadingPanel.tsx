import verdnaturaLogo from "@/assets/verdnatura-logo.png";
import { Loader2 } from "lucide-react";

type LoadingPanelProps = {
  title?: string;
  description?: string;
  className?: string;
};

export default function LoadingPanel({
  title = "Cargando…",
  description = "Estamos cargando los datos. Un momento, por favor.",
  className = "",
}: LoadingPanelProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 text-muted-foreground gap-4 ${className}`.trim()}>
      <div className="relative">
        <img
          src={verdnaturaLogo}
          alt="Verdnatura"
          className="h-10 w-auto opacity-90"
          loading="lazy"
        />
        <Loader2 className="absolute -right-4 -top-2 h-5 w-5 animate-spin text-primary" />
      </div>
      <div className="text-center space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
