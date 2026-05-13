import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, User, FileText, MessageSquarePlus, Send, ExternalLink, Download, CheckCircle, XCircle, Clock, AlertCircle, ImageIcon } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

interface DocumentoHistorial {
  id: string;
  tipo_mensaje: "solicitud_docs" | "respuesta_docs";
  mensaje: string | null;
  archivo_url: string | null;
  archivo_nombre: string | null;
  archivo_tipo: string | null;
  actor_nombre: string;
  actor_rol: string;
  created_at: string;
}

interface GestionHistorial {
  id: string;
  accion: string;
  comentario_gestor: string | null;
  gestionado_por_nombre: string;
  created_at: string;
}

interface JustificanteData {
  id: string;
  worker_id: string;
  worker_name: string;
  worker_number: string;
  tipo: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: string;
  archivo_url: string;
  archivo_nombre: string;
  archivo_tipo: string;
  comentario_empleado: string | null;
  archivos_adicionales?: Array<{ url: string; nombre: string; tipo: string }> | null;
  created_at: string;
  department_name?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  justificante: JustificanteData | null;
  sessionToken: string;
  userName: string;
  userRole: "admin" | "rrhh";
  onStatusChange?: () => void;
}

// Cache for file URLs
const fileUrlCache: Record<string, { url: string; expires: number }> = {};

export const JustificanteHistorialChat = ({ 
  open, 
  onOpenChange, 
  justificante, 
  sessionToken,
  userName,
  userRole,
  onStatusChange
}: Props) => {
  const [loading, setLoading] = useState(true);
  const [documentos, setDocumentos] = useState<DocumentoHistorial[]>([]);
  const [gestiones, setGestiones] = useState<GestionHistorial[]>([]);
  const [showRequestInput, setShowRequestInput] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && justificante) {
      loadHistorial();
    }
  }, [open, justificante]);

  // Scroll to bottom when timeline updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [documentos, gestiones, loading]);

  const loadHistorial = async () => {
    if (!justificante) return;
    
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: {
          action: "getFullHistorial",
          data: {
            sessionToken,
            justificanteId: justificante.id
          }
        }
      });

      if (data?.success) {
        setDocumentos(data.documentos || []);
        setGestiones(data.gestiones || []);
        
        // Pre-load all file URLs
        await preloadFileUrls(justificante, data.documentos || []);
      }
    } catch (error) {
      console.error("Error loading historial:", error);
    } finally {
      setLoading(false);
    }
  };

  const preloadFileUrls = async (j: JustificanteData, docs: DocumentoHistorial[]) => {
    setLoadingFiles(true);
    const filePaths: string[] = [];
    
    // Original file
    if (j.archivo_url) filePaths.push(j.archivo_url);
    
    // Additional files from the same justificante
    if (j.archivos_adicionales && Array.isArray(j.archivos_adicionales)) {
      j.archivos_adicionales.forEach((f) => {
        if (f.url) filePaths.push(f.url);
      });
    }
    
    // Documentation files
    docs.forEach(d => {
      if (d.archivo_url) filePaths.push(d.archivo_url);
    });

    const urls: Record<string, string> = {};
    
    await Promise.all(filePaths.map(async (filePath) => {
      // Check cache first
      const cached = fileUrlCache[filePath];
      if (cached && cached.expires > Date.now()) {
        urls[filePath] = cached.url;
        return;
      }

      try {
        const { data } = await supabase.functions.invoke("justificantes-operations", {
          body: {
            action: "getFileUrl",
            data: { sessionToken, filePath }
          }
        });

        if (data?.success && data.url) {
          urls[filePath] = data.url;
          // Cache for 45 minutes
          fileUrlCache[filePath] = { url: data.url, expires: Date.now() + 45 * 60 * 1000 };
        }
      } catch (error) {
        console.error("Error loading file URL:", filePath, error);
      }
    }));

    setFileUrls(urls);
    setLoadingFiles(false);
  };

  const handleRequestDocs = async () => {
    if (!justificante || !requestMessage.trim()) return;

    setSubmitting(true);
    try {
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: {
          action: "requestDocumentation",
          data: {
            sessionToken,
            justificanteId: justificante.id,
            mensaje: requestMessage.trim(),
            gestionadoPor: userName
          }
        }
      });

      if (data?.success) {
        toast.success("Solicitud de documentación enviada");
        setShowRequestInput(false);
        setRequestMessage("");
        loadHistorial();
        onStatusChange?.();
      } else {
        toast.error(data?.error || "Error al solicitar documentación");
      }
    } catch (error) {
      toast.error("Error al solicitar documentación");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadAll = async () => {
    if (!justificante) return;
    
    const allFiles: { url: string; name: string }[] = [];
    
    // Add original file
    if (justificante.archivo_url && fileUrls[justificante.archivo_url]) {
      allFiles.push({ 
        url: fileUrls[justificante.archivo_url], 
        name: justificante.archivo_nombre || "justificante_original" 
      });
    }
    
    // Add additional files
    if (justificante.archivos_adicionales && Array.isArray(justificante.archivos_adicionales)) {
      justificante.archivos_adicionales.forEach((f, i) => {
        if (f.url && fileUrls[f.url]) {
          allFiles.push({
            url: fileUrls[f.url],
            name: f.nombre || `archivo_adicional_${i + 1}`
          });
        }
      });
    }
    
    // Add all document files
    documentos.forEach((doc, index) => {
      if (doc.archivo_url && fileUrls[doc.archivo_url]) {
        allFiles.push({ 
          url: fileUrls[doc.archivo_url], 
          name: doc.archivo_nombre || `documento_${index + 1}` 
        });
      }
    });
    
    if (allFiles.length === 0) {
      toast.error("No hay documentos para descargar");
      return;
    }
    
    // Download all files
    toast.info(`Descargando ${allFiles.length} archivo(s)...`);
    
    for (const file of allFiles) {
      try {
        const response = await fetch(file.url);
        const blob = await response.blob();
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        // Small delay between downloads
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        console.error("Error downloading file:", error);
      }
    }
    
    toast.success("Descarga completada");
  };

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case "pendiente":
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30"><Clock className="h-3 w-3 mr-1" />Pendiente</Badge>;
      case "pendiente_docs":
        return <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30"><AlertCircle className="h-3 w-3 mr-1" />Doc. solicitada</Badge>;
      case "gestionado":
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30"><CheckCircle className="h-3 w-3 mr-1" />Gestionado</Badge>;
      case "rechazado":
        return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30"><XCircle className="h-3 w-3 mr-1" />Rechazado</Badge>;
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  const isImageFile = (tipo: string) => {
    return tipo?.startsWith("image/") || false;
  };

  // Combine all events into a timeline - avoid duplicates from gestiones and documentos
  const buildTimeline = () => {
    if (!justificante) return [];

    const events: {
      id: string;
      type: "original" | "gestion" | "solicitud" | "respuesta";
      date: string;
      actor: string;
      actorRole: string;
      content: string | null;
      file?: { url: string; name: string; tipo: string };
      extraFiles?: Array<{ url: string; name: string; tipo: string }>;
      accion?: string;
      isWorker: boolean;
    }[] = [];

    // Original submission
    events.push({
      id: "original",
      type: "original",
      date: justificante.created_at,
      actor: justificante.worker_name,
      actorRole: "trabajador",
      content: justificante.comentario_empleado,
      file: {
        url: justificante.archivo_url,
        name: justificante.archivo_nombre,
        tipo: justificante.archivo_tipo
      },
      extraFiles: justificante.archivos_adicionales?.map(f => ({
        url: f.url,
        name: f.nombre,
        tipo: f.tipo
      })) || [],
      isWorker: true
    });

    // Gestiones (status changes) - exclude pendiente_docs and pendiente (auto-generated)
    gestiones.forEach(g => {
      // Skip pendiente_docs gestiones (duplicated in documentos table)
      // Skip pendiente gestiones (auto-generated when worker submits docs, no action taken)
      if (g.accion === "pendiente_docs" || g.accion === "pendiente") return;
      
      events.push({
        id: `gestion-${g.id}`,
        type: "gestion",
        date: g.created_at,
        actor: g.gestionado_por_nombre,
        actorRole: "gestor",
        content: g.comentario_gestor,
        accion: g.accion,
        isWorker: false
      });
    });

    // Documentos (requests and responses)
    documentos.forEach(d => {
      events.push({
        id: `doc-${d.id}`,
        type: d.tipo_mensaje === "solicitud_docs" ? "solicitud" : "respuesta",
        date: d.created_at,
        actor: d.actor_nombre,
        actorRole: d.actor_rol,
        content: d.mensaje,
        file: d.archivo_url ? {
          url: d.archivo_url,
          name: d.archivo_nombre || "Archivo",
          tipo: d.archivo_tipo || ""
        } : undefined,
        isWorker: d.actor_rol === "trabajador"
      });
    });

    // Sort by date
    return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const timeline = buildTimeline();
  const canRequestDocs = justificante && (justificante.estado === "pendiente" || justificante.estado === "pendiente_docs");

  if (!justificante) return null;

  const salixUrl = `https://salix.verdnatura.es/#!/worker/${justificante.worker_number}/summary`;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
          {/* Header */}
          <DialogHeader className="px-6 pt-5 pb-4 border-b bg-muted/30 pr-14">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap mb-1">
                  <DialogTitle className="text-lg font-semibold">{justificante.worker_name}</DialogTitle>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  {getStatusBadge(justificante.estado)}
                </div>
                <DialogDescription className="flex items-center gap-2 text-sm flex-wrap mt-1">
                  <a 
                    href={salixUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  >
                    #{justificante.worker_number}
                  </a>
                  <span>·</span>
                  <span className="capitalize">{justificante.tipo}</span>
                  <span>·</span>
                  <span>
                    {format(new Date(justificante.fecha_inicio), "dd/MM/yyyy", { locale: es })}
                    {justificante.fecha_inicio !== justificante.fecha_fin && 
                      ` - ${format(new Date(justificante.fecha_fin), "dd/MM/yyyy", { locale: es })}`}
                  </span>
                </DialogDescription>
              </div>
            </div>
            
            {/* Download all button */}
            <Button 
              variant="outline" 
              size="sm" 
              className="absolute top-4 right-14 gap-1.5"
              onClick={handleDownloadAll}
              disabled={loadingFiles}
            >
              <Download className="h-4 w-4" />
              Descargar todo
            </Button>
          </DialogHeader>

          {/* Chat Area */}
          {loading ? (
            <div className="flex items-center justify-center py-16 flex-1">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <ScrollArea className="flex-1 h-[55vh]" ref={scrollRef}>
              <div className="p-4 space-y-3 bg-muted/20">
                {timeline.map((event) => (
                  <div 
                    key={event.id} 
                    className={`flex ${event.isWorker ? "justify-start" : "justify-end"}`}
                  >
                    <div 
                      className={`max-w-[80%] rounded-2xl p-3 shadow-sm ${
                        event.isWorker 
                          ? "bg-background rounded-tl-sm" 
                          : event.type === "gestion"
                            ? event.accion === "gestionado" 
                              ? "bg-green-500/10 border border-green-500/20 rounded-tr-sm" 
                              : event.accion === "rechazado"
                                ? "bg-red-500/10 border border-red-500/20 rounded-tr-sm"
                                : "bg-orange-500/10 border border-orange-500/20 rounded-tr-sm"
                            : event.type === "solicitud"
                              ? "bg-orange-500/10 border border-orange-500/20 rounded-tr-sm"
                              : "bg-primary/10 border border-primary/20 rounded-tr-sm"
                      }`}
                    >
                      {/* Actor name and time */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-medium ${
                          event.isWorker ? "text-primary" : "text-muted-foreground"
                        }`}>
                          {event.actor}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(event.date), "dd/MM/yy HH:mm", { locale: es })}
                        </span>
                      </div>

                      {/* Event content */}
                      {event.type === "original" && (
                        <p className="text-xs text-muted-foreground mb-1">📤 Justificante enviado</p>
                      )}

                      {event.type === "gestion" && (
                        <p className={`text-sm font-medium mb-1 ${
                          event.accion === "gestionado" ? "text-green-600" 
                          : event.accion === "rechazado" ? "text-red-600"
                          : "text-orange-600"
                        }`}>
                          {event.accion === "gestionado" && "✓ Justificante gestionado"}
                          {event.accion === "rechazado" && "✗ Justificante rechazado"}
                          {event.accion === "pendiente_docs" && "📋 Documentación solicitada"}
                          {event.accion === "pendiente" && "📎 Documentación recibida"}
                        </p>
                      )}

                      {event.type === "solicitud" && (
                        <p className="text-sm font-medium text-orange-600 mb-1">
                          📋 Documentación adicional solicitada
                        </p>
                      )}

                      {event.type === "respuesta" && (
                        <p className="text-sm font-medium text-primary mb-1">
                          📎 Documentación adicional aportada
                        </p>
                      )}

                      {event.content && (
                        <p className="text-sm">{event.content}</p>
                      )}

                      {/* File preview - inline for images */}
                      {event.file && (
                        <div className="mt-2">
                          {isImageFile(event.file.tipo) ? (
                            <div className="relative">
                              {loadingFiles ? (
                                <div className="h-32 bg-muted rounded-lg flex items-center justify-center">
                                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                </div>
                              ) : fileUrls[event.file.url] ? (
                                <img 
                                  src={fileUrls[event.file.url]} 
                                  alt={event.file.name}
                                  className="rounded-lg max-h-48 w-auto cursor-pointer hover:opacity-90 transition-opacity"
                                  onClick={() => setEnlargedImage(fileUrls[event.file!.url])}
                                />
                              ) : (
                                <div className="h-32 bg-muted rounded-lg flex items-center justify-center">
                                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-xs"
                              onClick={() => {
                                const url = fileUrls[event.file!.url];
                                if (url) window.open(url, "_blank");
                              }}
                              disabled={!fileUrls[event.file.url]}
                            >
                              <FileText className="h-3.5 w-3.5" />
                              <span className="truncate max-w-[150px]">{event.file.name}</span>
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      )}

                      {/* Extra files (archivos_adicionales) */}
                      {event.extraFiles && event.extraFiles.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {event.extraFiles.map((ef, efIdx) => (
                            <div key={efIdx}>
                              {isImageFile(ef.tipo) ? (
                                <div className="relative">
                                  {loadingFiles ? (
                                    <div className="h-32 bg-muted rounded-lg flex items-center justify-center">
                                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                    </div>
                                  ) : fileUrls[ef.url] ? (
                                    <img 
                                      src={fileUrls[ef.url]} 
                                      alt={ef.name}
                                      className="rounded-lg max-h-48 w-auto cursor-pointer hover:opacity-90 transition-opacity"
                                      onClick={() => setEnlargedImage(fileUrls[ef.url])}
                                    />
                                  ) : (
                                    <div className="h-32 bg-muted rounded-lg flex items-center justify-center">
                                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-1.5 text-xs"
                                  onClick={() => {
                                    const url = fileUrls[ef.url];
                                    if (url) window.open(url, "_blank");
                                  }}
                                  disabled={!fileUrls[ef.url]}
                                >
                                  <FileText className="h-3.5 w-3.5" />
                                  <span className="truncate max-w-[150px]">{ef.name}</span>
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          {/* Request more docs input */}
          {canRequestDocs && (
            <div className="border-t p-4 bg-background">
              {showRequestInput ? (
                <div className="space-y-3">
                  <Textarea
                    value={requestMessage}
                    onChange={(e) => setRequestMessage(e.target.value)}
                    placeholder="Describe qué documentación adicional necesitas..."
                    className="min-h-[80px] resize-none"
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => { setShowRequestInput(false); setRequestMessage(""); }}>
                      Cancelar
                    </Button>
                    <Button size="sm" onClick={handleRequestDocs} disabled={!requestMessage.trim() || submitting}>
                      {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                      Enviar solicitud
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" className="w-full gap-2" onClick={() => setShowRequestInput(true)}>
                  <MessageSquarePlus className="h-4 w-4" />
                  Solicitar más documentación
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Enlarged image viewer */}
      <Dialog open={!!enlargedImage} onOpenChange={() => setEnlargedImage(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-2">
          {enlargedImage && (
            <div className="flex flex-col gap-2">
              <img 
                src={enlargedImage} 
                alt="Documento ampliado" 
                className="max-w-full max-h-[80vh] object-contain mx-auto rounded-lg" 
              />
              <div className="flex justify-center gap-2">
                <Button variant="outline" size="sm" onClick={() => window.open(enlargedImage, "_blank")}>
                  <Download className="h-4 w-4 mr-2" />
                  Descargar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
