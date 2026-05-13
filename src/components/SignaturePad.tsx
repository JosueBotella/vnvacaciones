import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, Check } from "lucide-react";

interface SignaturePadProps {
  onSignatureChange: (signature: string | null) => void;
  clearLabel?: string;
  confirmLabel?: string;
  signHereLabel?: string;
  confirmHintLabel?: string;
  strokeColor?: string;
  autoConfirm?: boolean;
}

export const SignaturePad = ({ 
  onSignatureChange, 
  clearLabel = "Borrar",
  confirmLabel = "Confirmar firma",
  signHereLabel = "Firma aquí",
  confirmHintLabel = "Pulsa \"Confirmar firma\" para validar",
  strokeColor,
  autoConfirm = false,
}: SignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    // Style
    ctx.strokeStyle = strokeColor || "hsl(84, 100%, 42%)"; // Primary green or custom
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Fill white background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
  }, []);

  const getCoordinates = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    
    if ("touches" in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.TouchEvent | React.MouseEvent) => {
    if (isConfirmed) return;
    if ("touches" in e) e.preventDefault();
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    // Re-apply stroke style in case context was reset
    ctx.strokeStyle = strokeColor || "hsl(84, 100%, 42%)";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasSignature(true);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing || isConfirmed) return;
    if ("touches" in e) e.preventDefault();
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    if (autoConfirm && hasSignature && !isConfirmed) {
      const canvas = canvasRef.current;
      if (canvas) {
        const signature = canvas.toDataURL("image/png");
        onSignatureChange(signature);
      }
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasSignature(false);
    setIsConfirmed(false);
    onSignatureChange(null);
  };

  const confirmSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;

    const signature = canvas.toDataURL("image/png");
    onSignatureChange(signature);
    setIsConfirmed(true);
  };

  return (
    <div className="space-y-3">
      <div 
        className={`
          relative border-2 rounded-xl overflow-hidden bg-white
          ${isConfirmed ? "border-primary" : "border-border"}
          ${!isConfirmed ? "cursor-crosshair" : "cursor-default"}
        `}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-32 touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        {!hasSignature && !isConfirmed && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-muted-foreground/40 text-sm font-light tracking-wide">
              {signHereLabel}
            </p>
          </div>
        )}
        {hasSignature && !isConfirmed && !autoConfirm && (
          <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center pointer-events-none">
            <p className="text-foreground text-xs font-medium bg-muted/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-border/50">
              {confirmHintLabel}
            </p>
          </div>
        )}
        {(isConfirmed || (autoConfirm && hasSignature)) && (
          <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
            <Check className="h-4 w-4" />
          </div>
        )}
      </div>
      
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={clearSignature}
          className="flex-1"
        >
          <Eraser className="h-4 w-4 mr-1.5" />
          {clearLabel}
        </Button>
        {hasSignature && !isConfirmed && !autoConfirm && (
          <Button
            type="button"
            size="sm"
            onClick={confirmSignature}
            className="flex-1 bg-primary hover:bg-primary/90"
          >
            <Check className="h-4 w-4 mr-1.5" />
            {confirmLabel}
          </Button>
        )}
      </div>
    </div>
  );
};
