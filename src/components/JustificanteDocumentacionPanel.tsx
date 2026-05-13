import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Loader2, MessageSquare, FileText, Image, User, ChevronRight, MessageSquarePlus, Send, Download, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface JustificanteWithDocs {
  id: string;
  worker_name: string;
  worker_number: string;
  tipo: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: string;
  archivo_url: string;
  archivo_nombre: string;
  archivo_tipo: string;
  created_at: string;
  archivos_adicionales?: Array<{ url: string; nombre: string; tipo: string }> | null;
  department_name?: string;
  documentos: DocumentoHistorial[];
}

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

interface Props {
  sessionToken: string;
  userRole: "admin" | "rrhh";
  userName: string;
}

export const JustificanteDocumentacionPanel = ({ sessionToken, userRole, userName }: Props) => {
  const [loading, setLoading] = useState(true);
  const [justificantes, setJustificantes] = useState<JustificanteWithDocs[]>([]);
  const [selectedJustificante, setSelectedJustificante] = useState<JustificanteWithDocs | null>(null);
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  useEffect(() => {
    loadJustificantes();
  }, []);

  const loadJustificantes = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: {
          action: "getJustificantesWithDocs",
          sessionToken
        }
      });

      if (data?.success) {
        setJustificantes(data.justificantes || []);
      }
    } catch (error) {
      console.error("Error loading justificantes with docs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestMoreDocs = async () => {
    if (!selectedJustificante || !requestMessage.trim()) return;

    setSubmitting(true);
    try {
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: {
          action: "requestDocumentation",
          sessionToken,
          data: {
            justificanteId: selectedJustificante.id,
            mensaje: requestMessage.trim(),
            gestionadoPor: userName
          }
        }
      });

      if (data?.success) {
        toast.success("Solicitud de documentación enviada");
        setShowRequestDialog(false);
        setRequestMessage("");
        loadJustificantes();
      } else {
        toast.error(data?.error || "Error al solicitar documentación");
      }
    } catch (error) {
      toast.error("Error al solicitar documentación");
    } finally {
      setSubmitting(false);
    }
  };

  const openFileViewer = async (filePath: string) => {
    try {
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: {
          action: "getFileUrl",
          sessionToken,
          data: { filePath }
        }
      });

      if (data?.success && data.url) {
        setViewerUrl(data.url);
        setViewerOpen(true);
      }
    } catch (error) {
      toast.error("Error al cargar archivo");
    }
  };

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case "pendiente":
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">Pendiente</Badge>;
      case "pendiente_docs":
        return <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30">Doc. solicitada</Badge>;
      case "aprobado":
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">Aprobado</Badge>;
      case "rechazado":
        return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">Rechazado</Badge>;
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const justificantesConDocs = justificantes.filter(j => j.documentos && j.documentos.length > 0);

  if (justificantesConDocs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">Sin documentación adicional</h3>
          <p className="text-muted-foreground">
            Cuando se solicite o aporte documentación adicional, aparecerá aquí.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left panel - List of justificantes with documentation */}
      <Card className="lg:col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Justificantes con historial</CardTitle>
          <CardDescription>{justificantesConDocs.length} con documentación adicional</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            {justificantesConDocs.map((j) => (
              <div
                key={j.id}
                className={`p-4 border-b cursor-pointer hover:bg-muted/50 transition-colors ${
                  selectedJustificante?.id === j.id ? "bg-muted" : ""
                }`}
                onClick={() => setSelectedJustificante(j)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{j.worker_name}</p>
                    <p className="text-sm text-muted-foreground">{j.worker_number}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs capitalize">{j.tipo}</Badge>
                      {getStatusBadge(j.estado)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(j.fecha_inicio), "dd/MM/yyyy", { locale: es })}
                      {j.fecha_inicio !== j.fecha_fin && ` - ${format(new Date(j.fecha_fin), "dd/MM/yyyy", { locale: es })}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="outline" className="text-xs">
                      {j.documentos.length} mensaje{j.documentos.length !== 1 ? "s" : ""}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </div>
            ))}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Right panel - Chat/thread view */}
      <Card className="lg:col-span-2">
        {selectedJustificante ? (
          <>
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{selectedJustificante.worker_name}</CardTitle>
                  <CardDescription>
                    {selectedJustificante.worker_number} · {selectedJustificante.tipo} · {" "}
                    {format(new Date(selectedJustificante.fecha_inicio), "dd/MM/yyyy", { locale: es })}
                    {selectedJustificante.fecha_inicio !== selectedJustificante.fecha_fin && 
                      ` - ${format(new Date(selectedJustificante.fecha_fin), "dd/MM/yyyy", { locale: es })}`}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(selectedJustificante.estado)}
                  {selectedJustificante.estado !== "aprobado" && selectedJustificante.estado !== "rechazado" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowRequestDialog(true)}
                    >
                      <MessageSquarePlus className="h-4 w-4 mr-1" />
                      Solicitar más docs
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[450px]">
                <div className="p-4 space-y-4">
                  {/* Original justificante */}
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="bg-primary/5 rounded-lg p-3 border">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">{selectedJustificante.worker_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(selectedJustificante.created_at), "dd/MM/yyyy HH:mm", { locale: es })}
                          </span>
                        </div>
                        <p className="text-sm mb-2">Justificante original subido</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => openFileViewer(selectedJustificante.archivo_url)}
                        >
                          {selectedJustificante.archivo_tipo?.startsWith("image/") ? (
                            <Image className="h-3 w-3" />
                          ) : (
                            <FileText className="h-3 w-3" />
                          )}
                          {selectedJustificante.archivo_nombre}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Documentation thread */}
                  {selectedJustificante.documentos.map((doc) => (
                    <div
                      key={doc.id}
                      className={`flex gap-3 ${doc.actor_rol === "trabajador" ? "" : "flex-row-reverse"}`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        doc.actor_rol === "trabajador" 
                          ? "bg-primary/10" 
                          : doc.actor_rol === "admin" 
                            ? "bg-purple-500/10" 
                            : "bg-blue-500/10"
                      }`}>
                        <User className={`h-4 w-4 ${
                          doc.actor_rol === "trabajador" 
                            ? "text-primary" 
                            : doc.actor_rol === "admin" 
                              ? "text-purple-500" 
                              : "text-blue-500"
                        }`} />
                      </div>
                      <div className={`flex-1 max-w-[80%] ${doc.actor_rol !== "trabajador" ? "text-right" : ""}`}>
                        <div className={`rounded-lg p-3 border inline-block text-left ${
                          doc.actor_rol === "trabajador"
                            ? "bg-primary/5"
                            : doc.tipo_mensaje === "solicitud_docs"
                              ? "bg-orange-500/5 border-orange-500/20"
                              : "bg-blue-500/5 border-blue-500/20"
                        }`}>
                          <div className="flex items-center justify-between gap-4 mb-1">
                            <span className="font-medium text-sm">{doc.actor_nombre}</span>
                            <Badge variant="outline" className="text-xs capitalize">
                              {doc.actor_rol}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">
                            {format(new Date(doc.created_at), "dd/MM/yyyy HH:mm", { locale: es })}
                          </p>
                          
                          {doc.tipo_mensaje === "solicitud_docs" && (
                            <div className="bg-orange-500/10 text-orange-700 dark:text-orange-300 rounded px-2 py-1 text-xs mb-2">
                              📋 Solicitud de documentación
                            </div>
                          )}
                          
                          {doc.mensaje && (
                            <p className="text-sm whitespace-pre-wrap mb-2">{doc.mensaje}</p>
                          )}
                          
                          {doc.archivo_url && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              onClick={() => openFileViewer(doc.archivo_url!)}
                            >
                              {doc.archivo_tipo?.startsWith("image/") ? (
                                <Image className="h-3 w-3" />
                              ) : (
                                <FileText className="h-3 w-3" />
                              )}
                              {doc.archivo_nombre || "Ver archivo"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </>
        ) : (
          <CardContent className="h-[500px] flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Selecciona un justificante para ver el historial</p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Request documentation dialog */}
      <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar más documentación</DialogTitle>
            <DialogDescription>
              Escribe un mensaje para {selectedJustificante?.worker_name} indicando qué documentación adicional necesitas.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={requestMessage}
            onChange={(e) => setRequestMessage(e.target.value)}
            placeholder="Describe la documentación que necesitas..."
            className="min-h-[100px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRequestDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleRequestMoreDocs} 
              disabled={!requestMessage.trim() || submitting}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Enviar solicitud
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Simple File viewer */}
      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Ver documento</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto flex items-center justify-center min-h-[400px]">
            {viewerUrl && (
              viewerUrl.includes("image") || viewerUrl.match(/\.(jpg|jpeg|png|gif|webp)/i) ? (
                <img src={viewerUrl} alt="Documento" className="max-w-full max-h-[70vh] object-contain" />
              ) : (
                <div className="text-center space-y-4">
                  <FileText className="h-16 w-16 mx-auto text-muted-foreground" />
                  <Button onClick={() => window.open(viewerUrl, "_blank")}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Abrir documento
                  </Button>
                </div>
              )
            )}
          </div>
          <DialogFooter>
            {viewerUrl && (
              <Button variant="outline" onClick={() => window.open(viewerUrl, "_blank")}>
                <Download className="h-4 w-4 mr-2" />
                Descargar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
