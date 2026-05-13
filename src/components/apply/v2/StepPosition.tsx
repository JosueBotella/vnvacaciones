import { useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { QuestionLayout } from "./QuestionLayout";
import { OptionCard } from "./OptionCard";
import { NextButton } from "./NextButton";
import { Loader2, Briefcase, Sparkles, ChevronDown, Check } from "lucide-react";
import { useHaptic } from "@/hooks/useHaptic";
import { motion, AnimatePresence } from "framer-motion";

type Position = { id: string; title: string; description: string; is_default?: boolean };

const OTHER_ID = "__other";

type Props = {
  positions: Position[];
  loading: boolean;
  selected: string;
  customPosition: string;
  onSelect: (id: string, title: string) => void;
  onCustomChange: (v: string) => void;
  onNext: () => void;
};

export function StepPosition({
  positions,
  loading,
  selected,
  customPosition,
  onSelect,
  onCustomChange,
  onNext,
}: Props) {
  const { t } = useLanguage();
  const haptic = useHaptic();
  const [showMore, setShowMore] = useState(false);

  const isOther = selected === OTHER_ID;
  const canContinue = selected && (!isOther || customPosition.trim().length > 1);

  // Featured (default or first) vs the rest
  const featured = positions.find((p) => p.is_default) || positions[0];
  const others = positions.filter((p) => p.id !== featured?.id);

  return (
    <QuestionLayout
      title={t("apply_v2_position_title")}
      subtitle={t("apply_v2_position_subtitle")}
      footer={
        <NextButton
          onClick={onNext}
          disabled={!canContinue}
          label={t("apply_v2_continue")}
        />
      }
    >
      {loading ? (
        <div className="py-12 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {/* Featured (default) vacancy — title only, no description */}
          {featured && (
            <OptionCard
              icon={<Briefcase className="h-5 w-5" />}
              label={featured.title}
              selected={selected === featured.id}
              onClick={() => {
                haptic.light();
                onSelect(featured.id, featured.title);
              }}
            />
          )}

          {/* Subtle dropdown for other vacancies + "Other" */}
          {(others.length > 0 || true) && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  haptic.light();
                  setShowMore((v) => !v);
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors group"
              >
                <span className="font-medium tracking-tight">
                  {t("apply_v2_position_more_options")}
                </span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-300 ${showMore ? "rotate-180" : ""}`}
                />
              </button>

              <AnimatePresence initial={false}>
                {showMore && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-1.5 pt-1.5">
                      {others.map((p) => {
                        const sel = selected === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              haptic.light();
                              onSelect(p.id, p.title);
                            }}
                            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border text-left transition-all ${
                              sel
                                ? "bg-primary/8 border-primary/40 text-foreground"
                                : "bg-card/30 border-border/40 hover:bg-card/60 hover:border-border/70 text-foreground/85"
                            }`}
                          >
                            <span className={`text-sm font-medium tracking-tight flex-1 truncate ${sel ? "text-foreground" : ""}`}>
                              {p.title}
                            </span>
                            {sel && <Check className="h-4 w-4 text-primary shrink-0" />}
                          </button>
                        );
                      })}

                      {/* "Other" option — also subtle */}
                      <button
                        type="button"
                        onClick={() => {
                          haptic.light();
                          onSelect(OTHER_ID, "");
                        }}
                        className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border text-left transition-all ${
                          isOther
                            ? "bg-primary/8 border-primary/40"
                            : "bg-card/30 border-border/40 hover:bg-card/60 hover:border-border/70"
                        }`}
                      >
                        <Sparkles className={`h-4 w-4 shrink-0 ${isOther ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="text-sm font-medium tracking-tight flex-1">
                          {t("apply_v2_position_other")}
                        </span>
                        {isOther && <Check className="h-4 w-4 text-primary shrink-0" />}
                      </button>

                      {isOther && (
                        <div className="pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                          <input
                            type="text"
                            autoFocus
                            value={customPosition}
                            onChange={(e) => onCustomChange(e.target.value)}
                            placeholder={t("apply_v2_position_other_placeholder")}
                            maxLength={120}
                            className="w-full h-12 px-4 rounded-2xl bg-card/60 border border-primary/40 text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                          />
                          <p className="text-[11px] text-muted-foreground mt-1.5 px-1">
                            {t("apply_v2_position_other_hint")}
                          </p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}
    </QuestionLayout>
  );
}
