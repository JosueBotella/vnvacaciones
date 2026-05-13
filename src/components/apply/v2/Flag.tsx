/**
 * Flag — bandera redondeada (estilo Apple).
 * Usa PNG de flagcdn.com (más fiable que el SVG, que ocasionalmente falla
 * para ciertos países como RO o CO). Si la imagen falla o tarda, mostramos
 * un fallback con el emoji de la bandera para que NUNCA se vea rota.
 *
 * Recibe el código ISO 3166-1 alpha-2 (case-insensitive), p.ej. "ES", "MA".
 * También admite `lang` (es/fr/ar) para mostrar la bandera del idioma.
 */
import { useState } from "react";

type Props = {
  code?: string;
  lang?: "es" | "fr" | "ar";
  className?: string;
  size?: number;
};

const LANG_TO_COUNTRY: Record<string, string> = {
  es: "es",
  fr: "fr",
  ar: "ma", // árabe → bandera de Marruecos (mercado principal)
};

// Convierte un código ISO alpha-2 en su emoji bandera (regional indicator).
function codeToEmoji(cc: string): string {
  if (!cc || cc.length !== 2) return "🏳️";
  const A = 0x1f1e6;
  const base = "A".charCodeAt(0);
  const up = cc.toUpperCase();
  return String.fromCodePoint(A + (up.charCodeAt(0) - base), A + (up.charCodeAt(1) - base));
}

export function Flag({ code, lang, className, size = 32 }: Props) {
  const cc = (lang ? LANG_TO_COUNTRY[lang] : code || "").toLowerCase();
  const [failed, setFailed] = useState(false);

  if (!cc) return null;

  const baseClass =
    className ??
    "rounded-full object-cover bg-muted shadow-[0_0_0_1px_hsl(var(--border))]";

  if (failed) {
    return (
      <span
        className={baseClass + " inline-flex items-center justify-center select-none"}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.85), lineHeight: 1 }}
        aria-label={cc.toUpperCase()}
      >
        {codeToEmoji(cc)}
      </span>
    );
  }

  // PNG raster (w80) — más estable entre navegadores que el SVG.
  return (
    <img
      src={`https://flagcdn.com/w80/${cc}.png`}
      srcSet={`https://flagcdn.com/w160/${cc}.png 2x`}
      alt={cc.toUpperCase()}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={baseClass}
      style={{ width: size, height: size, aspectRatio: "1 / 1" }}
    />
  );
}
