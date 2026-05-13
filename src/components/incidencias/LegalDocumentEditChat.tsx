import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Bot, User, ImagePlus, X, RotateCcw, Zap, Image as ImageIcon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useLegalDocumentAIEdit, type AIEditPayload } from "@/hooks/useLegalDocumentAIEdit";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  imagePreview?: string;
  isError?: boolean;
  retryPayload?: AIEditPayload;
}

interface Props {
  documentId: string;
  htmlContent: string;
  onDocumentUpdated: (newHtml: string) => void;
  onRegenerateWithEvidence?: () => void | Promise<void>;
  regeneratingEvidence?: boolean;
}

const isEvidenceRegenerationRequest = (text: string) =>
  /\b(fotogramas?|frames?|v[ií]deo|video|evidencias?\s+gr[aá]ficas?|im[aá]genes?\s+del\s+v[ií]deo)\b/i.test(text);

export function LegalDocumentEditChat({ documentId, htmlContent, onDocumentUpdated, onRegenerateWithEvidence, regeneratingEvidence }: Props) {
  const { runAIEdit, running } = useLegalDocumentAIEdit({ documentId, htmlContent, onDocumentUpdated });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleImageSelect = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImageBase64(result);
      setImagePreview(result);
    };
    reader.readAsDataURL(file);
  }, []);

  const clearImage = () => {
    setImageBase64(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) handleImageSelect(file);
        return;
      }
    }
  }, [handleImageSelect]);

  const submitEdit = async (payload: AIEditPayload) => {
    const result = await runAIEdit(payload);
    setMessages(prev => [...prev, result.ok
      ? { role: "assistant", content: `✅ ${result.cambios}` }
      : { role: "assistant", content: result.error || "Error", isError: true, retryPayload: payload }]);
  };

  const handleSend = async () => {
    const text = input.trim();
    if ((!text && !imageBase64) || running || regeneratingEvidence) return;

    setInput("");
    const userMsg: ChatMessage = {
      role: "user",
      content: text || "Aplica los cambios señalados en la imagen",
      imagePreview: imagePreview || undefined,
    };
    const currentImage = imageBase64;
    clearImage();
    setMessages(prev => [...prev, userMsg]);

    if (!currentImage && onRegenerateWithEvidence && isEvidenceRegenerationRequest(userMsg.content)) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Voy a regenerar el documento desde el vídeo original para insertar fotogramas reales. Esto no depende del chat de IA.",
      }]);
      await onRegenerateWithEvidence();
      return;
    }

    await submitEdit({ instruccion: userMsg.content, image_base64: currentImage });
  };

  const handleRetry = async (payload: AIEditPayload) => {
    if (running) return;
    setMessages(prev => prev.filter(m => !m.isError));
    await submitEdit(payload);
  };

  const modeBadge = imageBase64 ? (
    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20">
      <ImageIcon className="h-2.5 w-2.5" /> Modo visual
    </Badge>
  ) : (
    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20">
      <Zap className="h-2.5 w-2.5" /> Modo rápido
    </Badge>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border/50">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-foreground tracking-tight">Editar con IA</p>
          {modeBadge}
        </div>
        {onRegenerateWithEvidence && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2 h-7 w-full justify-start gap-1.5 text-[11px]"
            onClick={() => onRegenerateWithEvidence()}
            disabled={running || regeneratingEvidence}
          >
            {regeneratingEvidence ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Insertar fotogramas reales del vídeo
          </Button>
        )}
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {imageBase64
            ? "Modo visual: con captura. Más lento, puede saturarse."
            : "Modo rápido: solo texto. Respuesta en ~2 s."}
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8 space-y-2">
            <Bot className="h-8 w-8 mx-auto text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">Selecciona texto en el documento o escribe una instrucción</p>
            <div className="space-y-1.5 mt-3">
              {[
                "Cambia 'llaves de un vehículo' por 'llaves del vehículo'",
                "Suaviza el tono de la medida disciplinaria",
                "Añade referencia al Art. 54 del ET",
              ].map((example, i) => (
                <button
                  key={i}
                  className="block w-full text-left text-[11px] text-muted-foreground/80 hover:text-foreground bg-muted/30 hover:bg-muted/60 rounded-lg px-3 py-2 transition-colors"
                  onClick={() => setInput(example)}
                >
                  "{example}"
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && <Bot className="h-4 w-4 mt-1 text-muted-foreground shrink-0" />}
            <div className="flex flex-col gap-1 max-w-[85%]">
              <div className={`rounded-xl px-3 py-2 text-xs ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : msg.isError
                    ? "bg-destructive/10 text-destructive border border-destructive/20"
                    : "bg-muted text-foreground"
              }`}>
                {msg.imagePreview && (
                  <img src={msg.imagePreview} alt="Captura" className="rounded-lg mb-1.5 max-h-32 w-auto border border-primary-foreground/20" />
                )}
                {msg.content}
              </div>
              {msg.isError && msg.retryPayload && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] gap-1 self-start"
                  onClick={() => handleRetry(msg.retryPayload!)}
                  disabled={running}
                >
                  <RotateCcw className="h-3 w-3" />
                  Reintentar
                </Button>
              )}
            </div>
            {msg.role === "user" && <User className="h-4 w-4 mt-1 text-muted-foreground shrink-0" />}
          </div>
        ))}

        {running && (
          <div className="flex gap-2 items-center">
            <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="bg-muted rounded-xl px-3 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border/50 space-y-2" onPaste={handlePaste}>
        {imagePreview && (
          <div className="relative inline-block">
            <img src={imagePreview} alt="Adjunto" className="h-16 rounded-lg border border-border/50" />
            <button
              onClick={clearImage}
              className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImageSelect(file);
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-9 w-9 shrink-0 p-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={running || regeneratingEvidence}
            title="Adjuntar captura (modo visual)"
          >
            <ImagePlus className="h-4 w-4" />
          </Button>
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Escribe instrucción o pega una imagen…"
            className="min-h-[36px] max-h-[80px] text-xs resize-none"
            onPaste={handlePaste}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button size="sm" className="h-9 w-9 shrink-0" onClick={handleSend} disabled={running || regeneratingEvidence || (!input.trim() && !imageBase64)}>
            {running || regeneratingEvidence ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
