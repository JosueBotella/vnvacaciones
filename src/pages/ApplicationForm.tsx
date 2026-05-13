import { useEffect } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { ApplyShell } from "@/components/apply/v2/ApplyShell";

export default function ApplicationForm() {
  const { isRTL } = useLanguage();

  // Force dark mode by default on this route for the wow effect (respect explicit user preference)
  useEffect(() => {
    const stored = localStorage.getItem("apply_theme");
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    if (!stored) {
      root.classList.add("dark");
    }
    return () => {
      // Restore original state when leaving the route
      if (!stored && !wasDark) root.classList.remove("dark");
    };
  }, []);

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className="bg-background text-foreground">
      <ApplyShell />
    </div>
  );
}
