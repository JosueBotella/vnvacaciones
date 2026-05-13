import { useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { QuestionLayout } from "./QuestionLayout";
import { NextButton } from "./NextButton";
import { useHaptic } from "@/hooks/useHaptic";
import { Mail, Phone, Info } from "lucide-react";

type Props = {
  email: string;
  phone: string;
  onChange: (email: string, phone: string) => void;
  onNext: () => void;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function StepContact({ email, phone, onChange, onNext }: Props) {
  const { t } = useLanguage();
  const haptic = useHaptic();
  const [e, setE] = useState(email);
  const [p, setP] = useState(phone);

  const validEmail = EMAIL_RE.test(e.trim());
  const validPhone = p.replace(/\D/g, "").length >= 6;
  const canNext = validEmail && validPhone;

  const submit = () => {
    if (!canNext) return;
    haptic.medium();
    onChange(e.trim(), p.trim());
    onNext();
  };

  return (
    <QuestionLayout
      title={t("apply_v2_contact_title")}
      subtitle={t("apply_v2_contact_subtitle")}
      footer={<NextButton onClick={submit} disabled={!canNext} label={t("apply_v2_continue")} />}
    >
      <div className="space-y-3">
        <div className="relative">
          <Mail className="absolute start-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="email"
            value={e}
            onChange={(ev) => setE(ev.target.value)}
            placeholder={t("apply_v2_contact_email_placeholder")}
            autoComplete="email"
            inputMode="email"
            autoFocus
            maxLength={120}
            className="w-full h-14 rounded-2xl bg-card/60 border border-border ps-11 pe-4 text-base font-semibold tracking-tight text-foreground placeholder:text-muted-foreground/60 placeholder:font-light focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-all"
          />
        </div>
        <div className="relative">
          <Phone className="absolute start-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="tel"
            value={p}
            onChange={(ev) => setP(ev.target.value)}
            onKeyDown={(ev) => ev.key === "Enter" && submit()}
            placeholder={t("apply_v2_contact_phone_placeholder")}
            autoComplete="tel"
            inputMode="tel"
            maxLength={20}
            className="w-full h-14 rounded-2xl bg-card/60 border border-border ps-11 pe-4 text-base font-semibold tracking-tight text-foreground placeholder:text-muted-foreground/60 placeholder:font-light focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-all"
          />
        </div>

        <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30">
          <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-300 font-light">
            {t("apply_v2_contact_notice")}
          </p>
        </div>
      </div>
    </QuestionLayout>
  );
}
