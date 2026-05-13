import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ChevronLeft, Info } from "lucide-react";

type Props = {
  level: number;
  onLevelChange: (l: number) => void;
  onNext: () => void;
  onBack: () => void;
};

const LEVEL_KEYS = ["apply_spanish_1", "apply_spanish_2", "apply_spanish_3", "apply_spanish_4", "apply_spanish_5"];

export function StepSpanishLevel({ level, onLevelChange, onNext, onBack }: Props) {
  const { t } = useLanguage();

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="h-4 w-4" />
        {t("apply_back")}
      </button>

      <h2 className="text-lg font-semibold">{t("apply_step_spanish")}</h2>

      <div className="space-y-6 py-4">
        <div className="text-center">
          <span className="text-4xl font-bold text-primary">{level}</span>
          <p className="text-sm text-muted-foreground mt-1">{t(LEVEL_KEYS[level - 1])}</p>
        </div>

        <Slider
          value={[level]}
          onValueChange={([v]) => onLevelChange(v)}
          min={1}
          max={5}
          step={1}
          className="w-full"
        />

        <div className="flex justify-between text-[10px] text-muted-foreground px-1">
          {LEVEL_KEYS.map((key, i) => (
            <span key={i} className={`${level === i + 1 ? "text-primary font-medium" : ""}`}>
              {t(key)}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
        <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700 dark:text-amber-400">{t("apply_spanish_warning")}</p>
      </div>

      <Button size="lg" className="w-full h-14 text-lg rounded-xl" onClick={onNext}>
        {t("apply_next")}
      </Button>
    </div>
  );
}
