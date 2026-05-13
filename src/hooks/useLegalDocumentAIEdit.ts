import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AIEditPayload {
  instruccion: string;
  image_base64?: string | null;
  selected_text?: string | null;
}

interface Options {
  documentId: string;
  htmlContent: string;
  onDocumentUpdated: (newHtml: string) => void;
}

const friendlyError = (raw: string) => {
  if (!raw) return "❌ No se pudo generar la edición.";
  const lower = raw.toLowerCase();
  if (raw.includes("non-2xx") || raw.includes("503") || lower.includes("overload") || lower.includes("saturad")) {
    return "⏳ El servicio de IA está saturado. Inténtalo de nuevo en unos segundos.";
  }
  return `❌ ${raw}`;
};

/**
 * Reusable hook to execute AI edits on a legal document.
 * Used by the chat panel and the selection popover.
 */
export function useLegalDocumentAIEdit({ documentId, htmlContent, onDocumentUpdated }: Options) {
  const [running, setRunning] = useState(false);
  const sessionToken = typeof window !== "undefined" ? localStorage.getItem("manager_session_token") || "" : "";

  const runAIEdit = useCallback(async (payload: AIEditPayload): Promise<{ ok: boolean; cambios?: string; error?: string }> => {
    setRunning(true);
    try {
      const aiBody: Record<string, unknown> = {
        action: "editLegalDocument",
        html_content: htmlContent,
        instruccion: payload.instruccion,
      };
      if (payload.image_base64) aiBody.image_base64 = payload.image_base64;
      if (payload.selected_text) aiBody.selected_text = payload.selected_text;

      const { data: aiResult, error: aiInvokeError } = await supabase.functions.invoke("control-incidencias-ai", { body: aiBody });

      if (aiInvokeError) {
        return { ok: false, error: friendlyError(aiInvokeError.message || "") };
      }
      if (!aiResult || aiResult?.error) {
        return { ok: false, error: friendlyError(aiResult?.message || aiResult?.error || "") };
      }

      const newHtml = aiResult?.html_content;
      if (!newHtml) return { ok: false, error: "❌ La IA no devolvió HTML válido." };

      const cambios = aiResult?.cambios_realizados || "Cambios aplicados";

      const saveBody: Record<string, unknown> = {
        action: "updateLegalDocument",
        sessionToken,
        documentId,
        html_content: newHtml,
        change_description: payload.instruccion,
      };
      if (aiResult?.tipo_final) saveBody.tipo_final = aiResult.tipo_final;
      if (aiResult?.gravedad_final) saveBody.gravedad_final = aiResult.gravedad_final;
      if (aiResult?.dias_suspension_final !== null && aiResult?.dias_suspension_final !== undefined) {
        saveBody.dias_suspension_final = aiResult.dias_suspension_final;
      }

      const { data: saveResult, error: saveErr } = await supabase.functions.invoke("incidencias-operations", { body: saveBody });
      if (saveErr) return { ok: false, error: `❌ Error al guardar: ${saveErr.message}` };
      if (!saveResult?.success) return { ok: false, error: `❌ Error al guardar: ${saveResult?.error || "desconocido"}` };

      onDocumentUpdated(newHtml);
      toast.success("Documento actualizado");
      return { ok: true, cambios };
    } catch (e: any) {
      return { ok: false, error: friendlyError(e?.message || "Error de conexión") };
    } finally {
      setRunning(false);
    }
  }, [documentId, htmlContent, onDocumentUpdated, sessionToken]);

  return { runAIEdit, running };
}
