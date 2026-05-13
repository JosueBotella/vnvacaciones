import { useLanguage } from "@/hooks/useLanguage";
import { QuestionLayout } from "./QuestionLayout";
import { ChipGroup } from "./ChipGroup";
import { useHaptic } from "@/hooks/useHaptic";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  jobTitle?: string;
  customPosition?: string;
};

// Normalize the role into a lowercase, natural-sounding phrase usable after
// "como" / "as" / "en tant que". If we cannot produce something clean, we
// fall back to the generic sector phrasing.
function normalizeRole(raw: string): string | null {
  if (!raw) return null;
  let s = raw.trim().toLowerCase();
  if (!s || s.length < 2 || s.length > 60) return null;
  // Drop trailing punctuation
  s = s.replace(/[.\s]+$/g, "");
  // Reject if it contains weird characters (URLs, emojis, etc.)
  if (/[<>{}|\\^~`]/.test(s)) return null;
  // Reject if mostly non-letters
  const letters = s.replace(/[^\p{L}]/gu, "");
  if (letters.length < 2) return null;
  return s;
}

export function StepExperience({ value, onChange, onNext, jobTitle, customPosition }: Props) {
  const { t } = useLanguage();
  const haptic = useHaptic();

  const opts = [
    { value: "none", label: t("apply_v2_exp_none") },
    { value: "lt1", label: t("apply_v2_exp_lt1") },
    { value: "1to3", label: t("apply_v2_exp_1to3") },
    { value: "gt3", label: t("apply_v2_exp_gt3") },
  ];

  const pick = (v: string) => {
    haptic.light();
    onChange(v);
    setTimeout(onNext, 280);
  };

  const role = normalizeRole(customPosition || jobTitle || "");
  const title = role
    ? t("apply_v2_exp_title_role").replace("{role}", role)
    : t("apply_v2_exp_title_generic");

  return (
    <QuestionLayout title={title} subtitle={t("apply_v2_exp_subtitle")}>
      <ChipGroup options={opts} value={value} onChange={pick} />
    </QuestionLayout>
  );
}
