import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { History, ChevronDown, Loader2, Clock, User, Mail, Building, Phone, CreditCard, CalendarIcon, FileText, Image, Trash2, Search, X, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface HistoryEntry {
  id: string;
  tipo: string;
  sent_at: string;
  sent_by: string;
  destinatarios: string[];
  datos: Record<string, any>;
  email_id: string | null;
}

interface Props {
  tipo: "justificante" | "alta" | "anticipo" | "nspp" | "despido";
  refreshKey?: number;
  onResend?: (entry: HistoryEntry) => void;
}

export default function OperativaHistoryPanel({ tipo, refreshKey, onResend }: Props) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);

  const getSessionToken = () =>
    localStorage.getItem("manager_session_token") || sessionStorage.getItem("manager_session_token");

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: { action: "getOperativaHistory", sessionToken: getSessionToken(), data: { tipo } },
      });
      if (data?.success) {
        setHistory(data.history || []);
      }
    } catch (e) {
      console.error("Error loading history:", e);
    } finally {
      setLoading(false);
    }
  }, [tipo]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory, refreshKey]);

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este registro del historial?")) return;
    setDeletingId(id);
    try {
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: { action: "deleteOperativaHistory", sessionToken: getSessionToken(), data: { id } },
      });
      if (data?.success) {
        setHistory((prev) => prev.filter((e) => e.id !== id));
        toast({ title: "Registro eliminado ✓" });
      } else {
        toast({ title: "Error al eliminar", description: data?.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })
      + " " + d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (history.length === 0) {
    return null;
  }

  const normalize = (s: string) =>
    (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const getName = (entry: HistoryEntry) =>
    entry.datos?.workerName || entry.datos?.nombre || "";
  const getNumber = (entry: HistoryEntry) =>
    entry.datos?.workerNumber || entry.datos?.numero || "";

  const filtered = (() => {
    if (!searchQuery.trim()) return history;
    const q = normalize(searchQuery.trim());
    return history.filter((e) => {
      const name = normalize(getName(e));
      const num = String(getNumber(e)).toLowerCase();
      const sentBy = normalize(e.sent_by || "");
      return name.includes(q) || num.includes(q) || sentBy.includes(q);
    });
  })();

  const visible = filtered.slice(0, visibleCount);

  return (
    <div>
      <button
        type="button"
        onClick={() => setShowHistory(!showHistory)}
        className="w-full flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <History className="h-3.5 w-3.5" />
        <span>Historial ({history.length})</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", showHistory && "rotate-180")} />
      </button>
      {showHistory && (
        <div className="animate-fade-in mt-1 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setVisibleCount(20); }}
              placeholder="Buscar por nombre o número..."
              className="pl-9 pr-9 h-9 text-sm rounded-xl"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
            <span>
              {searchQuery
                ? `${filtered.length} de ${history.length} resultados`
                : `Mostrando ${Math.min(visibleCount, filtered.length)} de ${filtered.length}`}
            </span>
          </div>
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <div className="text-center py-6 text-xs text-muted-foreground">
                Sin resultados para "{searchQuery}"
              </div>
            ) : (
              <>
                {visible.map((entry) => {
                  const isOpen = openId === entry.id;
                  return (
                    <Collapsible key={entry.id} open={isOpen} onOpenChange={(o) => setOpenId(o ? entry.id : null)}>
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-left transition-colors",
                            isOpen ? "bg-primary/5 border border-primary/10" : "bg-muted/40 hover:bg-muted/60"
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {getName(entry) || "Sin nombre"}
                                {getNumber(entry) && (
                                  <span className="text-xs text-muted-foreground font-normal ml-1.5">
                                    #{getNumber(entry)}
                                  </span>
                                )}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {formatDate(entry.sent_at)} · {entry.sent_by}
                              </p>
                            </div>
                          </div>
                          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform flex-shrink-0", isOpen && "rotate-180")} />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-3 py-3 space-y-2 text-sm border-x border-b border-border/50 rounded-b-lg -mt-0.5">
                          {tipo === "justificante" ? (
                            <JustificanteDetails datos={entry.datos} destinatarios={entry.destinatarios} />
                          ) : tipo === "alta" ? (
                            <AltaDetails datos={entry.datos} destinatarios={entry.destinatarios} />
                          ) : tipo === "nspp" ? (
                            <NsppDetails datos={entry.datos} destinatarios={entry.destinatarios} />
                          ) : tipo === "despido" ? (
                            <DespidoDetails datos={entry.datos} destinatarios={entry.destinatarios} />
                          ) : (
                            <AnticipoDetails datos={entry.datos} destinatarios={entry.destinatarios} />
                          )}
                          <div className="pt-2 border-t border-border/30 flex justify-between gap-2">
                            {onResend ? (
                              <button
                                type="button"
                                onClick={() => onResend(entry)}
                                className="flex items-center gap-1.5 text-xs text-primary hover:underline transition-colors"
                              >
                                <Send className="h-3 w-3" />
                                Reenviar
                              </button>
                            ) : <span />}
                            <button
                              type="button"
                              onClick={() => handleDelete(entry.id)}
                              disabled={deletingId === entry.id}
                              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                            >
                              {deletingId === entry.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                              Eliminar
                            </button>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
                {visibleCount < filtered.length && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => c + 20)}
                    className="w-full py-2 text-xs text-primary hover:bg-primary/5 rounded-lg transition-colors"
                  >
                    Cargar más ({filtered.length - visibleCount} restantes)
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: any; label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  );
}

function JustificanteDetails({ datos, destinatarios }: { datos: Record<string, any>; destinatarios: string[] }) {
  return (
    <>
      <DetailRow icon={User} label="Trabajador" value={datos?.workerName} />
      <DetailRow icon={FileText} label="Número" value={datos?.workerNumber} />
      <DetailRow icon={FileText} label="Archivo" value={datos?.fileName} />
      {datos?.comment && <DetailRow icon={FileText} label="Comentario" value={datos.comment} />}
      <DetailRow icon={User} label="Solicitante" value={datos?.solicitante} />
      <DetailRow icon={Mail} label="Enviado a" value={destinatarios?.join(", ")} />
      <CapturaPreview capturaUrl={datos?.capturaUrl} />
    </>
  );
}

function AltaDetails({ datos, destinatarios }: { datos: Record<string, any>; destinatarios: string[] }) {
  return (
    <>
      <DetailRow icon={User} label="Nombre" value={datos?.nombre} />
      <DetailRow icon={CalendarIcon} label="Fecha de alta" value={datos?.fechaAlta} />
      <DetailRow icon={Building} label="Departamento" value={datos?.departamento} />
      <DetailRow icon={Phone} label="Teléfono" value={datos?.telefono} />
      <DetailRow icon={Mail} label="Email" value={datos?.email} />
      <DetailRow icon={CreditCard} label="IBAN" value={datos?.iban} />
      <DetailRow icon={FileText} label="Archivos" value={datos?.archivos?.join(", ")} />
      <DetailRow icon={User} label="Solicitante" value={datos?.solicitante} />
      <DetailRow icon={Mail} label="Enviado a" value={destinatarios?.join(", ")} />
      <CapturaPreview capturaUrl={datos?.capturaUrl} />
    </>
  );
}

function AnticipoDetails({ datos, destinatarios }: { datos: Record<string, any>; destinatarios: string[] }) {
  return (
    <>
      <DetailRow icon={User} label="Trabajador" value={datos?.workerName} />
      <DetailRow icon={FileText} label="Número" value={datos?.workerNumber} />
      <DetailRow icon={CreditCard} label="Cantidad" value={datos?.cantidad ? `${Number(datos.cantidad).toLocaleString("es-ES", { minimumFractionDigits: 2 })} €` : undefined} />
      <DetailRow icon={User} label="Solicitante" value={datos?.solicitante} />
      <DetailRow icon={Mail} label="Enviado a" value={destinatarios?.join(", ")} />
      <CapturaPreview capturaUrl={datos?.capturaUrl} />
    </>
  );
}

function NsppDetails({ datos, destinatarios }: { datos: Record<string, any>; destinatarios: string[] }) {
  return (
    <>
      <DetailRow icon={User} label="Trabajador" value={datos?.workerName} />
      <DetailRow icon={FileText} label="Número" value={datos?.workerNumber} />
      {datos?.fecha && <DetailRow icon={CalendarIcon} label="Fecha solicitada" value={datos.fecha} />}
      {datos?.hora && <DetailRow icon={Clock} label="Antes de" value={datos.hora} />}
      {datos?.contexto && <DetailRow icon={FileText} label="Comentarios" value={datos.contexto} />}
      <DetailRow icon={User} label="Solicitante" value={datos?.solicitante} />
      <DetailRow icon={Mail} label="Enviado a" value={destinatarios?.join(", ")} />
      <CapturaPreview capturaUrl={datos?.capturaUrl} />
    </>
  );
}

function DespidoDetails({ datos, destinatarios }: { datos: Record<string, any>; destinatarios: string[] }) {
  return (
    <>
      <DetailRow icon={User} label="Trabajador" value={datos?.workerName} />
      <DetailRow icon={FileText} label="Número" value={datos?.workerNumber} />
      {datos?.contexto && <DetailRow icon={FileText} label="Motivo" value={datos.contexto} />}
      <DetailRow icon={User} label="Solicitante" value={datos?.solicitante} />
      <DetailRow icon={Mail} label="Enviado a" value={destinatarios?.join(", ")} />
      <CapturaPreview capturaUrl={datos?.capturaUrl} />
    </>
  );
}

function CapturaPreview({ capturaUrl }: { capturaUrl?: string | null }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  
  useEffect(() => {
    if (!capturaUrl) return;
    const fetchUrl = async () => {
      const { data } = await supabase.storage
        .from('operativa-capturas')
        .createSignedUrl(capturaUrl, 3600);
      if (data?.signedUrl) setImgUrl(data.signedUrl);
    };
    fetchUrl();
  }, [capturaUrl]);

  if (!capturaUrl || !imgUrl) return null;
  
  return (
    <div className="flex items-start gap-2 mt-1">
      <Image className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Captura WhatsApp</p>
        <a href={imgUrl} target="_blank" rel="noopener noreferrer">
          <img
            src={imgUrl}
            alt="Captura WhatsApp"
            className="mt-1 rounded-md border border-border/50 max-w-[120px] max-h-[160px] object-cover cursor-pointer hover:opacity-80 transition-opacity"
          />
        </a>
      </div>
    </div>
  );
}
