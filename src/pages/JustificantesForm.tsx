import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, Camera, FileText, CheckCircle, Clock, XCircle, LogOut, Loader2, Calendar as CalendarIcon, Image, File, Crop } from "lucide-react";
import { ImageCropDialog } from "@/components/ImageCropDialog";
import { format } from "date-fns";
import { es, fr, arMA } from "date-fns/locale";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useLanguage, LanguageProvider } from "@/hooks/useLanguage";
import { LogoLink } from "@/components/LogoLink";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type WorkerSession = {
  id: string;
  name: string;
  workerNumber: string;
  departmentId: string;
  departmentName: string;
  email: string | null;
};

type Justificante = {
  id: string;
  tipo: string;
  fecha_inicio: string;
  fecha_fin: string;
  comentario_empleado: string | null;
  archivo_nombre: string;
  estado: string;
  created_at: string;
};

const translations = {
  es: {
    title: "Gestión de Justificantes",
    subtitle: "Sube tus justificantes de forma rápida y sencilla",
    loginTitle: "Identificación",
    workerNumber: "Número de fichar",
    password: "Contraseña",
    createPassword: "Crear contraseña",
    confirmPassword: "Confirmar contraseña",
    login: "Acceder",
    createAndLogin: "Crear contraseña y acceder",
    uploadTitle: "Subir Justificante",
    type: "Tipo de justificante",
    typeMedico: "Médico",
    typePersonal: "Personal",
    typeOtro: "Otro",
    dateStart: "Fecha inicio",
    dateEnd: "Fecha fin",
    comment: "Comentario (opcional)",
    selectFile: "Seleccionar archivo",
    takePhoto: "Hacer foto",
    upload: "Subir justificante",
    uploading: "Subiendo...",
    myJustificantes: "Mis justificantes",
    pending: "Pendiente",
    managed: "Gestionado",
    rejected: "Rechazado",
    noJustificantes: "No tienes justificantes",
    logout: "Cerrar sesión",
    welcome: "Bienvenido/a",
    errorWorkerNotFound: "Trabajador no encontrado",
    errorIncorrectPassword: "Contraseña incorrecta",
    errorPasswordMismatch: "Las contraseñas no coinciden",
    errorMinPassword: "La contraseña debe tener al menos 4 caracteres",
    errorUploadFailed: "Error al subir el archivo",
    successUploaded: "Justificante subido correctamente",
    successPasswordCreated: "Contraseña creada correctamente",
    samePasswordHint: "Si ya tienes cuenta en vacaciones, usa la misma contraseña",
    forgotPassword: "¿Olvidaste tu contraseña?",
    sendingResetEmail: "Enviando email...",
    resetEmailSent: "Email de recuperación enviado",
    resetEmailError: "Error al enviar el email de recuperación",
    noVacationAccount: "Debes tener cuenta de vacaciones para recuperar contraseña",
    editImage: "Editar imagen",
    cropTitle: "Ajustar imagen",
    cropZoom: "Zoom",
    cropRotate: "Rotar",
    cropConfirm: "Aplicar",
    cropCancel: "Cancelar",
  },
  fr: {
    title: "Gestion des Justificatifs",
    subtitle: "Téléchargez vos justificatifs facilement",
    loginTitle: "Identification",
    workerNumber: "Numéro de badge",
    password: "Mot de passe",
    createPassword: "Créer un mot de passe",
    confirmPassword: "Confirmer le mot de passe",
    login: "Se connecter",
    createAndLogin: "Créer et se connecter",
    uploadTitle: "Télécharger un Justificatif",
    type: "Type de justificatif",
    typeMedico: "Médical",
    typePersonal: "Personnel",
    typeOtro: "Autre",
    dateStart: "Date de début",
    dateEnd: "Date de fin",
    comment: "Commentaire (optionnel)",
    selectFile: "Sélectionner un fichier",
    takePhoto: "Prendre une photo",
    upload: "Télécharger",
    uploading: "Téléchargement...",
    myJustificantes: "Mes justificatifs",
    pending: "En attente",
    managed: "Traité",
    rejected: "Rejeté",
    noJustificantes: "Aucun justificatif",
    logout: "Déconnexion",
    welcome: "Bienvenue",
    errorWorkerNotFound: "Travailleur non trouvé",
    errorIncorrectPassword: "Mot de passe incorrect",
    errorPasswordMismatch: "Les mots de passe ne correspondent pas",
    errorMinPassword: "Le mot de passe doit contenir au moins 4 caractères",
    errorUploadFailed: "Échec du téléchargement",
    successUploaded: "Justificatif téléchargé",
    successPasswordCreated: "Mot de passe créé",
    samePasswordHint: "Si vous avez déjà un compte vacances, utilisez le même mot de passe",
    forgotPassword: "Mot de passe oublié ?",
    sendingResetEmail: "Envoi de l'email...",
    resetEmailSent: "Email de récupération envoyé",
    resetEmailError: "Erreur lors de l'envoi de l'email",
    noVacationAccount: "Vous devez avoir un compte vacances pour récupérer le mot de passe",
    editImage: "Modifier l'image",
    cropTitle: "Ajuster l'image",
    cropZoom: "Zoom",
    cropRotate: "Rotation",
    cropConfirm: "Appliquer",
    cropCancel: "Annuler",
  },
  ar: {
    title: "إدارة المبررات",
    subtitle: "قم بتحميل مبرراتك بسهولة",
    loginTitle: "تحديد الهوية",
    workerNumber: "رقم العمل",
    password: "كلمة المرور",
    createPassword: "إنشاء كلمة مرور",
    confirmPassword: "تأكيد كلمة المرور",
    login: "دخول",
    createAndLogin: "إنشاء والدخول",
    uploadTitle: "تحميل مبرر",
    type: "نوع المبرر",
    typeMedico: "طبي",
    typePersonal: "شخصي",
    typeOtro: "آخر",
    dateStart: "تاريخ البداية",
    dateEnd: "تاريخ النهاية",
    comment: "تعليق (اختياري)",
    selectFile: "اختر ملفًا",
    takePhoto: "التقاط صورة",
    upload: "تحميل",
    uploading: "جارٍ التحميل...",
    myJustificantes: "مبرراتي",
    pending: "قيد الانتظار",
    managed: "تمت المعالجة",
    rejected: "مرفوض",
    noJustificantes: "لا توجد مبررات",
    logout: "تسجيل الخروج",
    welcome: "مرحبًا",
    errorWorkerNotFound: "العامل غير موجود",
    errorIncorrectPassword: "كلمة مرور خاطئة",
    errorPasswordMismatch: "كلمات المرور غير متطابقة",
    errorMinPassword: "يجب أن تتكون كلمة المرور من 4 أحرف على الأقل",
    errorUploadFailed: "فشل التحميل",
    successUploaded: "تم تحميل المبرر",
    successPasswordCreated: "تم إنشاء كلمة المرور",
    samePasswordHint: "إذا كان لديك حساب إجازات، استخدم نفس كلمة المرور",
    forgotPassword: "نسيت كلمة المرور؟",
    sendingResetEmail: "جارٍ إرسال البريد...",
    resetEmailSent: "تم إرسال بريد الاسترداد",
    resetEmailError: "خطأ في إرسال البريد",
    noVacationAccount: "يجب أن يكون لديك حساب إجازات لاسترداد كلمة المرور",
    editImage: "تعديل الصورة",
    cropTitle: "ضبط الصورة",
    cropZoom: "تكبير",
    cropRotate: "تدوير",
    cropConfirm: "تطبيق",
    cropCancel: "إلغاء",
  },
};

const JustificantesFormContent = () => {
  const navigate = useNavigate();
  const { language, isRTL } = useLanguage();
  const t = translations[language as keyof typeof translations] || translations.es;
  const locale = language === "ar" ? arMA : language === "fr" ? fr : es;
  
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<WorkerSession | null>(null);
  
  // Login state
  const [workerNumber, setWorkerNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState<boolean | null>(null);
  const [checkingWorker, setCheckingWorker] = useState(false);
  const [workerName, setWorkerName] = useState("");
  const [hasVacationAccount, setHasVacationAccount] = useState(false);
  const [sendingResetEmail, setSendingResetEmail] = useState(false);
  const [workerIdForReset, setWorkerIdForReset] = useState<string | null>(null);
  
  // Upload state
  const [tipo, setTipo] = useState<string>("medico");
  const [fechaInicio, setFechaInicio] = useState<Date | undefined>();
  const [fechaFin, setFechaFin] = useState<Date | undefined>();
  const [comentario, setComentario] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<Array<{ file: File; preview: string | null; originalForCrop: string | null }>>([]);
  const [showCropDialog, setShowCropDialog] = useState(false);
  const [cropFileIndex, setCropFileIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  
  // Justificantes list
  const [justificantes, setJustificantes] = useState<Justificante[]>([]);
  const [loadingJustificantes, setLoadingJustificantes] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Check for existing session on mount
  useEffect(() => {
    const savedSession = localStorage.getItem("justificantes_session");
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        setSession(parsed);
      } catch {
        localStorage.removeItem("justificantes_session");
      }
    }
  }, []);

  // Load justificantes when session is set
  useEffect(() => {
    if (session) {
      loadJustificantes();
    }
  }, [session]);

  const loadJustificantes = async () => {
    if (!session) return;
    setLoadingJustificantes(true);
    try {
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: { action: "getMyJustificantes", data: { workerId: session.id } }
      });
      if (data?.success) {
        setJustificantes(data.justificantes || []);
      }
    } catch (error) {
      console.error("Error loading justificantes:", error);
    } finally {
      setLoadingJustificantes(false);
    }
  };

  const checkWorker = async () => {
    if (!workerNumber.trim()) return;
    setCheckingWorker(true);
    try {
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: { action: "checkWorker", data: { workerNumber: workerNumber.trim() } }
      });
      if (data?.success && data.worker) {
        setWorkerName(data.worker.name);
        setNeedsPassword(!data.worker.hasPassword);
        setHasVacationAccount(data.worker.usesSupabaseAuth || false);
        setWorkerIdForReset(data.worker.id || null);
      } else {
        toast.error(t.errorWorkerNotFound);
        setNeedsPassword(null);
        setWorkerName("");
        setHasVacationAccount(false);
        setWorkerIdForReset(null);
      }
    } catch (error) {
      console.error("Error checking worker:", error);
      toast.error(t.errorWorkerNotFound);
    } finally {
      setCheckingWorker(false);
    }
  };

  const handleLogin = async () => {
    if (!workerNumber.trim()) return;
    setLoading(true);

    try {
      if (needsPassword) {
        // Create password
        if (password !== confirmPassword) {
          toast.error(t.errorPasswordMismatch);
          setLoading(false);
          return;
        }
        if (password.length < 4) {
          toast.error(t.errorMinPassword);
          setLoading(false);
          return;
        }

        const { data: setData } = await supabase.functions.invoke("justificantes-operations", {
          body: { action: "setWorkerPassword", data: { workerNumber: workerNumber.trim(), password } }
        });

        if (!setData?.success) {
          toast.error(setData?.error || "Error");
          setLoading(false);
          return;
        }

        toast.success(t.successPasswordCreated);
      }

      // Login
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: { action: "loginWorker", data: { workerNumber: workerNumber.trim(), password } }
      });

      if (data?.success && data.worker) {
        const workerSession: WorkerSession = {
          id: data.worker.id,
          name: data.worker.name,
          workerNumber: data.worker.workerNumber,
          departmentId: data.worker.departmentId,
          departmentName: data.worker.departmentName,
          email: data.worker.email,
        };
        localStorage.setItem("justificantes_session", JSON.stringify(workerSession));
        setSession(workerSession);
      } else if (data?.locked) {
        toast.error("Cuenta bloqueada temporalmente. Espera 15 minutos.");
      } else if (data?.remainingAttempts !== undefined && data.remainingAttempts <= 2) {
        toast.error(`${t.errorIncorrectPassword}. Te quedan ${data.remainingAttempts} intento(s).`);
      } else {
        toast.error(data?.error || t.errorIncorrectPassword);
      }
    } catch (error) {
      console.error("Login error:", error);
      toast.error(t.errorIncorrectPassword);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("justificantes_session");
    setSession(null);
    setWorkerNumber("");
    setPassword("");
    setConfirmPassword("");
    setNeedsPassword(null);
    setWorkerName("");
    setHasVacationAccount(false);
    setWorkerIdForReset(null);
  };

  const handleForgotPassword = async () => {
    if (!hasVacationAccount || !workerIdForReset) {
      toast.error(t.noVacationAccount);
      return;
    }

    setSendingResetEmail(true);
    try {
      const { data } = await supabase.functions.invoke("worker-auth", {
        body: { 
          action: "requestPasswordReset", 
          workerId: workerIdForReset,
          siteUrl: window.location.origin
        }
      });
      if (data?.success) {
        toast.success(t.resetEmailSent);
      } else {
        toast.error(data?.error || t.resetEmailError);
      }
    } catch (error) {
      console.error("Error sending reset email:", error);
      toast.error(t.resetEmailError);
    } finally {
      setSendingResetEmail(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const newFiles: Array<{ file: File; preview: string | null; originalForCrop: string | null }> = [];
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
    
    Array.from(files).forEach((file) => {
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name}: El archivo es demasiado grande (máximo 10MB)`);
        return;
      }
      // Validate file type
      if (!allowedTypes.includes(file.type)) {
        toast.error(`${file.name}: Tipo de archivo no permitido. Usa imágenes o PDF.`);
        return;
      }
      
      newFiles.push({ file, preview: null, originalForCrop: null });
    });
    
    // Generate previews for images
    newFiles.forEach((item, index) => {
      if (item.file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          setSelectedFiles(prev => {
            const updated = [...prev];
            const targetIndex = prev.length - newFiles.length + index;
            if (updated[targetIndex]) {
              updated[targetIndex] = { ...updated[targetIndex], preview: dataUrl, originalForCrop: dataUrl };
            }
            return updated;
          });
        };
        reader.readAsDataURL(item.file);
      }
    });
    
    setSelectedFiles(prev => [...prev, ...newFiles]);
    
    // Reset input
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const openCropDialog = (index: number) => {
    setCropFileIndex(index);
    setShowCropDialog(true);
  };

  const handleCropComplete = (croppedBlob: Blob) => {
    if (cropFileIndex === null) return;
    
    const currentFile = selectedFiles[cropFileIndex];
    if (!currentFile) return;
    
    // Create a new File from the cropped Blob
    const fileName = currentFile.file.name?.replace(/\.[^/.]+$/, ".jpg") || "cropped-image.jpg";
    const croppedFile = Object.assign(croppedBlob, {
      name: fileName,
      lastModified: Date.now(),
    }) as unknown as globalThis.File;
    
    // Update preview with cropped image
    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedFiles(prev => {
        const updated = [...prev];
        updated[cropFileIndex] = {
          file: croppedFile,
          preview: reader.result as string,
          originalForCrop: currentFile.originalForCrop, // Keep original for re-cropping
        };
        return updated;
      });
    };
    reader.readAsDataURL(croppedBlob);
  };

  const handleUpload = async () => {
    if (!session || selectedFiles.length === 0 || !fechaInicio || !fechaFin) {
      toast.error("Completa todos los campos obligatorios");
      return;
    }

    setUploading(true);
    setUploadProgress({ current: 0, total: selectedFiles.length });

    try {
      // Step 1: Upload ALL files first
      const uploadedFiles: Array<{ url: string; nombre: string; tipo: string }> = [];

      for (let i = 0; i < selectedFiles.length; i++) {
        const { file } = selectedFiles[i];
        setUploadProgress({ current: i + 1, total: selectedFiles.length });

        // Get signed upload URL
        const { data: urlData } = await supabase.functions.invoke("justificantes-operations", {
          body: { 
            action: "getUploadUrl", 
            data: { workerId: session.id, fileName: file.name } 
          }
        });

        if (!urlData?.success || !urlData.signedUrl) {
          throw new Error(`No se pudo obtener URL de subida para ${file.name}`);
        }

        // Upload file
        const uploadResponse = await fetch(urlData.signedUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });

        if (!uploadResponse.ok) {
          throw new Error(`Error al subir ${file.name}`);
        }

        uploadedFiles.push({
          url: urlData.path,
          nombre: file.name,
          tipo: file.type || "application/octet-stream",
        });
      }

      if (uploadedFiles.length === 0) {
        throw new Error("No se pudo subir ningún archivo");
      }

      // Step 2: Submit ONE justificante with all files
      const primaryFile = uploadedFiles[0];
      const additionalFiles = uploadedFiles.slice(1);

      const { data: submitData } = await supabase.functions.invoke("justificantes-operations", {
        body: {
          action: "submitJustificante",
          data: {
            workerId: session.id,
            workerNumber: session.workerNumber,
            workerName: session.name,
            departmentId: session.departmentId,
            tipo,
            fechaInicio: format(fechaInicio, "yyyy-MM-dd"),
            fechaFin: format(fechaFin, "yyyy-MM-dd"),
            comentario,
            archivoUrl: primaryFile.url,
            archivoNombre: primaryFile.nombre,
            archivoTipo: primaryFile.tipo,
            archivosAdicionales: additionalFiles,
          }
        }
      });

      if (submitData?.success) {
        toast.success(t.successUploaded);
        // Reset form
        setTipo("medico");
        setFechaInicio(undefined);
        setFechaFin(undefined);
        setComentario("");
        setSelectedFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (cameraInputRef.current) cameraInputRef.current.value = "";
        loadJustificantes();
      } else {
        throw new Error(submitData?.error || "Error al enviar justificante");
      }
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || t.errorUploadFailed);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case "pendiente":
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30"><Clock className="w-3 h-3 mr-1" />{t.pending}</Badge>;
      case "gestionado":
        return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30"><CheckCircle className="w-3 h-3 mr-1" />{t.managed}</Badge>;
      case "rechazado":
        return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30"><XCircle className="w-3 h-3 mr-1" />{t.rejected}</Badge>;
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  // Login screen
  if (!session) {
    return (
      <div className="min-h-screen bg-background flex flex-col" dir={isRTL ? "rtl" : "ltr"}>
        <header className="p-4 flex justify-between items-center">
          <div />
          <div className="flex items-center gap-2">
            <LanguageSelector />
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <LogoLink to="/" className="h-16 w-16 mx-auto mb-4" />
              <CardTitle className="text-2xl">{t.title}</CardTitle>
              <CardDescription>{t.subtitle}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="workerNumber">{t.workerNumber}</Label>
                <div className="flex gap-2">
                  <Input
                    id="workerNumber"
                    value={workerNumber}
                    onChange={(e) => {
                      setWorkerNumber(e.target.value);
                      setNeedsPassword(null);
                      setWorkerName("");
                    }}
                    onBlur={checkWorker}
                    placeholder="12345"
                    className="flex-1"
                  />
                  {checkingWorker && <Loader2 className="h-5 w-5 animate-spin self-center" />}
                </div>
              </div>

              {workerName && (
                <div className="text-sm text-muted-foreground text-center py-2 px-3 bg-muted/50 rounded-lg">
                  {t.welcome}, <span className="font-medium text-foreground">{workerName}</span>
                </div>
              )}

              {needsPassword !== null && (
                <>
                  {/* Hint about same password */}
                  {!needsPassword && (
                    <p className="text-xs text-muted-foreground text-center bg-primary/5 p-2 rounded-md border border-primary/10">
                      💡 {t.samePasswordHint}
                    </p>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="password">
                      {needsPassword ? t.createPassword : t.password}
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>

                  {needsPassword && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="confirmPassword">{t.confirmPassword}</Label>
                        <Input
                          id="confirmPassword"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground text-center bg-primary/5 p-2 rounded-md border border-primary/10">
                        💡 {t.samePasswordHint}
                      </p>
                    </>
                  )}

                  <Button
                    className="w-full"
                    onClick={handleLogin}
                    disabled={loading || !password}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {needsPassword ? t.createAndLogin : t.login}
                  </Button>

                  {/* Forgot password button - only show when logging in (not creating password) */}
                  {!needsPassword && hasVacationAccount && (
                    <Button
                      type="button"
                      variant="link"
                      className="w-full text-sm"
                      onClick={handleForgotPassword}
                      disabled={sendingResetEmail}
                    >
                      {sendingResetEmail ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      {sendingResetEmail ? t.sendingResetEmail : t.forgotPassword}
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Main app screen (logged in)
  return (
    <div className="min-h-screen bg-background flex flex-col" dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <header className="glass-header">
        <div className="p-3 sm:p-4">
          {/* Mobile: stacked layout, Desktop: single row */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
            {/* Logo and title */}
            <div className="flex items-center gap-3">
              <LogoLink to="/justificantes" className="h-8 w-8 sm:h-10 sm:w-10" />
              <div className="min-w-0 flex-1">
                <h1 className="font-semibold text-base sm:text-lg truncate">{t.title}</h1>
                <p className="text-xs text-muted-foreground truncate">{session.name} • {session.departmentName}</p>
              </div>
            </div>
            {/* Actions */}
            <div className="flex items-center gap-1.5 sm:gap-2 justify-end">
              <LanguageSelector />
              <ThemeToggle />
              <Button variant="ghost" size="icon" onClick={handleLogout} className="h-9 w-9">
                <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 space-y-6 max-w-2xl mx-auto w-full">
        {/* Upload Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              {t.uploadTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Tipo */}
            <div className="space-y-2">
              <Label>{t.type}</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="medico">{t.typeMedico}</SelectItem>
                  <SelectItem value="personal">{t.typePersonal}</SelectItem>
                  <SelectItem value="otro">{t.typeOtro}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Fechas */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t.dateStart}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !fechaInicio && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {fechaInicio ? format(fechaInicio, "dd/MM/yyyy") : "Seleccionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={fechaInicio} onSelect={setFechaInicio} locale={locale} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>{t.dateEnd}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !fechaFin && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {fechaFin ? format(fechaFin, "dd/MM/yyyy") : "Seleccionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={fechaFin} onSelect={setFechaFin} locale={locale} disabled={(date) => fechaInicio ? date < fechaInicio : false} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Comentario */}
            <div className="space-y-2">
              <Label>{t.comment}</Label>
              <Textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                rows={2}
              />
            </div>

            {/* File selection */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => fileInputRef.current?.click()}>
                  <File className="h-6 w-6" />
                  <span className="text-xs">{t.selectFile}</span>
                </Button>
                <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => cameraInputRef.current?.click()}>
                  <Camera className="h-6 w-6" />
                  <span className="text-xs">{t.takePhoto}</span>
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,image/*,application/pdf"
                onChange={handleFileSelect}
                className="hidden"
                multiple
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Selected files list */}
              {selectedFiles.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{selectedFiles.length} archivo(s) seleccionado(s)</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedFiles([])}
                      className="text-destructive hover:text-destructive"
                    >
                      Eliminar todos
                    </Button>
                  </div>
                  
                  <div className="grid gap-3">
                    {selectedFiles.map((item, index) => (
                      <div key={index} className="space-y-2">
                        {/* Image preview */}
                        {item.preview && (
                          <div className="relative rounded-lg overflow-hidden border bg-muted/30">
                            <img 
                              src={item.preview} 
                              alt={`Preview ${index + 1}`} 
                              className="w-full max-h-48 object-contain"
                            />
                            <div className="absolute top-2 right-2 flex gap-1">
                              {item.originalForCrop && (
                                <Button
                                  variant="secondary"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => openCropDialog(index)}
                                  title={t.editImage}
                                >
                                  <Crop className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="destructive"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => removeFile(index)}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                        {/* File info (for PDFs or if no preview) */}
                        {!item.preview && (
                          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                            {item.file.type?.startsWith("image/") ? (
                              <Image className="h-5 w-5 text-primary" />
                            ) : (
                              <FileText className="h-5 w-5 text-primary" />
                            )}
                            <span className="text-sm truncate flex-1">{item.file.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {(item.file.size / 1024).toFixed(0)} KB
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => removeFile(index)}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Submit */}
            <Button
              className="w-full"
              size="lg"
              onClick={handleUpload}
              disabled={uploading || selectedFiles.length === 0 || !fechaInicio || !fechaFin}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {uploadProgress 
                    ? `${uploadProgress.current}/${uploadProgress.total} - ${t.uploading}`
                    : t.uploading
                  }
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  {selectedFiles.length > 1 
                    ? `${t.upload} (${selectedFiles.length})`
                    : t.upload
                  }
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* My Justificantes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t.myJustificantes}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingJustificantes ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : justificantes.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">{t.noJustificantes}</p>
            ) : (
              <div className="space-y-3">
                {justificantes.map((j) => (
                  <div key={j.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className="capitalize">{j.tipo}</Badge>
                        {getStatusBadge(j.estado)}
                      </div>
                      <p className="text-sm font-medium">
                        {format(new Date(j.fecha_inicio), "dd/MM/yyyy")}
                        {j.fecha_inicio !== j.fecha_fin && ` - ${format(new Date(j.fecha_fin), "dd/MM/yyyy")}`}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{j.archivo_nombre}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(j.created_at), "dd/MM")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Image Crop Dialog */}
      {cropFileIndex !== null && selectedFiles[cropFileIndex]?.originalForCrop && (
        <ImageCropDialog
          open={showCropDialog}
          onClose={() => {
            setShowCropDialog(false);
            setCropFileIndex(null);
          }}
          imageSrc={selectedFiles[cropFileIndex].originalForCrop!}
          onCropComplete={handleCropComplete}
          translations={{
            title: t.cropTitle,
            zoom: t.cropZoom,
            rotate: t.cropRotate,
            confirm: t.cropConfirm,
            cancel: t.cropCancel,
          }}
        />
      )}
    </div>
  );
};

const JustificantesForm = () => (
  <LanguageProvider>
    <JustificantesFormContent />
  </LanguageProvider>
);

export default JustificantesForm;
