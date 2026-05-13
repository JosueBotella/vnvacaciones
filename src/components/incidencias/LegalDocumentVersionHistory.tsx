import { useState, useEffect } from "react";
import { Clock, RotateCcw, Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Version {
  id: string;
  version_number: number;
  change_description: string | null;
  created_by: string | null;
  created_at: string;
  html_content: string;
}

interface Props {
  documentId: string;
  onPreviewVersion: (html: string) => void;
  onRestored: () => void;
}

export function LegalDocumentVersionHistory({ documentId, onPreviewVersion, onRestored }: Props) {
  const sessionToken = localStorage.getItem("manager_session_token") || "";
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    loadVersions();
  }, [documentId]);

  const loadVersions = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "getLegalDocumentVersions", sessionToken, documentId },
      });
      setVersions(data?.versions || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  const handleRestore = async (versionId: string) => {
    setRestoring(versionId);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "restoreLegalDocumentVersion", sessionToken, documentId, versionId },
      });
      if (data?.success) {
        toast.success("Versión restaurada correctamente");
        onRestored();
      } else {
        toast.error(data?.error || "Error al restaurar");
      }
    } catch { toast.error("Error al restaurar"); }
    finally { setRestoring(null); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border/50">
        <p className="text-xs font-semibold text-foreground tracking-tight flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" /> Historial de versiones
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{versions.length} versión(es) anterior(es)</p>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3 space-y-2">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : versions.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">Sin versiones anteriores</p>
        ) : (
          versions.map(v => (
            <div key={v.id} className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-muted-foreground">v{v.version_number}</span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(v.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              {v.change_description && (
                <p className="text-[11px] text-foreground/80 line-clamp-2">{v.change_description}</p>
              )}
              {v.created_by && (
                <p className="text-[10px] text-muted-foreground">por {v.created_by}</p>
              )}
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] gap-1"
                  onClick={() => onPreviewVersion(v.html_content)}
                >
                  <Eye className="h-3 w-3" /> Ver
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] gap-1"
                  onClick={() => handleRestore(v.id)}
                  disabled={restoring === v.id}
                >
                  {restoring === v.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                  Restaurar
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
