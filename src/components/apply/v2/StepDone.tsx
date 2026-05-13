import { useLanguage } from "@/hooks/useLanguage";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

export function StepDone() {
  const { t } = useLanguage();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center h-full px-6 py-12 text-center max-w-md mx-auto"
    >
      <motion.div
        initial={{ scale: 0, rotate: -90 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 18, delay: 0.15 }}
        className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center shadow-2xl shadow-primary/30 mb-8"
      >
        <Check className="h-12 w-12 text-background" strokeWidth={3} />
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="text-3xl md:text-4xl font-semibold tracking-tighter leading-tight"
      >
        {t("apply_success_title")}
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.55 }}
        className="mt-4 text-base font-light text-muted-foreground tracking-tight leading-relaxed"
      >
        {t("apply_success_message")}
      </motion.p>
    </motion.div>
  );
}
