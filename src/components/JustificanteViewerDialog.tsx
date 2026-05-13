import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, X, ChevronLeft, ChevronRight, Loader2, ZoomIn, FileText, Printer } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getCachedUrl, setCachedUrl } from "./JustificanteThumbnail";

type JustificanteFile = {
  id: string;
  archivo_url: string;
  archivo_nombre: string;
  archivo_tipo: string;
};

type JustificanteViewerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workerName: string;
  workerNumber: string;
  fechaInicio: string;
  fechaFin: string;
  tipo: string;
  comentario?: string | null;
  files: JustificanteFile[];
};

export const JustificanteViewerDialog = ({
  open,
  onOpenChange,
  workerName,
  workerNumber,
  fechaInicio,
  fechaFin,
  tipo,
  comentario,
  files,
}: JustificanteViewerDialogProps) => {
  const [loadingUrls, setLoadingUrls] = useState<Record<string, boolean>>({});
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [fullscreenLoading, setFullscreenLoading] = useState(false);
  const loadedRef = useRef(false);
  const fullscreenImgRef = useRef<HTMLImageElement | null>(null);

  // Load all URLs when dialog opens, using cache from thumbnails
  useEffect(() => {
    if (!open || loadedRef.current) return;
    
    const loadAllUrls = async () => {
      setInitialLoading(true);
      loadedRef.current = true;
      
      // Check cache first for each file
      const cachedUrls: Record<string, string> = {};
      const filesToLoad: JustificanteFile[] = [];
      
      files.forEach(file => {
        const cached = getCachedUrl(file.archivo_url);
        if (cached) {
          cachedUrls[file.id] = cached;
        } else {
          filesToLoad.push(file);
        }
      });
      
      // Set cached URLs immediately
      if (Object.keys(cachedUrls).length > 0) {
        setSignedUrls(cachedUrls);
      }
      
      // If all URLs are cached, we're done
      if (filesToLoad.length === 0) {
        setInitialLoading(false);
        return;
      }
      
      // Mark remaining as loading
      const loadingState: Record<string, boolean> = {};
      filesToLoad.forEach(f => { loadingState[f.id] = true; });
      setLoadingUrls(loadingState);
      
      // Load remaining URLs in parallel
      const results = await Promise.all(
        filesToLoad.map(async (file) => {
          try {
            const { data } = await supabase.functions.invoke("justificantes-operations", {
              body: {
                action: "getFileUrl",
                data: { filePath: file.archivo_url }
              }
            });
            if (data?.success && data.url) {
              // Also update the shared cache
              setCachedUrl(file.archivo_url, data.url);
            }
            return { id: file.id, url: data?.success ? data.url : null };
          } catch {
            return { id: file.id, url: null };
          }
        })
      );
      
      // Update state with all results (merge with cached)
      const urlsMap: Record<string, string> = { ...cachedUrls };
      results.forEach(r => {
        if (r.url) urlsMap[r.id] = r.url;
      });
      
      setSignedUrls(urlsMap);
      setLoadingUrls({});
      setInitialLoading(false);
    };
    
    loadAllUrls();
  }, [open, files]);

  // Reset only fullscreen state when dialog closes (keep URLs cached)
  useEffect(() => {
    if (!open) {
      loadedRef.current = false;
      setFullscreenImage(null);
    }
  }, [open]);

  // If the fullscreen image is already cached by the browser, onLoad may not fire.
  // Ensure we always drop the loading overlay as soon as the <img> is complete.
  useEffect(() => {
    if (!fullscreenImage) return;

    const img = fullscreenImgRef.current;
    if (img?.complete) {
      setFullscreenLoading(false);
    }
  }, [fullscreenImage]);

  const downloadFile = async (file: JustificanteFile) => {
    let url = signedUrls[file.id];
    
    if (!url) {
      try {
        const { data } = await supabase.functions.invoke("justificantes-operations", {
          body: {
            action: "getFileUrl",
            data: { filePath: file.archivo_url }
          }
        });
        if (data?.success && data.url) {
          url = data.url;
          setSignedUrls(prev => ({ ...prev, [file.id]: url! }));
        }
      } catch (error) {
        toast.error("Error al descargar archivo");
        return;
      }
    }

    if (url) {
      const link = document.createElement("a");
      link.href = url;
      link.download = file.archivo_nombre;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const downloadAll = async () => {
    for (const file of files) {
      await downloadFile(file);
    }
  };

  const handlePrint = () => {
    // Open a print window with the images
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("No se pudo abrir la ventana de impresión");
      return;
    }

    const imageFiles = files.filter(f => isImage(f.archivo_tipo));
    const imagesHtml = imageFiles
      .map(file => {
        const url = signedUrls[file.id];
        if (!url) return "";
        return `<div style="page-break-after: always; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
          <img src="${url}" style="max-width: 100%; max-height: 90vh; object-fit: contain;" />
        </div>`;
      })
      .join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Justificante - ${workerName}</title>
          <style>
            body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #68a13c; padding-bottom: 15px; }
            .header h1 { color: #68a13c; margin: 0 0 5px 0; font-size: 24px; }
            .info { margin-bottom: 20px; }
            .info p { margin: 5px 0; }
            @media print { 
              .header { page-break-after: avoid; }
              img { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Justificante</h1>
            <p><strong>${workerName}</strong> (#${workerNumber})</p>
            <p>${fechaInicio}${fechaInicio !== fechaFin ? ` - ${fechaFin}` : ""} | ${tipo.toUpperCase()}</p>
          </div>
          ${comentario ? `<div class="info"><p><strong>Comentario:</strong> ${comentario}</p></div>` : ""}
          ${imagesHtml}
        </body>
      </html>
    `);
    printWindow.document.close();
    
    // Wait for images to load then print
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  const isImage = (tipo: string) => tipo.startsWith("image/");
  const isPdf = (tipo: string) => tipo === "application/pdf";

  const openFullscreen = (url: string, fileId: string) => {
    // Find index within image files only
    const imageFiles = files.filter(f => isImage(f.archivo_tipo));
    const imageIndex = imageFiles.findIndex(f => f.id === fileId);
    setCurrentIndex(imageIndex >= 0 ? imageIndex : 0);
    setFullscreenLoading(true);
    setFullscreenImage(url);
  };

  const navigateFullscreen = (direction: "prev" | "next") => {
    const imageFiles = files.filter(f => isImage(f.archivo_tipo));
    if (imageFiles.length === 0) return;

    setCurrentIndex((prev) => {
      const newIndex = direction === "prev"
        ? (prev > 0 ? prev - 1 : imageFiles.length - 1)
        : (prev < imageFiles.length - 1 ? prev + 1 : 0);

      const newFile = imageFiles[newIndex];
      const nextUrl = newFile ? signedUrls[newFile.id] : undefined;
      if (nextUrl) {
        setFullscreenLoading(true);
        setFullscreenImage(nextUrl);
      }

      return newIndex;
    });
  };

  // Block dialog close while fullscreen is open (key fix for Radix outside-click issue)
  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && fullscreenImage) {
      // User tried to close dialog while fullscreen is open – ignore
      return;
    }
    onOpenChange(nextOpen);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
          onPointerDownOutside={(e) => {
            // If fullscreen is open, do NOT close the parent dialog.
            if (fullscreenImage) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            // If fullscreen is open, do NOT close the parent dialog.
            if (fullscreenImage) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            // ESC should close fullscreen first; keep parent dialog open.
            if (fullscreenImage) {
              e.preventDefault();
              setFullscreenImage(null);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-lg font-semibold">{workerName}</p>
                  <p className="text-sm text-muted-foreground font-normal">#{workerNumber}</p>
                </div>
                <Badge variant="outline" className="capitalize">{tipo}</Badge>
              </div>
              <div className="text-sm text-muted-foreground font-normal">
                {format(new Date(fechaInicio), "dd/MM/yyyy")}
                {fechaInicio !== fechaFin && (
                  <> - {format(new Date(fechaFin), "dd/MM/yyyy")}</>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>

          {comentario && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <p className="text-muted-foreground font-medium mb-1">Comentario del empleado:</p>
              <p>{comentario}</p>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-1">
              {files.map((file, index) => (
                <div
                  key={file.id}
                  className="relative group border rounded-lg overflow-hidden bg-muted/30 aspect-[4/3] flex items-center justify-center"
                >
                  {loadingUrls[file.id] ? (
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  ) : signedUrls[file.id] ? (
                    isImage(file.archivo_tipo) ? (
                      <>
                        <img
                          src={signedUrls[file.id]}
                          alt={file.archivo_nombre}
                          className="w-full h-full object-cover cursor-pointer transition-transform hover:scale-105"
                          onClick={() => openFullscreen(signedUrls[file.id], file.id)}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openFullscreen(signedUrls[file.id], file.id)}
                          >
                            <ZoomIn className="h-4 w-4 mr-1" />
                            Ampliar
                          </Button>
                        </div>
                      </>
                    ) : isPdf(file.archivo_tipo) ? (
                      <div className="flex flex-col items-center gap-2 p-4">
                        <FileText className="h-12 w-12 text-red-500" />
                        <p className="text-xs text-center text-muted-foreground truncate max-w-full">
                          {file.archivo_nombre}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(signedUrls[file.id], "_blank")}
                        >
                          Ver PDF
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 p-4">
                        <FileText className="h-12 w-12 text-muted-foreground" />
                        <p className="text-xs text-center text-muted-foreground truncate max-w-full">
                          {file.archivo_nombre}
                        </p>
                      </div>
                    )
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <FileText className="h-8 w-8" />
                      <p className="text-xs">{file.archivo_nombre}</p>
                    </div>
                  )}

                  {/* Download button overlay */}
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute bottom-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => downloadFile(file)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between items-center pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              {files.length} archivo{files.length !== 1 ? "s" : ""}
            </p>
            <div className="flex gap-2">
              <Button onClick={handlePrint} variant="outline">
                <Printer className="h-4 w-4 mr-2" />
                Imprimir
              </Button>
              <Button onClick={downloadAll} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Descargar todo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fullscreen Image Modal */}
      <Dialog
        open={!!fullscreenImage}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setFullscreenImage(null);
        }}
      >
        <DialogContent
          hideCloseButton
          className="fixed inset-0 z-[200] h-[100dvh] w-[100dvw] max-w-none translate-x-0 translate-y-0 border-0 bg-black/95 p-0 shadow-none"
        >
          {/* Hidden header for accessibility */}
          <DialogHeader className="sr-only">
            <DialogTitle>Vista ampliada</DialogTitle>
          </DialogHeader>

          {/* Backdrop - click to close */}
          <div
            className="absolute inset-0"
            onClick={() => setFullscreenImage(null)}
          />

          {/* Image container - pointer-events-none so clicks pass through to backdrop */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {fullscreenLoading && (
              <Loader2 className="h-12 w-12 text-white animate-spin" />
            )}
            {fullscreenImage && (
              <img
                ref={fullscreenImgRef}
                src={fullscreenImage}
                alt="Vista ampliada"
                className={`max-h-[95dvh] max-w-[95dvw] object-contain pointer-events-auto transition-opacity duration-200 ${
                  fullscreenLoading ? "opacity-0" : "opacity-100"
                }`}
                onLoad={() => setFullscreenLoading(false)}
                onError={() => setFullscreenLoading(false)}
                draggable={false}
              />
            )}
          </div>

          {/* Close button - high z-index */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4 z-[210] text-white hover:bg-white/20"
            onClick={() => setFullscreenImage(null)}
          >
            <X className="h-6 w-6" />
          </Button>

          {/* Navigation arrows - high z-index */}
          {files.filter((f) => isImage(f.archivo_tipo)).length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-4 top-1/2 -translate-y-1/2 z-[210] text-white hover:bg-white/20"
                onClick={() => navigateFullscreen("prev")}
              >
                <ChevronLeft className="h-8 w-8" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-4 top-1/2 -translate-y-1/2 z-[210] text-white hover:bg-white/20"
                onClick={() => navigateFullscreen("next")}
              >
                <ChevronRight className="h-8 w-8" />
              </Button>
            </>
          )}

          {/* Counter */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[210] text-white/80 text-sm">
            {currentIndex + 1} / {files.filter((f) => isImage(f.archivo_tipo)).length}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
