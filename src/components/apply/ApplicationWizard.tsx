import { useState, useCallback, useEffect, useMemo } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { StepWelcome } from "./StepWelcome";
import { StepPosition } from "./StepPosition";
import { StepPersonalInfo } from "./StepPersonalInfo";
import { StepAddress } from "./StepAddress";
import { StepVehicle } from "./StepVehicle";
import { StepSpanishLevel } from "./StepSpanishLevel";
import { StepCV } from "./StepCV";
import { StepConfirmation } from "./StepConfirmation";
import { StepSuccess } from "./StepSuccess";
import { StepDisability } from "./StepDisability";

export type ApplicationData = {
  job_position_id: string;
  job_title: string;
  first_name: string;
  last_name: string;
  gender: "male" | "female" | "";
  origin_country: string;
  current_address: string;
  current_lat: number | null;
  current_lng: number | null;
  vehicle: "none" | "skate" | "bike" | "car";
  spanish_level: number;
  cv_file: File | null;
  cv_file_url: string;
  cv_file_type: "pdf" | "image" | "";
  has_disability: boolean;
};

const INITIAL_DATA: ApplicationData = {
  job_position_id: "",
  job_title: "",
  first_name: "",
  last_name: "",
  gender: "",
  origin_country: "",
  current_address: "",
  current_lat: null,
  current_lng: null,
  vehicle: "none",
  spanish_level: 3,
  cv_file: null,
  cv_file_url: "",
  cv_file_type: "",
  has_disability: false,
};

type StepId = "welcome" | "position" | "personal" | "address" | "vehicle" | "spanish" | "disability" | "cv" | "confirm";

export function ApplicationWizard() {
  const { t, language } = useLanguage();
  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<ApplicationData>(INITIAL_DATA);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [positions, setPositions] = useState<Array<{ id: string; title: string; description: string; criteria?: any }>>([]);
  const [positionsLoading, setPositionsLoading] = useState(true);
  const [honeypot, setHoneypot] = useState("");

  // Read ?pos= from URL
  const preselectedPos = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("pos") || "";
  }, []);

  useEffect(() => { loadPositions(); }, []);

  const loadPositions = async () => {
    try {
      // Fetch from safe public view: only exposes form_fields (UI config),
      // not sensitive criteria like AI prompts and scoring thresholds.
      const { data: pos } = await supabase.from("active_job_positions" as any).select("*");
      const positionsWithCriteria = (pos || []).map((p: any) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        criteria: { form_fields: p.form_fields || {} },
      }));
      setPositions(positionsWithCriteria);
      // Auto-select
      if (preselectedPos) {
        const match = positionsWithCriteria.find(p => p.id === preselectedPos);
        if (match) {
          setData(prev => ({ ...prev, job_position_id: match.id, job_title: match.title }));
        }
      } else if (positionsWithCriteria.length === 1) {
        setData(prev => ({ ...prev, job_position_id: positionsWithCriteria[0].id, job_title: positionsWithCriteria[0].title }));
      }
    } catch { /* ignore */ } finally { setPositionsLoading(false); }
  };

  const updateData = useCallback((partial: Partial<ApplicationData>) => {
    setData(prev => ({ ...prev, ...partial }));
  }, []);

  // Get form_fields config from selected position
  const formFields = useMemo(() => {
    const selected = positions.find(p => p.id === data.job_position_id);
    const ff = selected?.criteria?.form_fields;
    return {
      gender: ff?.gender ?? true,
      origin_country: ff?.origin_country ?? true,
      address: ff?.address ?? true,
      vehicle: ff?.vehicle ?? true,
      spanish_level: ff?.spanish_level ?? true,
      cv: ff?.cv ?? true,
      disability: ff?.disability ?? false,
    };
  }, [data.job_position_id, positions]);

  // Build dynamic step list
  const steps: StepId[] = useMemo(() => {
    const s: StepId[] = ["welcome", "position", "personal"];
    if (formFields.address) s.push("address");
    if (formFields.vehicle) s.push("vehicle");
    if (formFields.spanish_level) s.push("spanish");
    if (formFields.disability) s.push("disability");
    if (formFields.cv) s.push("cv");
    s.push("confirm");
    return s;
  }, [formFields]);

  const currentStep = steps[stepIndex] || "welcome";
  const totalSteps = steps.length;

  const next = () => setStepIndex(s => Math.min(s + 1, totalSteps - 1));
  const back = () => setStepIndex(s => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    const lastSubmit = localStorage.getItem("last_application_submit");
    if (lastSubmit && Date.now() - parseInt(lastSubmit) < 3600000) {
      toast({ title: t("apply_error_duplicate"), variant: "destructive" });
      return;
    }
    if (honeypot) return;

    setIsSubmitting(true);
    try {
      let cv_file_url = "";
      let cv_file_type: "pdf" | "image" | "" = "";

      if (data.cv_file) {
        const ext = data.cv_file.name.split(".").pop()?.toLowerCase() || "jpg";
        const isPdf = ext === "pdf";
        cv_file_type = isPdf ? "pdf" : "image";
        const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("cvs")
          .upload(path, data.cv_file, { contentType: data.cv_file.type });
        if (uploadErr) throw uploadErr;
        cv_file_url = path;
      }

      const { data: submitData, error: submitErr } = await supabase.functions.invoke(
        "submit-application",
        {
          body: {
            honeypot,
            application: {
              job_position_id: data.job_position_id || null,
              first_name: data.first_name.trim(),
              last_name: data.last_name.trim(),
              gender: data.gender as "male" | "female",
              origin_country: data.origin_country.trim(),
              current_address: data.current_address,
              current_lat: data.current_lat,
              current_lng: data.current_lng,
              vehicle: data.vehicle,
              spanish_level: data.spanish_level,
              cv_file_url: cv_file_url || null,
              cv_file_type: cv_file_type || null,
              form_language: language,
              has_disability: data.has_disability,
            },
          },
        }
      );

      if (submitErr || (submitData as any)?.error) {
        throw submitErr || new Error((submitData as any).error || "submit failed");
      }

      localStorage.setItem("last_application_submit", Date.now().toString());
      setSubmitted(true);
    } catch (err) {
      console.error("Submit error:", err);
      toast({ title: t("errorSubmit"), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) return <StepSuccess />;

  const progress = stepIndex > 0 ? Math.round((stepIndex / (totalSteps - 1)) * 100) : 0;

  return (
    <div className="flex flex-col min-h-screen md:min-h-0 relative overflow-hidden">
      <input
        type="text" name="website" value={honeypot}
        onChange={e => setHoneypot(e.target.value)}
        className="absolute -left-[9999px] opacity-0 h-0 w-0"
        tabIndex={-1} autoComplete="off"
      />

      {stepIndex > 0 && currentStep !== "confirm" && (
        <div className="px-4 pt-3 pb-1">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 text-center">
            {stepIndex} / {totalSteps - 1}
          </p>
        </div>
      )}

      <div className="flex-1 px-4 py-6">
        {currentStep === "welcome" && <StepWelcome onNext={next} />}
        {currentStep === "position" && (
          <StepPosition
            positions={positions}
            loading={positionsLoading}
            selected={data.job_position_id}
            onSelect={(id, title) => updateData({ job_position_id: id, job_title: title })}
            onNext={next} onBack={back}
          />
        )}
        {currentStep === "personal" && (
          <StepPersonalInfo data={data} updateData={updateData} onNext={next} onBack={back} showGender={formFields.gender} showCountry={formFields.origin_country} />
        )}
        {currentStep === "address" && (
          <StepAddress data={data} updateData={updateData} onNext={next} onBack={back} />
        )}
        {currentStep === "vehicle" && (
          <StepVehicle selected={data.vehicle} onSelect={v => updateData({ vehicle: v })} onNext={next} onBack={back} />
        )}
        {currentStep === "spanish" && (
          <StepSpanishLevel level={data.spanish_level} onLevelChange={l => updateData({ spanish_level: l })} onNext={next} onBack={back} />
        )}
        {currentStep === "disability" && (
          <StepDisability value={data.has_disability} onChange={v => updateData({ has_disability: v })} onNext={next} onBack={back} />
        )}
        {currentStep === "cv" && (
          <StepCV data={data} updateData={updateData} onNext={next} onBack={back} />
        )}
        {currentStep === "confirm" && (
          <StepConfirmation data={data} isSubmitting={isSubmitting} onSubmit={handleSubmit} onBack={back} />
        )}
      </div>
    </div>
  );
}
