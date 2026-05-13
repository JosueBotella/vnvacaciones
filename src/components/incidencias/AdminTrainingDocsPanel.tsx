import { useState, useEffect, useCallback, useRef } from "react";
import { FileText, Upload, Trash2, Loader2, ToggleLeft, ToggleRight, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TrainingDoc {
  id: string;
  filename: string;
  file_size: number;
  document_type: string;
  description: string;
  active: boolean;
  created_at: string;
  uploaded_by: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  amonestacion: "Amonestación",
  sancion_leve: "Sanción leve",
  sancion_grave: "Sanción grave",
  sancion_muy_grave: "Sanción muy grave",
  otro: "Otro",
};

interface Props {
  sessionToken: string;
}

export function AdminTrainingDocsPanel({ sessionToken }: Props) {
  const [docs, setDocs] = useState<TrainingDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [docType, setDocType] = useState("otro");
  const [description, setDescription] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await supabase.functions.invoke("training-docs-operations", {
        body: { action: "listTrainingDocuments", sessionToken },
      });
      setDocs(data?.documents || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Solo se aceptan archivos PDF");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("El archivo es demasiado grande (máx 5MB)");
      return;
    }
    if (docs.length >= 10) {
      toast.error("Máximo 10 documentos de entrenamiento");
      return;
    }

    setUploading(true);
    setUploadProgress(10);

    try {
      // Read file as base64
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      setUploadProgress(30);

      const { data } = await supabase.functions.invoke("training-docs-operations", {
        body: {
          action: "uploadTrainingDocument",
          sessionToken,
          fileBase64: base64,
          fileName: file.name,
          fileSize: file.size,
          documentType: docType,
          description,
        },
      });

      setUploadProgress(90);

      if (data?.success) {
        toast.success(
          data.textExtracted
            ? "Documento subido y texto extraído correctamente"
            : "Documento subido (no se pudo extraer texto)"
        );
        setDescription("");
        setDocType("otro");
        load();
      } else {
        toast.error(data?.error || "Error al subir");
      }
    } catch {
      toast.error("Error al subir el documento");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (docId: string) => {
    try {
      const { data } = await supabase.functions.invoke("training-docs-operations", {
        body: { action: "deleteTrainingDocument", sessionToken, documentId: docId },
      });
      if (data?.success) {
        setDocs(prev => prev.filter(d => d.id !== docId));
        toast.success("Documento eliminado");
      } else {
        toast.error(data?.error || "Error");
      }
    } catch {
      toast.error("Error al eliminar");
    }
  };

  const handleToggle = async (docId: string, active: boolean) => {
    try {
      const { data } = await supabase.functions.invoke("training-docs-operations", {
        body: { action: "toggleTrainingDocument", sessionToken, documentId: docId, active },
      });
      if (data?.success) {
        setDocs(prev => prev.map(d => d.id === docId ? { ...d, active } : d));
      }
    } catch {
      toast.error("Error al cambiar estado");
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const activeCount = docs.filter(d => d.active).length;

  if (loading) {
    return (
      <Card className="rounded-2xl border-border/50">
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div>
        <h2 className="text-lg font-semibold text-foreground">Documentos de referencia para la IA</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Sube sanciones reales redactadas por RRHH para que la IA imite su estilo al generar documentos legales
        </p>
      </div>

      <Card className="rounded-2xl border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Documentos de entrenamiento
            </span>
            <Badge variant="secondary" className="text-[10px] px-2 py-0">
              {activeCount} activos / {docs.length} total
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Upload section */}
          <div className="space-y-3 p-3 rounded-xl bg-muted/30 border border-border/30">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5" />
              Máximo 10 documentos · Solo PDF · Máx 5MB por archivo
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Tipo de documento</label>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger className="h-9 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Descripción (opcional)</label>
                <Input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="h-9 rounded-xl"
                  placeholder="Ej: Sanción por retraso reiterado"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                }}
              />
              <Button
                size="sm"
                className="h-9 rounded-xl gap-1.5 flex-1"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || docs.length >= 10}
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {uploading ? "Subiendo y extrayendo texto..." : "Subir PDF"}
              </Button>
            </div>
            {uploading && (
              <Progress value={uploadProgress} className="h-1.5" />
            )}
          </div>

          {/* Document list */}
          {docs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No hay documentos de referencia. Sube PDFs de sanciones reales para mejorar la calidad de la IA.
            </p>
          ) : (
            <div className="space-y-2">
              {docs.map(doc => (
                <div
                  key={doc.id}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 border transition-colors ${
                    doc.active
                      ? "bg-primary/5 border-primary/20"
                      : "bg-muted/20 border-border/30 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">{doc.filename}</span>
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 shrink-0">
                          {DOC_TYPE_LABELS[doc.document_type] || doc.document_type}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span>{formatSize(doc.file_size)}</span>
                        <span>·</span>
                        <span>{new Date(doc.created_at).toLocaleDateString("es-ES")}</span>
                        {doc.description && (
                          <>
                            <span>·</span>
                            <span className="truncate">{doc.description}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <Switch
                      checked={doc.active}
                      onCheckedChange={v => handleToggle(doc.id, v)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => handleDelete(doc.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground">
            La IA usará los documentos activos como referencia de estilo al generar documentos legales. El texto se extrae automáticamente del PDF.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
