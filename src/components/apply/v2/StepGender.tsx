import { useEffect } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { QuestionLayout } from "./QuestionLayout";
import { OptionCard } from "./OptionCard";
import { useHaptic } from "@/hooks/useHaptic";
import { User, UserRound } from "lucide-react";

type Props = {
  value: "male" | "female" | "";
  onChange: (v: "male" | "female") => void;
  onNext: () => void;
};

export function StepGender({ value, onChange, onNext }: Props) {
  const { t } = useLanguage();
  const haptic = useHaptic();

  const handle = (v: "male" | "female") => {
    haptic.light();
    onChange(v);
    setTimeout(onNext, 280);
  };

  return (
    <QuestionLayout title={t("apply_v2_gender_title")} subtitle={t("apply_v2_gender_subtitle")}>
      <div className="space-y-3">
        <OptionCard
          icon={<User className="h-5 w-5" />}
          label={t("apply_male")}
          selected={value === "male"}
          onClick={() => handle("male")}
        />
        <OptionCard
          icon={<UserRound className="h-5 w-5" />}
          label={t("apply_female")}
          selected={value === "female"}
          onClick={() => handle("female")}
        />
      </div>
    </QuestionLayout>
  );
}
