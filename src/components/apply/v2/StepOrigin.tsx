import { useState, useMemo } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { QuestionLayout } from "./QuestionLayout";
import { NextButton } from "./NextButton";
import { useHaptic } from "@/hooks/useHaptic";
import { Search } from "lucide-react";
import { Flag } from "./Flag";

const COMMON = [
  { code: "MA", es: "Marruecos", fr: "Maroc", ar: "المغرب" },
  { code: "SN", es: "Senegal", fr: "Sénégal", ar: "السنغال" },
  { code: "ES", es: "España", fr: "Espagne", ar: "إسبانيا" },
  { code: "RO", es: "Rumanía", fr: "Roumanie", ar: "رومانيا" },
  { code: "CO", es: "Colombia", fr: "Colombie", ar: "كولومبيا" },
  { code: "VE", es: "Venezuela", fr: "Venezuela", ar: "فنزويلا" },
  { code: "ML", es: "Mali", fr: "Mali", ar: "مالي" },
  { code: "DZ", es: "Argelia", fr: "Algérie", ar: "الجزائر" },
];

type Props = {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
};

export function StepOrigin({ value, onChange, onNext }: Props) {
  const { t, language } = useLanguage();
  const haptic = useHaptic();
  const [custom, setCustom] = useState(
    COMMON.some((c) => c[language as "es" | "fr" | "ar"] === value) ? "" : value,
  );

  const selected = useMemo(() => {
    const found = COMMON.find((c) => c[language as "es" | "fr" | "ar"] === value);
    return found?.code || "";
  }, [value, language]);

  const pick = (code: string) => {
    const country = COMMON.find((c) => c.code === code);
    if (!country) return;
    haptic.light();
    onChange(country[language as "es" | "fr" | "ar"]);
    setCustom("");
  };

  const submit = () => {
    if (custom.trim()) {
      onChange(custom.trim());
    }
    if (value || custom.trim()) {
      haptic.medium();
      onNext();
    }
  };

  const canNext = !!value || custom.trim().length >= 2;

  return (
    <QuestionLayout
      title={t("apply_v2_origin_title")}
      subtitle={t("apply_v2_origin_subtitle")}
      footer={<NextButton onClick={submit} disabled={!canNext} label={t("apply_v2_continue")} />}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {COMMON.map((c) => (
            <button
              key={c.code}
              onClick={() => pick(c.code)}
              className={`h-14 rounded-2xl border flex items-center gap-3 px-4 transition-all active:scale-[0.96] ${
                selected === c.code
                  ? "border-primary/60 bg-primary/15"
                  : "border-border bg-card/60 hover:border-foreground/30"
              }`}
            >
              <Flag code={c.code} size={28} />
              <span className="text-sm font-semibold tracking-tight text-foreground truncate">
                {c[language as "es" | "fr" | "ar"]}
              </span>
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute start-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={custom}
            onChange={(e) => { setCustom(e.target.value); onChange(e.target.value); }}
            placeholder={t("apply_v2_origin_other")}
            inputMode="text"
            className="w-full h-12 rounded-2xl bg-card/60 border border-border ps-11 pe-4 text-sm font-medium tracking-tight text-foreground placeholder:text-muted-foreground/60 placeholder:font-light focus:outline-none focus:border-primary/60 transition-all"
          />
        </div>
      </div>
    </QuestionLayout>
  );
}
