import { useLanguage, Language } from "@/hooks/useLanguage";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useHaptic } from "@/hooks/useHaptic";
import { Flag } from "./Flag";

export function StepIntro({ onNext }: { onNext: () => void }) {
  const { t, language, setLanguage } = useLanguage();
  const haptic = useHaptic();

  const langs: Language[] = ["es", "ar", "fr"];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col h-full w-full px-6 py-12 max-w-md mx-auto"
    >
      <div className="flex-1 flex flex-col justify-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="mb-10 relative w-fit"
        >
          {/* Halo pulsante alrededor del logo */}
          <motion.div
            aria-hidden
            className="absolute inset-0 -m-6 rounded-full blur-2xl"
            style={{ background: "radial-gradient(circle, hsl(80 100% 42% / 0.45) 0%, transparent 70%)" }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.img
            src="/images/verdnatura-logo-green.png"
            alt="VerdNatura"
            className="relative h-14 w-auto object-contain drop-shadow-[0_0_20px_hsl(80_100%_42%/0.4)]"
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="text-4xl md:text-5xl font-semibold tracking-tighter leading-[1.05] text-foreground"
        >
          {t("apply_v2_intro_title")}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-5 text-lg font-light text-muted-foreground tracking-tight leading-relaxed"
        >
          {t("apply_v2_intro_subtitle")}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.55 }}
          className="mt-10 flex gap-2"
        >
          {langs.map((l, i) => (
            <motion.button
              key={l}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, delay: 0.6 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ scale: 1.08, y: -2 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => { haptic.light(); setLanguage(l); }}
              className={`h-12 w-12 rounded-2xl flex items-center justify-center border transition-colors ${
                language === l
                  ? "border-primary/60 bg-primary/15 shadow-[0_0_0_3px_hsl(var(--primary)/0.1)]"
                  : "border-border bg-card/60"
              }`}
              aria-label={l}
            >
              <Flag lang={l} size={28} className="rounded-full object-cover" />
            </motion.button>
          ))}
        </motion.div>
      </div>

      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.7 }}
        whileHover={{ scale: 1.02, y: -2 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => { haptic.medium(); onNext(); }}
        className="relative mt-8 h-16 rounded-3xl bg-foreground text-background font-semibold tracking-tight text-base flex items-center justify-center gap-3 shadow-xl overflow-hidden"
      >
        {/* Shimmer animado */}
        <motion.span
          aria-hidden
          className="absolute inset-0 -skew-x-12"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, hsl(var(--background) / 0.35) 50%, transparent 100%)",
          }}
          animate={{ x: ["-120%", "220%"] }}
          transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.2, ease: "easeInOut" }}
        />
        <span className="relative">{t("apply_v2_start")}</span>
        <motion.span
          className="relative flex"
          animate={{ x: [0, 4, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <ArrowRight className="h-5 w-5" />
        </motion.span>
      </motion.button>
    </motion.div>
  );
}
