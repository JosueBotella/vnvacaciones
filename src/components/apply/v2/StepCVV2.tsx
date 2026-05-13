import { useState, useRef } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { QuestionLayout } from "./QuestionLayout";
import { NextButton } from "./NextButton";
import { useHaptic } from "@/hooks/useHaptic";
import { Upload, Camera, FileText, Image as ImgIcon, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const MAX_SIZE = 10 * 1024 * 1024;

async function compressImage(file: File, maxWidth = 1600, quality = 0.8): Promise<File> {
  if (file.type === "application/pdf") return file;
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let w = img.width; let h = img.height;
      if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => resolve(new File([blob!], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" })), "image/jpeg", quality);
    };
    img.src = URL.createObjectURL(file);
  });
}

type Props = {
  file: File | null;
  fileType: "pdf" | "image" | "";
  onChange: (file: File | null, type: "pdf" | "image" | "") => void;
  onNext: () => void;
};

export function StepCVV2({ file, fileType, onChange, onNext }: Props) {
  const { t } = useLanguage();
  const haptic = useHaptic();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handle = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_SIZE) {
      toast({ title: t("apply_error_file_size"), variant: "destructive" });
      return;
    }
    haptic.success();
    let processed = f;
    if (!f.type.includes("pdf")) processed = await compressImage(f);
    const type = processed.type.includes("pdf") ? "pdf" : "image";
    onChange(processed, type);
    setPreview(type === "image" ? URL.createObjectURL(processed) : null);
  };

  const clear = () => {
    haptic.light();
    onChange(null, "");
    setPreview(null);
  };

  return (
    <QuestionLayout
      title={t("apply_v2_cv_title")}
      subtitle={t("apply_v2_cv_subtitle")}
      footer={<NextButton onClick={() => { haptic.medium(); onNext(); }} disabled={!file} label={t("apply_v2_continue")} />}
    >
      {!file ? (
        <div className="space-y-3">
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full h-44 border-2 border-dashed border-border rounded-3xl flex flex-col items-center justify-center gap-3 hover:border-primary/60 hover:bg-primary/5 transition-all active:scale-[0.98]"
          >
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Upload className="h-6 w-6 text-primary" />
            </div>
            <p className="text-sm font-semibold tracking-tight text-foreground px-4 text-center">{t("apply_cv_drop")}</p>
            <p className="text-xs font-light text-muted-foreground">{t("apply_cv_max_size")}</p>
          </button>

          <button
            onClick={() => cameraRef.current?.click()}
            className="w-full h-14 rounded-2xl border border-border bg-card/60 text-base font-semibold tracking-tight flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          >
            <Camera className="h-5 w-5" />
            {t("apply_cv_camera")}
          </button>

          <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => handle(e.target.files?.[0])} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handle(e.target.files?.[0])} />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl border bg-card/60 p-4 flex items-center gap-3">
            {fileType === "pdf" ? (
              <div className="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0">
                <FileText className="h-6 w-6 text-rose-500" />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                <ImgIcon className="h-6 w-6 text-blue-500" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold tracking-tight truncate">{file.name}</p>
              <p className="text-xs font-light text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
            </div>
            <button onClick={clear} className="p-2 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
              <X className="h-4 w-4" />
            </button>
          </div>
          {preview && <img src={preview} alt="CV" className="w-full rounded-2xl border max-h-52 object-contain bg-muted" />}
        </div>
      )}
    </QuestionLayout>
  );
}
