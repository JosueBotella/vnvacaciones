import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, Camera, FileText, CheckCircle, Loader2, Image, File, Crop, X, AlertTriangle } from "lucide-react";
import { ImageCropDialog } from "@/components/ImageCropDialog";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { LogoLink } from "@/components/LogoLink";

type JustificanteInfo = {
  id: string;
  tipo: string;
  fecha_inicio: string;
  fecha_fin: string;
  worker_name: string;
  worker_number: string;
  worker_id: string;
  mensaje_gestor: string;
};

const JustificantesAdicional = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  
  const [loading, setLoading] = useState(true);
  const [justificanteInfo, setJustificanteInfo] = useState<JustificanteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Array<{ file: File; preview: string | null; originalForCrop: string | null }>>([]);
  const [showCropDialog, setShowCropDialog] = useState(false);
  const [cropFileIndex, setCropFileIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [uploadComplete, setUploadComplete] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (token) {
      verifyToken();
    } else {
      setError("Token no válido");
      setLoading(false);
    }
  }, [token]);

  const verifyToken = async () => {
    try {
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: { action: "verifyAdditionalDocsToken", data: { token } }
      });

      if (data?.success && data.justificante) {
        setJustificanteInfo(data.justificante);
      } else {
        setError(data?.error || "Token no válido o expirado");
      }
    } catch (err) {
      console.error("Error verifying token:", err);
      setError("Error al verificar el token");
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const newFiles: Array<{ file: File; preview: string | null; originalForCrop: string | null }> = [];
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
    
    Array.from(files).forEach((file) => {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name}: El archivo es demasiado grande (máximo 10MB)`);
        return;
      }
      if (!allowedTypes.includes(file.type)) {
        toast.error(`${file.name}: Tipo de archivo no permitido. Usa imágenes o PDF.`);
        return;
      }
      
      newFiles.push({ file, preview: null, originalForCrop: null });
    });
    
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
    
    const fileName = currentFile.file.name?.replace(/\.[^/.]+$/, ".jpg") || "cropped-image.jpg";
    const croppedFile = Object.assign(croppedBlob, {
      name: fileName,
      lastModified: Date.now(),
    }) as unknown as globalThis.File;
    
    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedFiles(prev => {
        const updated = [...prev];
        updated[cropFileIndex] = {
          file: croppedFile,
          preview: reader.result as string,
          originalForCrop: currentFile.originalForCrop,
        };
        return updated;
      });
    };
    reader.readAsDataURL(croppedBlob);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0 || !justificanteInfo || !token) return;

    setUploading(true);
    setUploadProgress({ current: 0, total: selectedFiles.length });

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        setUploadProgress({ current: i + 1, total: selectedFiles.length });
        const fileItem = selectedFiles[i];
        const file = fileItem.file;

        // Get signed upload URL
        const { data: urlData } = await supabase.functions.invoke("justificantes-operations", {
          body: {
            action: "getUploadUrl",
            data: {
              workerId: justificanteInfo.worker_id,
              fileName: file.name,
              contentType: file.type,
            }
          }
        });

        if (!urlData?.success || !urlData.signedUrl) {
          throw new Error("Error al obtener URL de subida");
        }

        // Upload file directly
        const uploadResponse = await fetch(urlData.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!uploadResponse.ok) {
          throw new Error("Error al subir archivo");
        }

        // Submit additional documentation - use 'path' instead of 'filePath'
        const { data: submitData } = await supabase.functions.invoke("justificantes-operations", {
          body: {
            action: "submitAdditionalDocumentation",
            data: {
              token,
              archivoUrl: urlData.path,
              archivoNombre: file.name,
              archivoTipo: file.type,
            }
          }
        });

        if (!submitData?.success) {
          throw new Error(submitData?.error || "Error al registrar documentación");
        }
      }

      setUploadComplete(true);
      toast.success("Documentación enviada correctamente");
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Error al subir la documentación");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Error</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (uploadComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">¡Documentación enviada!</h2>
            <p className="text-muted-foreground">
              Tu documentación adicional ha sido enviada correctamente. 
              El departamento de RRHH la revisará pronto.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-center pt-4">
          <LogoLink to="/" className="h-12" />
        </div>

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-center">Documentación Adicional</CardTitle>
            <CardDescription className="text-center">
              RRHH ha solicitado documentación adicional para tu justificante
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {justificanteInfo && (
              <>
                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Trabajador</span>
                    <span className="font-medium">{justificanteInfo.worker_name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Tipo</span>
                    <Badge variant="outline" className="capitalize">{justificanteInfo.tipo}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Fechas</span>
                    <span className="font-medium">
                      {format(new Date(justificanteInfo.fecha_inicio), "dd/MM/yyyy", { locale: es })}
                      {justificanteInfo.fecha_inicio !== justificanteInfo.fecha_fin && (
                        <> - {format(new Date(justificanteInfo.fecha_fin), "dd/MM/yyyy", { locale: es })}</>
                      )}
                    </span>
                  </div>
                </div>

                {justificanteInfo.mensaje_gestor && (
                  <div className="bg-amber-50 dark:bg-amber-950/30 border-l-4 border-amber-500 rounded-r-lg p-4">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">
                      Mensaje del gestor:
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-300 whitespace-pre-wrap">
                      {justificanteInfo.mensaje_gestor}
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Upload Card */}
        <Card>
          <CardHeader>
            <CardTitle>Subir Documentación</CardTitle>
            <CardDescription>
              Selecciona o captura los documentos solicitados
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Hidden file inputs */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />

            {/* Upload buttons */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-24 flex-col gap-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-6 w-6" />
                <span className="text-sm">Seleccionar archivos</span>
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-24 flex-col gap-2"
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera className="h-6 w-6" />
                <span className="text-sm">Hacer foto</span>
              </Button>
            </div>

            {/* Selected files preview */}
            {selectedFiles.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {selectedFiles.length} archivo{selectedFiles.length !== 1 ? "s" : ""} seleccionado{selectedFiles.length !== 1 ? "s" : ""}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedFiles([])}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Quitar todos
                  </Button>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {selectedFiles.map((item, index) => (
                    <div
                      key={index}
                      className="relative group border rounded-lg overflow-hidden bg-muted/30 aspect-[4/3] flex items-center justify-center"
                    >
                      {item.file.type.startsWith("image/") ? (
                        item.preview ? (
                          <img
                            src={item.preview}
                            alt={item.file.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Image className="h-8 w-8 text-muted-foreground" />
                        )
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <FileText className="h-8 w-8 text-red-500" />
                          <span className="text-xs text-muted-foreground truncate max-w-full px-2">
                            {item.file.name}
                          </span>
                        </div>
                      )}

                      {/* Action buttons overlay */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        {item.file.type.startsWith("image/") && item.originalForCrop && (
                          <Button
                            variant="secondary"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openCropDialog(index)}
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
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload progress */}
            {uploadProgress && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subiendo archivos...</span>
                  <span>{uploadProgress.current} / {uploadProgress.total}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Submit button */}
            <Button
              className="w-full"
              size="lg"
              onClick={handleUpload}
              disabled={selectedFiles.length === 0 || uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Subiendo...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Enviar Documentación
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Crop Dialog */}
      {showCropDialog && cropFileIndex !== null && selectedFiles[cropFileIndex]?.originalForCrop && (
        <ImageCropDialog
          open={showCropDialog}
          onClose={() => setShowCropDialog(false)}
          imageSrc={selectedFiles[cropFileIndex].originalForCrop!}
          onCropComplete={handleCropComplete}
          translations={{
            title: "Ajustar imagen",
            zoom: "Zoom",
            rotate: "Rotar",
            confirm: "Aplicar",
            cancel: "Cancelar",
          }}
        />
      )}
    </div>
  );
};

export default JustificantesAdicional;
