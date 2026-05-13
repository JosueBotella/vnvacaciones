import { useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { QuestionLayout } from "./QuestionLayout";
import { NextButton } from "./NextButton";
import { useHaptic } from "@/hooks/useHaptic";
import { Plus, X, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type LangEntry = { lang: string; level: 1 | 2 | 3 | 4 };

const LANGS = [
  { key: "es", es: "Español", fr: "Espagnol", ar: "الإسبانية" },
  { key: "ar", es: "Árabe", fr: "Arabe", ar: "العربية" },
  { key: "fr", es: "Francés", fr: "Français", ar: "الفرنسية" },
  { key: "en", es: "Inglés", fr: "Anglais", ar: "الإنجليزية" },
  { key: "pt", es: "Portugués", fr: "Portugais", ar: "البرتغالية" },
];

const LEVEL_KEYS = ["apply_v2_lang_basic", "apply_v2_lang_intermediate", "apply_v2_lang_advanced", "apply_v2_lang_native"];
const LEVEL_DESC_KEYS = ["apply_v2_lang_basic_desc", "apply_v2_lang_intermediate_desc", "apply_v2_lang_advanced_desc", "apply_v2_lang_native_desc"];

type Props = {
  value: LangEntry[];
  onChange: (v: LangEntry[]) => void;
  onNext: () => void;
};

export function StepLanguages({ value, onChange, onNext }: Props) {
  const { t, language } = useLanguage();
  const haptic = useHaptic();
  const [showOther, setShowOther] = useState(false);
  const [other, setOther] = useState("");

  const labelOf = (key: string) => {
    const l = LANGS.find((x) => x.key === key);
    return l ? l[language as "es" | "fr" | "ar"] : key;
  };

  const toggle = (key: string) => {
    haptic.light();
    const exists = value.find((x) => x.lang === key);
    if (exists) onChange(value.filter((x) => x.lang !== key));
    else onChange([...value, { lang: key, level: 3 }]);
  };

  const setLevel = (key: string, level: 1 | 2 | 3 | 4) => {
    haptic.threshold();
    onChange(value.map((x) => (x.lang === key ? { ...x, level } : x)));
  };

  const addOther = () => {
    const v = other.trim();
    if (!v) return;
    haptic.light();
    onChange([...value, { lang: v, level: 3 }]);
    setOther("");
    setShowOther(false);
  };

  const canNext = value.length >= 1;

  return (
    <QuestionLayout
      title={t("apply_v2_languages_title")}
      subtitle={t("apply_v2_languages_subtitle")}
      footer={<NextButton onClick={() => { haptic.medium(); onNext(); }} disabled={!canNext} label={t("apply_v2_continue")} />}
    >
      <div className="space-y-2">
        {LANGS.map((l) => {
          const sel = value.find((x) => x.lang === l.key);
          return (
            <div key={l.key} className={cn(
              "rounded-2xl border transition-all",
              sel ? "border-primary/60 bg-primary/10" : "border-border bg-card/60",
            )}>
              <button
                onClick={() => toggle(l.key)}
                className="w-full px-4 py-3 flex items-center justify-between active:scale-[0.99] transition-all"
              >
                <span className="text-base font-semibold tracking-tight text-foreground">
                  {l[language as "es" | "fr" | "ar"]}
                </span>
                {sel && (
                  <span className="text-xs font-light text-primary uppercase tracking-widest">
                    {t(LEVEL_KEYS[sel.level - 1])}
                  </span>
                )}
              </button>
              {sel && (
                <div className="px-4 pb-3 space-y-2">
                  <div className="grid grid-cols-4 gap-1.5">
                    {[1, 2, 3, 4].map((lv) => (
                      <button
                        key={lv}
                        onClick={() => setLevel(l.key, lv as 1 | 2 | 3 | 4)}
                        className={cn(
                          "h-9 rounded-xl text-xs font-semibold tracking-tight transition-all active:scale-95",
                          sel.level === lv
                            ? "bg-foreground text-background"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {t(LEVEL_KEYS[lv - 1])}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] font-light text-muted-foreground leading-snug px-0.5">
                    {t(LEVEL_DESC_KEYS[sel.level - 1])}
                  </p>
                </div>
              )}
            </div>
          );
        })}

        {value.filter((v) => !LANGS.some((l) => l.key === v.lang)).map((v) => (
          <div key={v.lang} className="rounded-2xl border border-primary/60 bg-primary/10">
            <div className="w-full px-4 py-3 flex items-center justify-between">
              <span className="text-base font-semibold tracking-tight">{v.lang}</span>
              <button onClick={() => onChange(value.filter((x) => x.lang !== v.lang))} className="p-1 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-4 pb-3 space-y-2">
              <div className="grid grid-cols-4 gap-1.5">
                {[1, 2, 3, 4].map((lv) => (
                  <button key={lv} onClick={() => setLevel(v.lang, lv as 1 | 2 | 3 | 4)} className={cn("h-9 rounded-xl text-xs font-semibold tracking-tight transition-all active:scale-95", v.level === lv ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>
                    {t(LEVEL_KEYS[lv - 1])}
                  </button>
                ))}
              </div>
              <p className="text-[11px] font-light text-muted-foreground leading-snug px-0.5">
                {t(LEVEL_DESC_KEYS[v.level - 1])}
              </p>
            </div>
          </div>
        ))}

        {!showOther ? (
          <button onClick={() => setShowOther(true)} className="w-full h-12 rounded-2xl border border-dashed border-border text-sm font-light text-muted-foreground flex items-center justify-center gap-2 hover:border-foreground/30 hover:text-foreground transition-all active:scale-[0.97]">
            <Plus className="h-4 w-4" />
            {t("apply_v2_lang_add_other")}
          </button>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={other}
              onChange={(e) => setOther(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addOther()}
              placeholder={t("apply_v2_lang_other_placeholder")}
              autoFocus
              className="flex-1 h-12 rounded-2xl bg-card/60 border border-border px-4 text-sm font-medium focus:outline-none focus:border-primary/60"
            />
            <button onClick={addOther} className="h-12 px-4 rounded-2xl bg-foreground text-background text-sm font-semibold">
              {t("apply_v2_lang_add")}
            </button>
          </div>
        )}
      </div>

      {value.length >= 1 && (
        <div className="mt-3 flex items-start gap-2.5 px-3.5 py-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30">
          <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-300 font-light">
            {t("apply_v2_lang_verify_notice")}
          </p>
        </div>
      )}
    </QuestionLayout>
  );
}
