import { useLanguage } from "@/hooks/useLanguage";
import { CheckCircle2 } from "lucide-react";

export function StepSuccess() {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6 text-center px-6">
      <div className="h-20 w-20 rounded-full bg-green-500/10 flex items-center justify-center">
        <CheckCircle2 className="h-10 w-10 text-green-500" />
      </div>
      <h1 className="text-xl font-semibold text-foreground">{t("apply_success_title")}</h1>
      <p className="text-muted-foreground text-sm max-w-xs">{t("apply_success_message")}</p>
    </div>
  );
}
