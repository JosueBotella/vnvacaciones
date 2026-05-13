import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Copy, Loader2 } from "lucide-react";

type TabKey = "justificantes" | "altas" | "anticipos" | "nspp" | "despidos" | "incidencias";

const TAB_CONFIG: { key: TabKey; label: string; action: string }[] = [
  { key: "justificantes", label: "Justificantes", action: "updateOperativaJustificanteConfig" },
  { key: "altas", label: "Altas", action: "updateOperativaAltasConfig" },
  { key: "anticipos", label: "Anticipos", action: "updateOperativaAnticiposConfig" },
  { key: "nspp", label: "NSPP", action: "updateOperativaNsppConfig" },
  { key: "despidos", label: "Despidos", action: "updateOperativaDespidosConfig" },
  { key: "incidencias", label: "Control Incidencias (RRHH)", action: "syncEmailsToIncidencias" },
];

interface CopyEmailsDialogProps {
  sourceTab: TabKey;
  emails: string[];
  primaryEmail: string | null;
  getSessionToken: () => string | null;
}

export default function CopyEmailsDialog({ sourceTab, emails, primaryEmail, getSessionToken }: CopyEmailsDialogProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<TabKey[]>([]);
  const [copying, setCopying] = useState(false);

  const availableTabs = TAB_CONFIG.filter((t) => t.key !== sourceTab);

  const toggleTab = (key: TabKey) => {
    setSelected((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };

  const selectAll = () => {
    if (selected.length === availableTabs.length) {
      setSelected([]);
    } else {
      setSelected(availableTabs.map((t) => t.key));
    }
  };

  const handleCopy = async () => {
    if (selected.length === 0) return;
    setCopying(true);
    try {
      const promises = selected.map((key) => {
        const tab = TAB_CONFIG.find((t) => t.key === key)!;
        return supabase.functions.invoke("admin-operations", {
          body: {
            action: tab.action,
            sessionToken: getSessionToken(),
            data: { emails, primary_email: primaryEmail },
          },
        });
      });
      const results = await Promise.all(promises);
      const allOk = results.every((r) => r.data?.success);
      if (!allOk) throw new Error("Error en alguna pestaña");

      const names = selected.map((k) => TAB_CONFIG.find((t) => t.key === k)!.label).join(", ");
      toast({ title: "Emails copiados ✓", description: `Copiados a: ${names}` });
      setOpen(false);
      setSelected([]);
    } catch (err: any) {
      toast({ title: "Error al copiar", description: err.message, variant: "destructive" });
    } finally {
      setCopying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSelected([]); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <Copy className="h-3.5 w-3.5" />
          Copiar a otras pestañas
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-sm">Copiar emails a...</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <button
            type="button"
            onClick={selectAll}
            className="text-xs text-primary hover:underline"
          >
            {selected.length === availableTabs.length ? "Deseleccionar todo" : "Seleccionar todo"}
          </button>
          <div className="space-y-2">
            {availableTabs.map((tab) => (
              <label
                key={tab.key}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <Checkbox
                  checked={selected.includes(tab.key)}
                  onCheckedChange={() => toggleTab(tab.key)}
                />
                <span className="text-sm">{tab.label}</span>
              </label>
            ))}
          </div>
          <Button
            onClick={handleCopy}
            disabled={selected.length === 0 || copying}
            size="sm"
            className="w-full"
          >
            {copying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            Copiar a {selected.length} pestaña{selected.length !== 1 ? "s" : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
