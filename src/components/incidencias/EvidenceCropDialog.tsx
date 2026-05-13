import { useCallback, useState } from "react";
import Cropper, { Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Loader2, Crop as CropIcon, RotateCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  propuestaId: string;
  /** If provided, this admin path will be removed after the cropped version is uploaded (replace flow) */
  replaceAdminPath?: string;
  /** If provided, this MANAGER (encargado) path will be soft-disabled after the cropped version is uploaded */
  replaceManagerPath?: string;
  onUploaded: (newAdminPruebasUrls: string[], disabledManagerPruebas?: string[]) => void;
}

async function getCroppedBlob(
  imageUrl: string,
  cropPx: Area,
  rotation: number,
): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = imageUrl;
  });

  const radians = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));

  // Bounding box of rotated source
  const rotW = img.width * cos + img.height * sin;
  const rotH = img.width * sin + img.height * cos;

  // First render rotated full image to an offscreen canvas
  const off = document.createElement("canvas");
  off.width = rotW;
  off.height = rotH;
  const offCtx = off.getContext("2d")!;
  offCtx.translate(rotW / 2, rotH / 2);
  offCtx.rotate(radians);
  offCtx.drawImage(img, -img.width / 2, -img.height / 2);

  // Now crop from the rotated canvas
  const out = document.createElement("canvas");
  out.width = cropPx.width;
  out.height = cropPx.height;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(
    off,
    cropPx.x,
    cropPx.y,
    cropPx.width,
    cropPx.height,
    0,
    0,
    cropPx.width,
    cropPx.height,
  );

  return new Promise<Blob>((resolve, reject) => {
    out.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      0.92,
    );
  });
}

export function EvidenceCropDialog({
  open,
  onOpenChange,
  imageUrl,
  propuestaId,
  replaceAdminPath,
  replaceManagerPath,
  onUploaded,
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_: Area, areaPx: Area) => {
    setCroppedAreaPixels(areaPx);
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    setSaving(true);
    try {
      const blob = await getCroppedBlob(imageUrl, croppedAreaPixels, rotation);
      const file = new File([blob], `recorte-${Date.now()}.jpg`, { type: "image/jpeg" });

      const sessionToken = localStorage.getItem("manager_session_token") || "";
      const formData = new FormData();
      formData.append("file", file);
      formData.append("propuestaId", propuestaId);
      formData.append("sessionToken", sessionToken);
      formData.append("action", "addAdminProposalImage");
      // Soft-disable original manager evidence in the same upload (atomic on the server).
      if (replaceManagerPath) {
        formData.append("disableManagerPath", replaceManagerPath);
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/incidencias-operations`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: formData,
        },
      );
      const result = await res.json();
      if (!result?.success || !result.admin_pruebas_urls) {
        toast.error(result?.error || "Error al subir el recorte");
        return;
      }

      let finalUrls: string[] = result.admin_pruebas_urls;
      let finalDisabled: string[] | undefined = Array.isArray(result.disabled_manager_pruebas)
        ? result.disabled_manager_pruebas
        : undefined;

      // If replacing an existing admin image, remove the old one
      if (replaceAdminPath) {
        const { data } = await supabase.functions.invoke("incidencias-operations", {
          body: {
            action: "removeAdminProposalImage",
            sessionToken,
            propuestaId,
            filePath: replaceAdminPath,
          },
        });
        if (data?.success && Array.isArray(data.admin_pruebas_urls)) {
          finalUrls = data.admin_pruebas_urls;
        }
      }

      onUploaded(finalUrls, finalDisabled);
      toast.success(
        replaceManagerPath
          ? "Recorte guardado · original del encargado desactivada"
          : replaceAdminPath
          ? "Imagen recortada reemplazada"
          : "Recorte añadido a evidencias admin",
      );
      onOpenChange(false);
      // Reset for next use
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "No se pudo procesar el recorte");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CropIcon className="h-4 w-4" />
            Recortar evidencia
          </DialogTitle>
        </DialogHeader>

        <div className="relative w-full h-[55vh] bg-black/90 rounded-lg overflow-hidden">
          {imageUrl && (
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={undefined}
              restrictPosition={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onCropComplete}
              objectFit="contain"
            />
          )}
        </div>

        <div className="space-y-3 pt-1">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-14 shrink-0">Zoom</span>
            <Slider
              value={[zoom]}
              min={0.5}
              max={4}
              step={0.05}
              onValueChange={(v) => setZoom(v[0])}
              className="flex-1"
            />
            <span className="text-xs tabular-nums w-10 text-right">{zoom.toFixed(2)}×</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-14 shrink-0">Rotar</span>
            <Slider
              value={[rotation]}
              min={-180}
              max={180}
              step={1}
              onValueChange={(v) => setRotation(v[0])}
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="h-8 px-2"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs tabular-nums w-10 text-right">{rotation}°</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Arrastra para mover · pellizca o usa la rueda para hacer zoom · ajusta el marco al área que quieras conservar.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !croppedAreaPixels}>
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                Guardando…
              </>
            ) : replaceAdminPath ? (
              "Reemplazar con recorte"
            ) : (
              "Guardar recorte"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
