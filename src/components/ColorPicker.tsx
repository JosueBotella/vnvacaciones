import { useCallback, useRef, useState, useEffect } from "react";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
  /** Colors currently in use by other groups — shown as quick-access swatches */
  activeColors?: string[];
}

// Convert HSV to hex
function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
  };
  const r = Math.round(f(5) * 255);
  const g = Math.round(f(3) * 255);
  const b = Math.round(f(1) * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// Convert hex to HSV
function hexToHsv(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6 * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

export function ColorPicker({ value, onChange, label, activeColors = [] }: ColorPickerProps) {
  const normalizedValue = value.startsWith("#") ? value : `#${value}`;
  const [hsv, setHsv] = useState<[number, number, number]>(() => hexToHsv(normalizedValue));
  const [hue, saturation, brightness] = hsv;

  const squareRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const draggingSquare = useRef(false);
  const draggingHue = useRef(false);

  // Sync HSV when external value changes
  useEffect(() => {
    const newHsv = hexToHsv(normalizedValue);
    // Only update if the color actually differs (avoid loops)
    if (hsvToHex(newHsv[0], newHsv[1], newHsv[2]).toLowerCase() !== hsvToHex(hsv[0], hsv[1], hsv[2]).toLowerCase()) {
      setHsv(newHsv);
    }
  }, [normalizedValue]);

  const updateFromSquare = useCallback((clientX: number, clientY: number) => {
    const rect = squareRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    const newHsv: [number, number, number] = [hue, s, v];
    setHsv(newHsv);
    onChange(hsvToHex(newHsv[0], newHsv[1], newHsv[2]));
  }, [hue, onChange]);

  const updateFromHue = useCallback((clientX: number) => {
    const rect = hueRef.current?.getBoundingClientRect();
    if (!rect) return;
    const h = Math.max(0, Math.min(360, (clientX - rect.left) / rect.width * 360));
    const newHsv: [number, number, number] = [h, saturation, brightness];
    setHsv(newHsv);
    onChange(hsvToHex(newHsv[0], newHsv[1], newHsv[2]));
  }, [saturation, brightness, onChange]);

  // Mouse/touch handlers
  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      if (draggingSquare.current) {
        e.preventDefault();
        updateFromSquare(clientX, clientY);
      }
      if (draggingHue.current) {
        e.preventDefault();
        updateFromHue(clientX);
      }
    };
    const handleUp = () => {
      draggingSquare.current = false;
      draggingHue.current = false;
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleUp);
    };
  }, [updateFromSquare, updateFromHue]);

  const pureHueColor = hsvToHex(hue, 1, 1);

  return (
    <div className="space-y-3">
      {label && <p className="text-xs text-muted-foreground">{label}</p>}

      {/* Active colors quick access */}
      {activeColors.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {activeColors.map((c) => (
            <button
              key={c}
              className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
              style={{
                backgroundColor: c,
                borderColor: normalizedValue.toLowerCase() === c.toLowerCase() ? "white" : "transparent",
              }}
              onClick={() => onChange(c)}
            />
          ))}
        </div>
      )}

      {/* Saturation-Brightness square */}
      <div
        ref={squareRef}
        className="relative w-full h-32 rounded-lg cursor-crosshair select-none"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pureHueColor})`,
        }}
        onMouseDown={(e) => {
          draggingSquare.current = true;
          updateFromSquare(e.clientX, e.clientY);
        }}
        onTouchStart={(e) => {
          draggingSquare.current = true;
          updateFromSquare(e.touches[0].clientX, e.touches[0].clientY);
        }}
      >
        {/* Thumb */}
        <div
          className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-md pointer-events-none"
          style={{
            left: `${saturation * 100}%`,
            top: `${(1 - brightness) * 100}%`,
            transform: "translate(-50%, -50%)",
            backgroundColor: hsvToHex(hue, saturation, brightness),
          }}
        />
      </div>

      {/* Hue slider */}
      <div
        ref={hueRef}
        className="relative w-full h-3 rounded-full cursor-pointer select-none"
        style={{
          background: "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
        }}
        onMouseDown={(e) => {
          draggingHue.current = true;
          updateFromHue(e.clientX);
        }}
        onTouchStart={(e) => {
          draggingHue.current = true;
          updateFromHue(e.touches[0].clientX);
        }}
      >
        <div
          className="absolute w-4 h-4 rounded-full border-2 border-white shadow-md pointer-events-none"
          style={{
            left: `${(hue / 360) * 100}%`,
            top: "50%",
            transform: "translate(-50%, -50%)",
            backgroundColor: pureHueColor,
          }}
        />
      </div>

      {/* Preview */}
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-full border border-border flex-shrink-0"
          style={{ backgroundColor: hsvToHex(hue, saturation, brightness) }}
        />
        <span className="text-xs font-mono text-muted-foreground uppercase">
          {hsvToHex(hue, saturation, brightness)}
        </span>
      </div>
    </div>
  );
}
