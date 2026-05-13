import { useState, useEffect, useMemo, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { useLanguage, languageFlags, Language } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useHaptic } from "@/hooks/useHaptic";

import { StepIntro } from "./StepIntro";
import { StepPosition } from "./StepPosition";
import { StepName } from "./StepName";
import { StepContact } from "./StepContact";
import { StepGender } from "./StepGender";
import { StepOrigin } from "./StepOrigin";
import { StepLocation } from "./StepLocation";
import { StepVehicleV2 } from "./StepVehicleV2";
import { StepLanguages } from "./StepLanguages";
import { StepExperience } from "./StepExperience";
import { StepAvailability } from "./StepAvailability";
import { StepDisabilityV2 } from "./StepDisabilityV2";
import { StepCVV2 } from "./StepCVV2";
import { StepReview } from "./StepReview";
import { StepDone } from "./StepDone";
import { AnimatedBackdrop } from "./AnimatedBackdrop";
import { INITIAL_V2, type ApplicationDataV2 } from "./types";

type StepId =
  | "intro" | "position" | "name" | "contact" | "gender" | "origin" | "location"
  | "vehicle" | "languages" | "experience" | "availability"
  | "disability" | "cv" | "review";

export function ApplyShell() {
  const { t, language, setLanguage } = useLanguage();
  const haptic = useHaptic();

  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<ApplicationDataV2>(INITIAL_V2);
  const [positions, setPositions] = useState<Array<{ id: string; title: string; description: string; criteria?: any; is_default?: boolean }>>([]);
  const [positionsLoading, setPositionsLoading] = useState(true);
  // Mantenemos el splash visible al menos 900ms para que la animación se aprecie
  // y no haya un "pop" si las vacantes cargan instantáneamente.
  const [minSplashDone, setMinSplashDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinSplashDone(true), 900);
    return () => clearTimeout(t);
  }, []);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [showLangMenu, setShowLangMenu] = useState(false);

  const preselected = useMemo(() => new URLSearchParams(window.location.search).get("pos") || "", []);

  useEffect(() => { loadPositions(); }, []);

  const loadPositions = async () => {
    try {
      // Fetch from safe public view: only id, title, description, form_fields (UI config).
      // Sensitive criteria (custom_prompt, AI scoring rules, distance limits) are NOT exposed publicly.
      const { data: pos } = await supabase.from("active_job_positions" as any).select("*");
      const withCriteria = (pos || []).map((p: any) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        is_default: !!p.is_default,
        criteria: { form_fields: p.form_fields || {} },
      }));
      // Place the default vacancy first so it leads the list
      withCriteria.sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0));
      setPositions(withCriteria);
      if (preselected) {
        const match = withCriteria.find((p) => p.id === preselected);
        if (match) setData((prev) => ({ ...prev, job_position_id: match.id, job_title: match.title }));
      } else if (withCriteria.length >= 1) {
        // Default: use the admin-selected default position; fall back to first
        const def = withCriteria.find((p) => p.is_default) || withCriteria[0];
        setData((prev) => ({ ...prev, job_position_id: def.id, job_title: def.title }));
      }
    } catch { /* ignore */ } finally { setPositionsLoading(false); }
  };

  const update = useCallback((p: Partial<ApplicationDataV2>) => setData((prev) => ({ ...prev, ...p })), []);

  const formFields = useMemo(() => {
    const sel = positions.find((p) => p.id === data.job_position_id);
    const ff = sel?.criteria?.form_fields;
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

  const steps: StepId[] = useMemo(() => {
    const s: StepId[] = ["intro"];
    // Always show the position step so candidates know which job they're applying to
    // and can pick "Otra" if no published vacancy fits them.
    s.push("position");
    s.push("name");
    s.push("contact");
    if (formFields.gender) s.push("gender");
    if (formFields.origin_country) s.push("origin");
    if (formFields.address) s.push("location");
    if (formFields.vehicle) s.push("vehicle");
    s.push("languages");
    s.push("experience");
    s.push("availability");
    if (formFields.disability) s.push("disability");
    if (formFields.cv) s.push("cv");
    s.push("review");
    return s;
  }, [formFields]);

  const current = steps[stepIndex] || "intro";
  const total = steps.length;
  const progress = stepIndex > 0 && current !== "review" ? Math.round((stepIndex / (total - 1)) * 100) : current === "review" ? 100 : 0;

  const next = useCallback(() => setStepIndex((s) => Math.min(s + 1, total - 1)), [total]);
  const back = useCallback(() => { haptic.light(); setStepIndex((s) => Math.max(s - 1, 0)); }, [haptic]);

  const handleSubmit = async () => {
    const last = localStorage.getItem("last_application_submit");
    if (last && Date.now() - parseInt(last) < 3600000) {
      toast({ title: t("apply_error_duplicate"), variant: "destructive" });
      return;
    }
    if (honeypot) return;
    setSubmitting(true);
    try {
      let cv_file_url = ""; let cv_file_type: "pdf" | "image" | "" = "";
      if (data.cv_file) {
        const ext = data.cv_file.name.split(".").pop()?.toLowerCase() || "jpg";
        cv_file_type = ext === "pdf" ? "pdf" : "image";
        const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("cvs").upload(path, data.cv_file, { contentType: data.cv_file.type });
        if (upErr) throw upErr;
        cv_file_url = path;
      }
      // derive spanish_level from languages if available
      const esEntry = data.languages.find((l) => l.lang === "es");
      const spanishLevel = esEntry ? Math.min(5, esEntry.level + 1) : data.spanish_level;

      const { data: submitData, error: submitErr } = await supabase.functions.invoke(
        "submit-application",
        {
          body: {
            honeypot,
            application: {
              job_position_id:
                data.job_position_id && data.job_position_id !== "__other" ? data.job_position_id : null,
              custom_position:
                data.job_position_id === "__other" ? data.custom_position.trim() || null : null,
              first_name: data.first_name.trim(),
              last_name: data.last_name.trim(),
              email: data.email.trim() || null,
              phone: data.phone.trim() || null,
              gender: (data.gender || "male") as "male" | "female",
              origin_country: data.origin_country.trim() || "—",
              current_address: data.current_address || "—",
              current_lat: data.current_lat,
              current_lng: data.current_lng,
              vehicle: data.vehicle,
              spanish_level: spanishLevel,
              cv_file_url: cv_file_url || null,
              cv_file_type: cv_file_type || null,
              form_language: language,
              has_disability: data.has_disability ?? false,
              languages: data.languages,
              years_experience: data.years_experience || null,
              availability: data.availability || null,
              shifts: data.shifts,
            },
          },
        }
      );
      if (submitErr || (submitData as any)?.error) {
        throw submitErr || new Error((submitData as any).error || "submit failed");
      }
      localStorage.setItem("last_application_submit", Date.now().toString());
      haptic.success();
      setDone(true);
    } catch (err) {
      console.error(err);
      haptic.error();
      toast({ title: t("errorSubmit") || "Error", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (done) return (
    <div className="fixed inset-0 bg-background flex items-center justify-center" style={{ minHeight: "100dvh" }}>
      <StepDone />
    </div>
  );

  // Initial loading screen — soft, branded fade-in/out so el contenido nunca
  // aparece de golpe cuando alguien escanea el QR.
  const showSplash = positionsLoading || !minSplashDone;

  const langs: Language[] = ["es", "ar", "fr"];

  return (
    <div
      className="fixed inset-0 bg-background flex flex-col"
      style={{ minHeight: "100dvh", height: "100dvh" }}
      dir={language === "ar" ? "rtl" : "ltr"}
    >
      <AnimatedBackdrop intense={current === "intro" || showSplash} />

      {/* Splash de carga con crossfade suave */}
      <AnimatePresence>
        {showSplash && (
          <motion.div
            key="splash"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } }}
            className="fixed inset-0 z-[60] bg-background flex items-center justify-center overflow-hidden"
            style={{ minHeight: "100dvh", height: "100dvh" }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.04 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex flex-col items-center gap-5"
            >
              {/* Halo pulsante */}
              <motion.div
                aria-hidden
                className="absolute -inset-8 rounded-full blur-3xl"
                style={{ background: "radial-gradient(circle, hsl(80 100% 42% / 0.45) 0%, transparent 70%)" }}
                animate={{ scale: [1, 1.18, 1], opacity: [0.55, 0.95, 0.55] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.img
                src="/images/verdnatura-logo-green.png"
                alt="VerdNatura"
                className="relative h-12 w-auto object-contain drop-shadow-[0_0_18px_hsl(80_100%_42%/0.45)]"
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="relative flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-primary"
                    animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
                  />
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <input
        type="text" name="website" value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        className="absolute -left-[9999px] opacity-0 h-0 w-0"
        tabIndex={-1} autoComplete="off"
      />

      {/* Progress bar */}
      <div className="absolute top-0 inset-x-0 h-0.5 bg-muted/50 z-50">
        <motion.div
          className="h-full bg-gradient-to-r from-primary via-primary/80 to-primary/40"
          initial={false}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>

      {/* Header */}
      {current !== "intro" && (
        <div className="flex items-center justify-between px-5 pt-4 pb-2 z-40" style={{ paddingTop: "calc(env(safe-area-inset-top, 0) + 1rem)" }}>
          <button
            onClick={back}
            className="w-10 h-10 rounded-full hover:bg-muted/60 flex items-center justify-center transition-colors active:scale-95"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <img src="/images/verdnatura-logo-green.png" alt="VerdNatura" className="h-7 w-auto object-contain opacity-90" />

          <div className="relative">
            <button
              onClick={() => setShowLangMenu((v) => !v)}
              className="w-10 h-10 rounded-full hover:bg-muted/60 flex items-center justify-center text-xl transition-colors active:scale-95"
            >
              {languageFlags[language]}
            </button>
            {showLangMenu && (
              <div className="absolute end-0 top-12 bg-popover border rounded-2xl shadow-xl p-1 z-50 min-w-[120px]">
                {langs.map((l) => (
                  <button
                    key={l}
                    onClick={() => { setLanguage(l); setShowLangMenu(false); haptic.light(); }}
                    className={`w-full px-3 py-2 rounded-xl text-sm font-medium tracking-tight flex items-center gap-2 hover:bg-muted transition-colors ${language === l ? "bg-muted" : ""}`}
                  >
                    <span className="text-base">{languageFlags[l]}</span>
                    <span>{l === "es" ? "Español" : l === "ar" ? "العربية" : "Français"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step content */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={current} className="absolute inset-0 overflow-y-auto overflow-x-hidden">
            {current === "intro" && <StepIntro onNext={next} />}
            {current === "position" && (
              <StepPosition
                positions={positions}
                loading={positionsLoading}
                selected={data.job_position_id}
                customPosition={data.custom_position}
                onSelect={(id, title) => update({ job_position_id: id, job_title: title, custom_position: id === "__other" ? data.custom_position : "" })}
                onCustomChange={(v) => update({ custom_position: v })}
                onNext={next}
              />
            )}
            {current === "name" && (
              <StepName firstName={data.first_name} lastName={data.last_name}
                onChange={(f, l) => update({ first_name: f, last_name: l })}
                onNext={next} />
            )}
            {current === "contact" && (
              <StepContact
                email={data.email} phone={data.phone}
                onChange={(em, ph) => update({ email: em, phone: ph })}
                onNext={next}
              />
            )}
            {current === "gender" && (
              <StepGender value={data.gender} onChange={(v) => update({ gender: v })} onNext={next} />
            )}
            {current === "origin" && (
              <StepOrigin value={data.origin_country} onChange={(v) => update({ origin_country: v })} onNext={next} />
            )}
            {current === "location" && (
              <StepLocation
                address={data.current_address} lat={data.current_lat} lng={data.current_lng}
                onChange={(a, lat, lng) => update({ current_address: a, current_lat: lat, current_lng: lng })}
                onNext={next}
              />
            )}
            {current === "vehicle" && (
              <StepVehicleV2 value={data.vehicle} onChange={(v) => update({ vehicle: v })} onNext={next} />
            )}
            {current === "languages" && (
              <StepLanguages value={data.languages} onChange={(v) => update({ languages: v })} onNext={next} />
            )}
            {current === "experience" && (
              <StepExperience
                value={data.years_experience}
                onChange={(v) => update({ years_experience: v })}
                onNext={next}
                jobTitle={data.job_title}
                customPosition={data.custom_position}
              />
            )}
            {current === "availability" && (
              <StepAvailability value={data.availability} onChange={(v) => update({ availability: v })} onNext={next} />
            )}
            {current === "disability" && (
              <StepDisabilityV2 value={data.has_disability} onChange={(v) => update({ has_disability: v })} onNext={next} />
            )}
            {current === "cv" && (
              <StepCVV2 file={data.cv_file} fileType={data.cv_file_type}
                onChange={(f, ty) => update({ cv_file: f, cv_file_type: ty })} onNext={next} />
            )}
            {current === "review" && (
              <StepReview data={data} isSubmitting={submitting} onSubmit={handleSubmit} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
