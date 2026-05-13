import { useLanguage } from "@/hooks/useLanguage";
import { QuestionLayout } from "./QuestionLayout";
import { OptionCard } from "./OptionCard";
import { useHaptic } from "@/hooks/useHaptic";
import { Footprints, Bike, Car, Zap } from "lucide-react";

type Vehicle = "none" | "skate" | "bike" | "car";

type Props = {
  value: Vehicle;
  onChange: (v: Vehicle) => void;
  onNext: () => void;
};

const iconWrap = (Icon: typeof Footprints) => (
  <Icon className="h-6 w-6 text-foreground/85" strokeWidth={1.75} />
);

export function StepVehicleV2({ value, onChange, onNext }: Props) {
  const { t } = useLanguage();
  const haptic = useHaptic();

  const opts: Array<{ v: Vehicle; icon: JSX.Element; label: string; desc: string }> = [
    { v: "none", icon: iconWrap(Footprints), label: t("apply_vehicle_none"), desc: t("apply_v2_vehicle_none_desc") },
    { v: "skate", icon: iconWrap(Zap), label: t("apply_vehicle_skate"), desc: t("apply_v2_vehicle_skate_desc") },
    { v: "bike", icon: iconWrap(Bike), label: t("apply_vehicle_bike"), desc: t("apply_v2_vehicle_bike_desc") },
    { v: "car", icon: iconWrap(Car), label: t("apply_vehicle_car"), desc: t("apply_v2_vehicle_car_desc") },
  ];

  const handle = (v: Vehicle) => {
    haptic.light();
    onChange(v);
    setTimeout(onNext, 280);
  };

  return (
    <QuestionLayout title={t("apply_v2_vehicle_title")} subtitle={t("apply_v2_vehicle_subtitle")}>
      <div className="space-y-2.5">
        {opts.map((o) => (
          <OptionCard
            key={o.v}
            icon={o.icon}
            label={o.label}
            description={o.desc}
            selected={value === o.v}
            onClick={() => handle(o.v)}
          />
        ))}
      </div>
    </QuestionLayout>
  );
}
