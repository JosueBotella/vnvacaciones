import { useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { QuestionLayout } from "./QuestionLayout";
import { NextButton } from "./NextButton";
import { useHaptic } from "@/hooks/useHaptic";

type Props = {
  firstName: string;
  lastName: string;
  onChange: (first: string, last: string) => void;
  onNext: () => void;
};

export function StepName({ firstName, lastName, onChange, onNext }: Props) {
  const { t } = useLanguage();
  const haptic = useHaptic();
  const [first, setFirst] = useState(firstName);
  const [last, setLast] = useState(lastName);

  const canNext = first.trim().length >= 2 && last.trim().length >= 2;

  const submit = () => {
    if (!canNext) return;
    haptic.medium();
    onChange(first.trim(), last.trim());
    onNext();
  };

  return (
    <QuestionLayout
      title={t("apply_v2_name_title")}
      subtitle={t("apply_v2_name_subtitle")}
    >
      <div className="space-y-3 w-full">
        <input
          type="text"
          value={first}
          onChange={(e) => setFirst(e.target.value)}
          placeholder={t("apply_first_name")}
          autoFocus
          autoComplete="given-name"
          inputMode="text"
          className="w-full h-14 rounded-2xl bg-card/60 border border-border px-5 text-lg font-semibold tracking-tight text-foreground placeholder:text-muted-foreground/60 placeholder:font-light focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-all"
        />
        <input
          type="text"
          value={last}
          onChange={(e) => setLast(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={t("apply_last_name")}
          autoComplete="family-name"
          inputMode="text"
          className="w-full h-14 rounded-2xl bg-card/60 border border-border px-5 text-lg font-semibold tracking-tight text-foreground placeholder:text-muted-foreground/60 placeholder:font-light focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-all"
        />
        <div className="flex justify-end pt-2">
          <NextButton variant="circle" onClick={submit} disabled={!canNext} />
        </div>
      </div>
    </QuestionLayout>
  );
}
