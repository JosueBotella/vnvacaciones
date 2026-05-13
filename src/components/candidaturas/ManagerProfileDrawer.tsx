import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getManagerSessionToken } from "@/lib/sessionHelpers";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, Camera, Trash2, Mail, KeyRound, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { ManagerAvatar } from "./ManagerAvatar";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Manager being edited */
  manager: {
    id: string;
    name: string;
    email?: string | null;
    avatar_url?: string | null;
  } | null;
  /**
   * If true, the editor is acting as an admin editing somebody else's profile:
   * password section requires no current password (or is hidden), email/avatar
   * are editable on behalf of the user.
   */
  adminMode?: boolean;
  /** Allow the user to change their password (only when self-editing) */
  allowPasswordChange?: boolean;
  onSaved?: (updates: { email?: string | null; avatar_url?: string | null }) => void;
};

/** Resize a File/Blob to a square ≤ maxSize px and return a JPEG data URL. */
async function resizeToSquare(file: File, maxSize = 256): Promise<{ dataUrl: string; mime: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = maxSize;
    canvas.height = maxSize;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, side, side, 0, 0, maxSize, maxSize);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    return { dataUrl, mime: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ManagerProfileDrawer({
  open,
  onOpenChange,
  manager,
  adminMode = false,
  allowPasswordChange = true,
  onSaved,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [email, setEmail] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    if (!open || !manager) return;
    setEmail(manager.email || "");
    setAvatarPreview(manager.avatar_url || null);
    setAvatarChanged(false);
    setRemoveAvatar(false);
    setPendingFile(null);
    setCurrentPwd("");
    setNewPwd("");
    setConfirmPwd("");
  }, [open, manager]);

  const handlePickFile = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecciona una imagen");
      return;
    }
    try {
      const { dataUrl } = await resizeToSquare(file, 256);
      setAvatarPreview(dataUrl);
      setPendingFile(file);
      setAvatarChanged(true);
      setRemoveAvatar(false);
    } catch (e) {
      console.error(e);
      toast.error("No se pudo procesar la imagen");
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarPreview(null);
    setPendingFile(null);
    setAvatarChanged(true);
    setRemoveAvatar(true);
  };

  const handleSaveProfile = async () => {
    if (!manager) return;
    const trimmedEmail = email.trim().toLowerCase();
    const emailChanged = trimmedEmail !== (manager.email || "").toLowerCase();
    if (!emailChanged && !avatarChanged) {
      toast.info("No hay cambios que guardar");
      return;
    }
    if (emailChanged && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("Introduce un email válido");
      return;
    }

    setSavingProfile(true);
    try {
      const sessionToken = getManagerSessionToken();
      const payload: any = {
        action: "updateProfile",
        sessionToken,
      };
      if (adminMode) payload.managerId = manager.id;
      if (emailChanged) payload.email = trimmedEmail;

      if (avatarChanged) {
        if (removeAvatar) {
          payload.removeAvatar = true;
        } else if (pendingFile) {
          const { dataUrl, mime } = await resizeToSquare(pendingFile, 256);
          payload.avatarBase64 = dataUrl;
          payload.avatarMimeType = mime;
        }
      }

      const { data, error } = await supabase.functions.invoke("manager-auth", { body: payload });
      if (error || !data?.success) {
        toast.error(data?.error || "Error al actualizar el perfil");
        return;
      }

      toast.success("Perfil actualizado");
      onSaved?.({
        email: data.manager?.email ?? (emailChanged ? trimmedEmail : undefined),
        avatar_url: data.manager?.avatar_url ?? (removeAvatar ? null : undefined),
      });
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error("Error al actualizar el perfil");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePassword = async () => {
    if (!manager) return;
    if (!adminMode && !currentPwd) {
      toast.error("Introduce tu contraseña actual");
      return;
    }
    if (newPwd.length < 8) {
      toast.error("La nueva contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    setSavingPwd(true);
    try {
      const sessionToken = getManagerSessionToken();
      const payload: any = {
        action: "changePassword",
        sessionToken,
        newPassword: newPwd,
      };
      if (adminMode) payload.managerId = manager.id;
      else payload.password = currentPwd;

      const { data, error } = await supabase.functions.invoke("manager-auth", { body: payload });
      if (error || !data?.success) {
        toast.error(data?.error || "Error al cambiar la contraseña");
        return;
      }
      toast.success("Contraseña actualizada");
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
    } catch (e) {
      console.error(e);
      toast.error("Error al cambiar la contraseña");
    } finally {
      setSavingPwd(false);
    }
  };

  if (!manager) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>{adminMode ? `Editar perfil de ${manager.name}` : "Mi perfil"}</SheetTitle>
          <SheetDescription>
            {adminMode
              ? "Cambia su foto de perfil, email o contraseña."
              : "Actualiza tu foto, email de inicio de sesión o contraseña."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Avatar section */}
          <section className="space-y-3">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Foto de perfil</Label>
            <div className="flex items-center gap-4">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt={manager.name}
                  className="h-20 w-20 rounded-full object-cover ring-2 ring-background shadow-sm"
                />
              ) : (
                <ManagerAvatar name={manager.name} avatarUrl={null} size="xl" showTooltip={false} />
              )}
              <div className="flex flex-col gap-2">
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5">
                  <ImagePlus className="h-3.5 w-3.5" /> Cambiar foto
                </Button>
                {avatarPreview && (
                  <Button variant="ghost" size="sm" onClick={handleRemoveAvatar} className="gap-1.5 text-destructive hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" /> Quitar foto
                  </Button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handlePickFile(e.target.files?.[0] || null)}
              />
            </div>
          </section>

          <Separator />

          {/* Email */}
          <section className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Mail className="h-3 w-3" /> Email de inicio de sesión
            </Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@verdnatura.es"
            />
          </section>

          <Button onClick={handleSaveProfile} disabled={savingProfile} className="w-full">
            {savingProfile && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar cambios
          </Button>

          {allowPasswordChange && (
            <>
              <Separator />
              <section className="space-y-3">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <KeyRound className="h-3 w-3" /> {adminMode ? "Establecer nueva contraseña" : "Cambiar contraseña"}
                </Label>
                {!adminMode && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Contraseña actual</Label>
                    <Input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs">Nueva contraseña (mín. 8)</Label>
                  <Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Confirmar nueva contraseña</Label>
                  <Input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} />
                </div>
                <Button onClick={handleSavePassword} disabled={savingPwd} variant="secondary" className="w-full">
                  {savingPwd && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {adminMode ? "Establecer contraseña" : "Cambiar contraseña"}
                </Button>
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
