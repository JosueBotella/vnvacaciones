import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

const VEHICLES = [
  { value: "none" as const, emoji: "🚶", key: "apply_vehicle_none" },
  { value: "skate" as const, emoji: "🛹", key: "apply_vehicle_skate" },
  { value: "bike" as const, emoji: "🚲", key: "apply_vehicle_bike" },
  { value: "car" as const, emoji: "🚗", key: "apply_vehicle_car" },
] as const;

type Props = {
  selected: string;
  onSelect: (v: "none" | "skate" | "bike" | "car") => void;
  onNext: () => void;
  onBack: () => void;
};

export function StepVehicle({ selected, onSelect, onNext, onBack }: Props) {
  const { t } = useLanguage();

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="h-4 w-4" />
        {t("apply_back")}
      </button>

      <h2 className="text-lg font-semibold">{t("apply_step_vehicle")}</h2>

      <div className="grid grid-cols-2 gap-3">
        {VEHICLES.map(({ value, emoji, key }) => (
          <button
            key={value}
            onClick={() => onSelect(value)}
            className={`flex flex-col items-center justify-center gap-2 h-28 rounded-xl border-2 text-base font-medium transition-all ${
              selected === value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:border-primary/50"
            }`}
          >
            <span className="text-3xl">{emoji}</span>
            <span className="text-sm">{t(key)}</span>
          </button>
        ))}
      </div>

      <Button size="lg" className="w-full h-14 text-lg rounded-xl" onClick={onNext}>
        {t("apply_next")}
      </Button>
    </div>
  );
}
