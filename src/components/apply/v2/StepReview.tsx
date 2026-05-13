import { useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { QuestionLayout } from "./QuestionLayout";
import { NextButton } from "./NextButton";
import { useHaptic } from "@/hooks/useHaptic";
import { ShieldCheck, ChevronDown, ChevronUp, Check, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { ApplicationDataV2 } from "./types";

type Props = {
  data: ApplicationDataV2;
  isSubmitting: boolean;
  onSubmit: () => void;
};

const initials = (first: string, last: string) =>
  `${(first[0] || "").toUpperCase()}${(last[0] || "").toUpperCase()}`;

export function StepReview({ data, isSubmitting, onSubmit }: Props) {
  const { t } = useLanguage();
  const haptic = useHaptic();
  const [consent, setConsent] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const rows: Array<{ label: string; value: string | null }> = [
    { label: t("apply_step_position"), value: data.job_title },
    { label: "Email", value: data.email || null },
    { label: t("apply_v2_contact_phone_placeholder"), value: data.phone || null },
    { label: t("apply_origin_country"), value: data.origin_country },
    { label: t("apply_step_address"), value: data.current_address },
    { label: t("apply_step_vehicle"), value: t(`apply_vehicle_${data.vehicle}`) },
    { label: t("cand_languages"), value: data.languages.length ? data.languages.map((l) => l.lang).join(", ") : null },
    { label: t("cand_experience"), value: data.years_experience ? t(`apply_v2_exp_${data.years_experience.replace("-", "_")}`) : null },
    { label: t("apply_v2_avail_title_short"), value: data.availability ? t(`apply_v2_avail_${data.availability.replace("-", "_").replace("+", "")}`) : null },
    { label: t("apply_v2_shifts_title_short"), value: data.shifts.length ? data.shifts.map((s) => t(`apply_v2_shift_${s}`)).join(", ") : null },
    { label: "CV", value: data.cv_file?.name || null },
  ].filter((r) => r.value);

  const handleSubmit = () => {
    if (!consent) {
      haptic.error();
      toast({ title: t("apply_v2_legal_required"), variant: "destructive" });
      return;
    }
    onSubmit();
  };

  return (
    <QuestionLayout
      align="top"
      title={t("apply_v2_review_title")}
      subtitle={t("apply_v2_review_subtitle")}
      footer={
        <NextButton
          variant="primary"
          onClick={handleSubmit}
          disabled={!consent}
          loading={isSubmitting}
          label={isSubmitting ? t("apply_submitting") : t("apply_submit")}
        />
      }
    >
      <div className="space-y-4">
        {/* Legal / RGPD consent — UP TOP so users see it before scrolling */}
        <div
          className={cn(
            "rounded-3xl border backdrop-blur transition-all overflow-hidden",
            consent
              ? "border-primary/60 bg-primary/10"
              : "border-amber-500/50 bg-amber-500/[0.06] ring-1 ring-amber-500/20",
          )}
        >
          {/* Header label with shield */}
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <ShieldCheck className={cn("h-4 w-4", consent ? "text-primary" : "text-amber-500")} />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/70">
              {t("apply_v2_legal_title")}
            </p>
          </div>

          {/* Tap-to-accept row — entire row is the button, checkbox is empty/checked */}
          <button
            type="button"
            onClick={() => { haptic.light(); setConsent((v) => !v); }}
            className={cn(
              "w-full flex items-start gap-3 text-start px-4 py-3 active:scale-[0.99] transition-all",
              !consent && "hover:bg-amber-500/[0.04]",
            )}
            aria-checked={consent}
            role="checkbox"
          >
            <span
              className={cn(
                "mt-0.5 shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all",
                consent
                  ? "bg-primary border-primary text-primary-foreground shadow-[0_0_0_4px_hsl(var(--primary)/0.18)]"
                  : "border-amber-500/80 bg-background/40",
              )}
            >
              {consent && <Check className="h-4 w-4" strokeWidth={3} />}
            </span>
            <p className="flex-1 text-[13px] leading-relaxed font-light text-foreground/90">
              {t("apply_v2_legal_consent")}
            </p>
          </button>

          {/* Inline warning — only when not consented; lives INSIDE the box, no overlap */}
          {!consent && (
            <div className="mx-4 mb-3 flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[12px] leading-snug font-medium text-amber-200/95">
                {t("apply_v2_legal_required")}
              </p>
            </div>
          )}

          <div className="px-4 pb-4">
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
            >
              {showDetails ? t("apply_v2_legal_show_less") : t("apply_v2_legal_show_more")}
              {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {showDetails && (
              <p className="mt-2 text-[11px] leading-relaxed font-light text-muted-foreground">
                {t("apply_v2_legal_details")}
              </p>
            )}
          </div>
        </div>

        {/* Summary card */}
        <div className="rounded-3xl border bg-card/60 backdrop-blur p-5 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/40 flex items-center justify-center text-background text-xl font-semibold tracking-tighter">
              {initials(data.first_name, data.last_name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold tracking-tight truncate">{data.first_name} {data.last_name}</p>
              <p className="text-xs font-light text-muted-foreground tracking-tight">
                {data.gender === "male" ? t("apply_male") : data.gender === "female" ? t("apply_female") : ""}
              </p>
            </div>
          </div>
          <div className="h-px bg-border" />
          <div className="space-y-3">
            {rows.map((r, i) => (
              <div key={i} className="flex justify-between items-baseline gap-3 text-sm">
                <span className="font-light text-muted-foreground tracking-tight shrink-0 max-w-[40%] truncate">
                  {r.label}
                </span>
                <span className="font-semibold tracking-tight text-foreground text-end truncate min-w-0">
                  {r.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </QuestionLayout>
  );
}
