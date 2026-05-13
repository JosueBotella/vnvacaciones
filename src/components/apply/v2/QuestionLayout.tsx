import { ReactNode, useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { getStoryTimestamp } from "./timestamp";
import { motion } from "framer-motion";

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Show timestamp above title (default true). Disable on welcome/done. */
  showTimestamp?: boolean;
  /** Vertical alignment of content. Default 'center'. Use 'top' for long forms (review). */
  align?: "center" | "top";
};

export function QuestionLayout({ title, subtitle, children, footer, showTimestamp = true, align = "center" }: Props) {
  const [stamp, setStamp] = useState(getStoryTimestamp());

  useEffect(() => {
    const id = setInterval(() => setStamp(getStoryTimestamp()), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col min-h-full w-full"
    >
      <div className={`flex-1 flex flex-col ${align === "center" ? "justify-center" : "justify-start"} px-6 py-8 max-w-md mx-auto w-full`}>
        {showTimestamp && (
          <div className="flex items-center gap-2 mb-6 text-xs font-light tracking-[0.25em] text-primary/70 uppercase">
            {stamp.isNight ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            <span className="font-mono">{stamp.time}</span>
            <span className="opacity-60">LTC</span>
          </div>
        )}
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tighter leading-[1.1] text-foreground">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-3 text-base font-light text-muted-foreground tracking-tight leading-relaxed">
            {subtitle}
          </p>
        )}
        <div className="mt-8 w-full">{children}</div>
      </div>
      {footer && (
        <div
          className="sticky bottom-0 inset-x-0 px-6 pt-4 pb-6 max-w-md mx-auto w-full bg-gradient-to-t from-background via-background/95 to-background/0"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0) + 1.25rem)" }}
        >
          {footer}
        </div>
      )}
    </motion.div>
  );
}
