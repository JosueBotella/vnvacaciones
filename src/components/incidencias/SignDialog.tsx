import { useState } from "react";
import { Loader2, ChevronUp, ChevronDown } from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitize";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SignaturePad } from "@/components/SignaturePad";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface SignDialogProps {
  signDoc: any;
  onClose: () => void;
  signatureData: string | null;
  setSignatureData: (data: string | null) => void;
  signing: boolean;
  onSign: () => void;
  onReject: () => void;
}

export function SignDialog({ signDoc, onClose, signatureData, setSignatureData, signing, onSign, onReject }: SignDialogProps) {
  const [signatureOpen, setSignatureOpen] = useState(true);

  return (
    <Dialog open={!!signDoc} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[95vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
          <DialogTitle className="text-sm">Firma del trabajador — {signDoc?.worker_name}</DialogTitle>
        </DialogHeader>

        {/* Document preview - takes remaining space, scrollable & zoomable */}
        <div
          className="flex-1 min-h-0 overflow-auto border-y border-border bg-white"
          style={{ touchAction: "pan-x pan-y pinch-zoom" }}
        >
          <div
            className="origin-top-left min-w-full"
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(signDoc?.html_content?.replace(
                /<style[\s\S]*?<\/style>/gi,
                '<style>body{font-family:sans-serif;font-size:12px;line-height:1.6;color:#333;max-width:100%;padding:16px}h1{font-size:16px}h2{font-size:13px;margin-top:14px}.badge{font-size:10px;padding:2px 8px}.firma-section{display:none}</style>'
              ) || '')
            }}
          />
        </div>

        {/* Collapsible signature section */}
        <Collapsible open={signatureOpen} onOpenChange={setSignatureOpen} className="shrink-0">
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors bg-muted/30 border-b border-border">
              {signatureOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              {signatureOpen ? "Ocultar firma" : "Mostrar firma"}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="px-5 pt-3 pb-1">
            <SignaturePad
              onSignatureChange={setSignatureData}
              clearLabel="Borrar"
              confirmLabel="Confirmar firma"
              signHereLabel="Firma aquí"
              confirmHintLabel='Pulsa "Confirmar firma" para validar'
            />
          </CollapsibleContent>
        </Collapsible>

        <DialogFooter className="px-5 py-3 shrink-0 flex gap-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={onReject} disabled={signing}>Rechazar firma</Button>
          <Button size="sm" onClick={onSign} disabled={!signatureData || signing}>
            {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Firmar documento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
