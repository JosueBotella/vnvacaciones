import { useLanguage } from "@/hooks/useLanguage";
import { QuestionLayout } from "./QuestionLayout";
import { NextButton } from "./NextButton";
import { ChipGroup } from "./ChipGroup";
import { useHaptic } from "@/hooks/useHaptic";

type Props = {
  value: string[];
  onChange: (v: string[]) => void;
  onNext: () => void;
};

export function StepShifts({ value, onChange, onNext }: Props) {
  const { t } = useLanguage();
  const haptic = useHaptic();

  const opts = [
    { value: "morning", label: t("apply_v2_shift_morning") },
    { value: "afternoon", label: t("apply_v2_shift_afternoon") },
    { value: "night", label: t("apply_v2_shift_night") },
    { value: "weekends", label: t("apply_v2_shift_weekends") },
  ];

  const toggle = (v: string) => {
    haptic.light();
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  return (
    <QuestionLayout
      title={t("apply_v2_shifts_title")}
      subtitle={t("apply_v2_shifts_subtitle")}
      footer={<NextButton onClick={() => { haptic.medium(); onNext(); }} disabled={value.length === 0} label={t("apply_v2_continue")} />}
    >
      <ChipGroup options={opts} value={value} onChange={toggle} multi />
    </QuestionLayout>
  );
}
