import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { LanguageSelector } from "@/components/LanguageSelector";

export function StepWelcome({ onNext }: { onNext: () => void }) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8 text-center">
      <img src="/icon-vn.svg" alt="VerdNatura" className="h-16 w-16" />
      <h1 className="text-xl font-semibold text-foreground leading-snug max-w-xs">
        {t("apply_welcome_title")}
      </h1>
      <LanguageSelector />
      <Button size="lg" className="w-full max-w-xs h-14 text-lg rounded-xl" onClick={onNext}>
        {t("apply_start")}
      </Button>
    </div>
  );
}
