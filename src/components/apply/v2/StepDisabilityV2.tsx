import { useLanguage } from "@/hooks/useLanguage";
import { QuestionLayout } from "./QuestionLayout";
import { OptionCard } from "./OptionCard";
import { useHaptic } from "@/hooks/useHaptic";
import { Heart, X } from "lucide-react";

type Props = {
  value: boolean | null;
  onChange: (v: boolean) => void;
  onNext: () => void;
};

export function StepDisabilityV2({ value, onChange, onNext }: Props) {
  const { t } = useLanguage();
  const haptic = useHaptic();

  const handle = (v: boolean) => {
    haptic.light();
    onChange(v);
    setTimeout(onNext, 280);
  };

  return (
    <QuestionLayout title={t("apply_disability_title")} subtitle={t("apply_disability_desc")}>
      <div className="space-y-2.5">
        <OptionCard
          icon={<Heart className="h-5 w-5" />}
          label={t("apply_disability_yes")}
          selected={value === true}
          onClick={() => handle(true)}
        />
        <OptionCard
          icon={<X className="h-5 w-5" />}
          label={t("apply_v2_disability_no")}
          selected={value === false}
          onClick={() => handle(false)}
        />
      </div>
    </QuestionLayout>
  );
}
