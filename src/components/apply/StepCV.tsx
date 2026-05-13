import { useState, useRef } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Upload, Camera, FileText, Image, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { ApplicationData } from "./ApplicationWizard";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

type Props = {
  data: ApplicationData;
  updateData: (partial: Partial<ApplicationData>) => void;
  onNext: () => void;
  onBack: () => void;
};

async function compressImage(file: File, maxWidth = 1600, quality = 0.8): Promise<File> {
  if (file.type === "application/pdf") return file;
  
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let w = img.width;
      let h = img.height;
      if (w > maxWidth) {
        h = (h * maxWidth) / w;
        w = maxWidth;
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          resolve(new File([blob!], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
        },
        "image/jpeg",
        quality
      );
    };
    img.src = URL.createObjectURL(file);
  });
}

export function StepCV({ data, updateData, onNext, onBack }: Props) {
  const { t } = useLanguage();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_SIZE) {
      toast({ title: t("apply_error_file_size"), variant: "destructive" });
      return;
    }

    let processed = file;
    if (!file.type.includes("pdf")) {
      processed = await compressImage(file);
    }

    updateData({
      cv_file: processed,
      cv_file_type: processed.type.includes("pdf") ? "pdf" : "image",
    });

    if (processed.type.includes("pdf")) {
      setPreview(null);
    } else {
      setPreview(URL.createObjectURL(processed));
    }
  };

  const clearFile = () => {
    updateData({ cv_file: null, cv_file_type: "" });
    setPreview(null);
  };

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="h-4 w-4" />
        {t("apply_back")}
      </button>

      <h2 className="text-lg font-semibold">{t("apply_step_cv")}</h2>

      {!data.cv_file ? (
        <div className="space-y-3">
          {/* Drop zone */}
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full h-40 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-3 hover:border-primary/50 hover:bg-muted/30 transition-all"
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center px-4">{t("apply_cv_drop")}</p>
          </button>

          {/* Camera button */}
          <Button
            variant="outline"
            className="w-full h-14 text-base rounded-xl gap-2"
            onClick={() => cameraRef.current?.click()}
          >
            <Camera className="h-5 w-5" />
            {t("apply_cv_camera")}
          </Button>

          <p className="text-xs text-muted-foreground text-center">{t("apply_cv_max_size")}</p>

          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative border rounded-xl p-4 flex items-center gap-3">
            {data.cv_file_type === "pdf" ? (
              <FileText className="h-10 w-10 text-red-500 shrink-0" />
            ) : (
              <Image className="h-10 w-10 text-blue-500 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{data.cv_file.name}</p>
              <p className="text-xs text-muted-foreground">
                {(data.cv_file.size / 1024).toFixed(0)} KB
              </p>
            </div>
            <button
              onClick={clearFile}
              className="p-1.5 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {preview && (
            <img src={preview} alt="CV preview" className="w-full rounded-xl border max-h-60 object-contain" />
          )}
        </div>
      )}

      <Button
        size="lg"
        className="w-full h-14 text-lg rounded-xl"
        onClick={onNext}
      >
        {t("apply_next")}
      </Button>
    </div>
  );
}
