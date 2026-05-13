import { useLanguage } from "@/hooks/useLanguage";
import { QuestionLayout } from "./QuestionLayout";
import { ChipGroup } from "./ChipGroup";
import { useHaptic } from "@/hooks/useHaptic";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
};

export function StepAvailability({ value, onChange, onNext }: Props) {
  const { t } = useLanguage();
  const haptic = useHaptic();

  const opts = [
    { value: "immediate", label: t("apply_v2_avail_immediate") },
    { value: "1-2w", label: t("apply_v2_avail_1_2w") },
    { value: "1m+", label: t("apply_v2_avail_1m") },
  ];

  const pick = (v: string) => {
    haptic.light();
    onChange(v);
    setTimeout(onNext, 280);
  };

  return (
    <QuestionLayout title={t("apply_v2_avail_title")} subtitle={t("apply_v2_avail_subtitle")}>
      <ChipGroup options={opts} value={value} onChange={pick} />
    </QuestionLayout>
  );
}
