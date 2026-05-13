import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Loader2, FileText, Image } from "lucide-react";
import type { ApplicationData } from "./ApplicationWizard";

type Props = {
  data: ApplicationData;
  isSubmitting: boolean;
  onSubmit: () => void;
  onBack: () => void;
};

export function StepConfirmation({ data, isSubmitting, onSubmit, onBack }: Props) {
  const { t } = useLanguage();

  const vehicleLabels: Record<string, string> = {
    none: t("apply_vehicle_none"),
    skate: t("apply_vehicle_skate"),
    bike: t("apply_vehicle_bike"),
    car: t("apply_vehicle_car"),
  };

  const spanishLabels = [
    t("apply_spanish_1"),
    t("apply_spanish_2"),
    t("apply_spanish_3"),
    t("apply_spanish_4"),
    t("apply_spanish_5"),
  ];

  const genderLabel = data.gender === "male" ? t("apply_male") : t("apply_female");

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="h-4 w-4" />
        {t("apply_back")}
      </button>

      <h2 className="text-lg font-semibold">{t("apply_step_confirm")}</h2>

      <div className="space-y-3 text-sm">
        {data.job_title && (
          <Row label={t("apply_step_position")} value={data.job_title} />
        )}
        <Row label={t("apply_first_name")} value={data.first_name} />
        <Row label={t("apply_last_name")} value={data.last_name} />
        <Row label={t("apply_gender")} value={genderLabel} />
        <Row label={t("apply_origin_country")} value={data.origin_country} />
        <Row label={t("apply_step_address")} value={data.current_address} />
        <Row label={t("apply_step_vehicle")} value={vehicleLabels[data.vehicle] || data.vehicle} />
        <Row
          label={t("apply_step_spanish")}
          value={`${data.spanish_level} — ${spanishLabels[data.spanish_level - 1]}`}
        />
        {data.cv_file && (
          <div className="flex items-center gap-2 py-2 border-b border-border/50">
            {data.cv_file_type === "pdf" ? (
              <FileText className="h-4 w-4 text-red-500" />
            ) : (
              <Image className="h-4 w-4 text-blue-500" />
            )}
            <span className="text-muted-foreground truncate">{data.cv_file.name}</span>
          </div>
        )}
      </div>

      <Button
        size="lg"
        className="w-full h-14 text-lg rounded-xl"
        onClick={onSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin me-2" />
            {t("apply_submitting")}
          </>
        ) : (
          t("apply_submit")
        )}
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-border/50 gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-end">{value}</span>
    </div>
  );
}
