import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, ArrowRight, Accessibility } from "lucide-react";

export function StepDisability({
  value,
  onChange,
  onNext,
  onBack,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col items-center gap-6 text-center animate-in fade-in slide-in-from-right-4 duration-300">
      <Accessibility className="h-12 w-12 text-primary/60" />
      <h2 className="text-lg font-semibold">{t("apply_disability_title")}</h2>
      <p className="text-sm text-muted-foreground max-w-xs">{t("apply_disability_desc")}</p>

      <div className="flex items-center gap-3 p-4 rounded-xl border bg-muted/20">
        <Switch checked={value} onCheckedChange={onChange} />
        <span className="text-sm">{t("apply_disability_yes")}</span>
      </div>

      <div className="flex gap-3 w-full mt-4">
        <Button variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft className="h-4 w-4 me-1" /> {t("apply_back")}
        </Button>
        <Button onClick={onNext} className="flex-1">
          {t("apply_next")} <ArrowRight className="h-4 w-4 ms-1" />
        </Button>
      </div>
    </div>
  );
}
