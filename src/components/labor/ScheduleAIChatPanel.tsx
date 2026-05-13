import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Bot, Send, Loader2, Check, Clock, Users, ChevronDown, ChevronUp, Trash2, ChevronsUpDown, Copy, Brain, Eraser, User } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { ShiftConfig } from "./ShiftConfigPanel";

const DAYS_SHORT = ["D", "L", "M", "X", "J", "V", "S"];

interface GeneratedWeek {
  weekNumber: number;
  year: number;
  schedule: Record<string, Record<string, { type: string; start: string | null; end: string | null }>>;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: {
    hasSchedule?: boolean;
    weeks?: GeneratedWeek[];
    isQuestion?: boolean;
  };
  created_at: string;
}

interface ScheduleAIChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departmentId: string;
  departmentName: string;
  teams: { id: string; name: string }[];
  shifts: ShiftConfig[];
  selectedWeek: number;
  selectedYear: number;
  currentSchedule?: Record<string, Record<string, { type: string; start: string | null; end: string | null }>>;
  onApplyGenerated: (weekNumber: number, year: number, schedule: Record<string, Record<string, { type: string; start: string | null; end: string | null }>>) => void;
  onSaveWeek?: (weekNumber: number, year: number, schedule: Record<string, Record<string, { type: string; start: string | null; end: string | null }>>) => Promise<boolean>;
}

export const ScheduleAIChatPanel = ({
  open,
  onOpenChange,
  departmentId,
  departmentName,
  teams,
  shifts,
  selectedWeek,
  selectedYear,
  currentSchedule,
  onApplyGenerated,
  onSaveWeek,
}: ScheduleAIChatPanelProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [appliedWeeks, setAppliedWeeks] = useState<Set<string>>(new Set());
  const [showContext, setShowContext] = useState(false);
  const [weekCount, setWeekCount] = useState(4);
  const [savingProgress, setSavingProgress] = useState<string | null>(null);
  const [learnedRules, setLearnedRules] = useState<{ id: string; learned_rule: string }[]>([]);
  const [showRules, setShowRules] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const getNextWeek = () => {
    let sw = selectedWeek + 1;
    let sy = selectedYear;
    if (sw > 52) { sw = 1; sy += 1; }
    return { startWeek: sw, startYear: sy };
  };
  const { startWeek, startYear } = getNextWeek();

  // Load conversation on open
  const loadConversation = useCallback(async () => {
    if (!departmentId) return;
    setLoadingConversation(true);
    try {
      const { data, error } = await supabase.functions.invoke("schedule-ai-rules", {
        body: { action: "loadConversation", departmentId },
      });
      if (data?.messages) {
        setMessages(data.messages.map((m: any) => ({
          ...m,
          metadata: typeof m.metadata === 'string' ? JSON.parse(m.metadata) : (m.metadata || {}),
        })));
      }
    } catch (e) {
      console.error("Error loading conversation:", e);
    } finally {
      setLoadingConversation(false);
    }
  }, [departmentId]);

  const loadRules = useCallback(async () => {
    if (!departmentId) return;
    try {
      const { data } = await supabase
        .from("schedule_ai_memory")
        .select("id, learned_rule")
        .eq("department_id", departmentId)
        .order("created_at", { ascending: false })
        .limit(20);
      setLearnedRules(data || []);
    } catch { /* ignore */ }
  }, [departmentId]);

  useEffect(() => {
    if (open) {
      loadConversation();
      loadRules();
    }
  }, [open, loadConversation, loadRules]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    if (!teams?.length) {
      toast.error("No hay equipos configurados");
      return;
    }

    const savedInput = text;
    setInput("");
    setLoading(true);

    // Optimistic user bubble
    const tempId = `temp-${Date.now()}`;
    const tempMsg: ChatMessage = {
      id: tempId,
      role: "user",
      content: text,
      metadata: {},
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      // Build conversation history for context
      const conversationMessages = messages
        .filter(m => m.role === "user" || m.role === "assistant")
        .map(m => ({
          role: m.role,
          content: m.metadata?.hasSchedule
            ? `[Horario generado: ${(m.metadata.weeks || []).length} semanas]`
            : m.content,
        }));

      const { data, error } = await supabase.functions.invoke("schedule-ai-rules", {
        body: {
          departmentName,
          departmentId,
          teams: teams.map(t => ({ id: t.id, name: t.name })),
          shifts: shifts.map(s => ({
            shift_key: s.shift_key,
            name: s.name,
            start_time: s.start_time,
            end_time: s.end_time,
            is_rest: s.is_rest,
          })),
          conversationMessages,
          userMessage: text,
          weekCount,
          startWeek,
          startYear,
          currentSchedule: currentSchedule || null,
          currentWeek: selectedWeek,
          currentYear: selectedYear,
        },
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        setInput(savedInput); // Restore input on error
        setMessages(prev => prev.filter(m => m.id !== tempId));
        return;
      }

      // Replace temp message with saved one and add AI response
      setMessages(prev => {
        const without = prev.filter(m => m.id !== tempId);
        return without;
      });

      // Reload conversation to get all saved messages
      await loadConversation();

      if (data?.type === "schedule") {
        // Reset applied state so new schedule shows as unapplied
        setAppliedWeeks(new Set());
        toast.success(`Horario generado: ${data.data.weeks.length} semanas`);
      }
    } catch (err: any) {
      console.error("Chat error:", err);
      toast.error("Error al enviar mensaje. Tu texto se ha restaurado.");
      setInput(savedInput); // Restore input on error
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    try {
      await supabase.functions.invoke("schedule-ai-rules", {
        body: { action: "deleteMessage", messageId: msgId },
      });
      setMessages(prev => prev.filter(m => m.id !== msgId));
      toast.success("Mensaje eliminado");
    } catch {
      toast.error("Error al eliminar");
    }
  };

  const handleClearConversation = async () => {
    try {
      await supabase.functions.invoke("schedule-ai-rules", {
        body: { action: "clearConversation", departmentId },
      });
      setMessages([]);
      setAppliedWeeks(new Set());
      toast.success("Conversación limpiada");
    } catch {
      toast.error("Error al limpiar");
    }
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado");
  };

  const handleDeleteRule = async (ruleId: string) => {
    try {
      await supabase.from("schedule_ai_memory").delete().eq("id", ruleId);
      setLearnedRules(prev => prev.filter(r => r.id !== ruleId));
      toast.success("Regla eliminada");
    } catch {
      toast.error("Error al eliminar regla");
    }
  };

  const handleApply = async (week: GeneratedWeek) => {
    if (onSaveWeek) {
      // Save to DB first, THEN apply locally (which triggers re-fetch that will find saved data)
      const ok = await onSaveWeek(week.weekNumber, week.year, week.schedule);
      if (ok) {
        setAppliedWeeks(prev => new Set(prev).add(`${week.year}-${week.weekNumber}`));
        onApplyGenerated(week.weekNumber, week.year, week.schedule);
        toast.success(`Semana ${week.weekNumber} guardada y aplicada`);
      } else {
        toast.error(`Error al guardar semana ${week.weekNumber}`);
      }
    } else {
      onApplyGenerated(week.weekNumber, week.year, week.schedule);
      setAppliedWeeks(prev => new Set(prev).add(`${week.year}-${week.weekNumber}`));
      toast.success(`Semana ${week.weekNumber} aplicada`);
    }
  };

  const handleApplyAll = async (weeks: GeneratedWeek[]) => {
    if (!onSaveWeek) {
      for (const w of weeks) {
        onApplyGenerated(w.weekNumber, w.year, w.schedule);
        setAppliedWeeks(prev => new Set(prev).add(`${w.year}-${w.weekNumber}`));
      }
      toast.success(`${weeks.length} semanas aplicadas`);
      return;
    }
    let saved = 0;
    for (let i = 0; i < weeks.length; i++) {
      setSavingProgress(`Guardando ${i + 1}/${weeks.length}...`);
      const ok = await onSaveWeek(weeks[i].weekNumber, weeks[i].year, weeks[i].schedule);
      if (ok) {
        saved++;
        setAppliedWeeks(prev => new Set(prev).add(`${weeks[i].year}-${weeks[i].weekNumber}`));
      }
    }
    setSavingProgress(null);
    // Apply last week's view after all saved
    if (saved > 0) {
      const lastWeek = weeks[weeks.length - 1];
      onApplyGenerated(lastWeek.weekNumber, lastWeek.year, lastWeek.schedule);
    }
    toast.success(`${saved}/${weeks.length} semanas guardadas`);
  };

  const getShiftLabel = (shiftKey: string) => {
    const s = shifts.find(sh => sh.shift_key === shiftKey);
    if (s) return s.name;
    const defaults: Record<string, string> = { morning: "Mañana", afternoon: "Tarde", night: "Noche", rest: "Descanso", vacation: "Vacaciones" };
    return defaults[shiftKey] || shiftKey;
  };

  const getShiftColor = (shiftKey: string) => {
    if (shiftKey === "rest") return "bg-muted text-muted-foreground";
    if (shiftKey === "vacation") return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    const s = shifts.find(sh => sh.shift_key === shiftKey);
    if (s?.is_rest) return "bg-muted text-muted-foreground";
    return "bg-primary/10 text-primary";
  };

  const getTeamName = (teamId: string) => teams.find(t => t.id === teamId)?.name || teamId.slice(0, 6);

  const renderSchedulePreview = (weeks: GeneratedWeek[]) => (
    <div className="space-y-2 mt-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{savingProgress || `${weeks.length} semanas`}</span>
        <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => handleApplyAll(weeks)} disabled={!!savingProgress}>
          {savingProgress ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
          {savingProgress ? "Guardando..." : "Aplicar todas"}
        </Button>
      </div>
      {weeks.map((gw, idx) => {
        const weekKey = `${gw.year}-${gw.weekNumber}`;
        const isApplied = appliedWeeks.has(weekKey);
        const allTeamIds = new Set<string>();
        Object.values(gw.schedule).forEach(d => Object.keys(d).forEach(id => allTeamIds.add(id)));

        return (
          <Collapsible key={weekKey} defaultOpen={idx === 0}>
            <Card className={isApplied ? "border-primary/50 bg-primary/5" : ""}>
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between p-2 cursor-pointer hover:bg-muted/50 rounded-t-lg transition-colors">
                  <div className="flex items-center gap-1.5">
                    <ChevronsUpDown className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] font-medium">S{gw.weekNumber}/{gw.year}</span>
                    {isApplied && <Check className="h-3 w-3 text-primary" />}
                  </div>
                  <Button variant={isApplied ? "ghost" : "default"} size="sm" className="h-5 text-[10px] px-2"
                    onClick={(e) => { e.stopPropagation(); handleApply(gw); }} disabled={isApplied}>
                    {isApplied ? "✓" : "Aplicar"}
                  </Button>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-2 pt-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-[9px] border-collapse">
                      <thead>
                        <tr>
                          <th className="text-left p-0.5 border-b font-medium text-muted-foreground">Equipo</th>
                          {DAYS_SHORT.map((d, i) => (
                            <th key={i} className="p-0.5 border-b font-medium text-muted-foreground text-center min-w-[48px]">{d}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from(allTeamIds).map(teamId => (
                          <tr key={teamId} className="border-b last:border-0">
                            <td className="p-0.5 font-medium whitespace-nowrap">{getTeamName(teamId)}</td>
                            {DAYS_SHORT.map((_, di) => {
                              const cell = gw.schedule[String(di)]?.[teamId];
                              if (!cell) return <td key={di} className="p-0.5 text-center text-muted-foreground">—</td>;
                              return (
                                <td key={di} className="p-0.5 text-center">
                                  <span className={`inline-block px-1 py-0.5 rounded text-[8px] font-medium ${getShiftColor(cell.type)}`}>
                                    {getShiftLabel(cell.type)}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] p-0 flex flex-col bg-background [&>button.absolute]:right-2 [&>button.absolute]:top-2">
        {/* Header */}
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Bot className="h-5 w-5 text-primary" />
              Rotación IA — {departmentName}
            </DialogTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 text-xs mr-8" onClick={() => setShowContext(!showContext)}>
                <Users className="h-3 w-3 mr-1" />{teams.length} eq.
                {showContext ? <ChevronUp className="h-3 w-3 ml-0.5" /> : <ChevronDown className="h-3 w-3 ml-0.5" />}
              </Button>
              {messages.length > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={handleClearConversation}>
                  <Eraser className="h-3 w-3 mr-1" />Limpiar
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Desde S{startWeek}/{startYear} · {weekCount} semanas</span>
            <div className="ml-auto flex items-center gap-1">
              {[2, 4, 6, 8].map(n => (
                <Button key={n} variant={weekCount === n ? "default" : "outline"} size="sm"
                  className="h-5 w-6 text-[10px] p-0" onClick={() => setWeekCount(n)}>{n}</Button>
              ))}
            </div>
          </div>
        </DialogHeader>

        {/* Context panel */}
        {showContext && (
          <div className="px-4 py-2 border-b bg-muted/30">
            <div className="flex flex-wrap gap-1 mb-1">
              <span className="text-[10px] font-medium text-muted-foreground mr-1">Equipos:</span>
              {teams.map(t => <Badge key={t.id} variant="secondary" className="text-[9px] h-4">{t.name}</Badge>)}
            </div>
            <div className="flex flex-wrap gap-1">
              <span className="text-[10px] font-medium text-muted-foreground mr-1">Turnos:</span>
              {shifts.map(s => (
                <Badge key={s.id} variant="outline" className="text-[9px] h-4">
                  <Clock className="h-2 w-2 mr-0.5" />
                  {s.name} {s.is_rest ? "" : `${s.start_time}-${s.end_time}`}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Learned rules */}
        {learnedRules.length > 0 && (
          <Collapsible open={showRules} onOpenChange={setShowRules}>
            <CollapsibleTrigger asChild>
              <button className="w-full px-4 py-1.5 flex items-center gap-1.5 text-xs text-muted-foreground hover:bg-muted/30 border-b transition-colors">
                <Brain className="h-3 w-3" />
                {learnedRules.length} regla{learnedRules.length > 1 ? "s" : ""} aprendida{learnedRules.length > 1 ? "s" : ""}
                {showRules ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 py-2 space-y-1 border-b bg-muted/20 max-h-32 overflow-y-auto">
                {learnedRules.map(r => (
                  <div key={r.id} className="flex items-start gap-1.5 text-[11px] group">
                    <span className="flex-1 text-muted-foreground">{r.learned_rule}</span>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button className="p-0.5 rounded hover:bg-muted" onClick={() => handleCopyText(r.learned_rule)}>
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <button className="p-0.5 rounded hover:bg-destructive/10" onClick={() => handleDeleteRule(r.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Chat messages */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
          {loadingConversation && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loadingConversation && messages.length === 0 && (
            <div className="text-center py-12 space-y-2">
              <Bot className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Escribe las instrucciones de rotación y la IA generará el horario.
              </p>
              <p className="text-xs text-muted-foreground/60">
                Si algo no queda claro, la IA te preguntará antes de generar.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-2 group ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              {/* Avatar */}
              <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}>
                {msg.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
              </div>

              {/* Bubble */}
              <div className={`relative max-w-[85%] rounded-xl px-3 py-2 ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-tr-sm"
                  : "bg-muted rounded-tl-sm"
              }`}>
                {/* Message content */}
                {msg.metadata?.hasSchedule && msg.metadata.weeks ? (
                  <div>
                    <p className="text-xs mb-1">{msg.content}</p>
                    {renderSchedulePreview(msg.metadata.weeks)}
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                )}

                {/* Hover actions */}
                <div className={`absolute top-1 ${msg.role === "user" ? "-left-14" : "-right-14"} flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity`}>
                  <button className="p-1 rounded hover:bg-muted/80 bg-background border shadow-sm"
                    onClick={() => handleCopyText(msg.content)} title="Copiar">
                    <Copy className="h-3 w-3 text-muted-foreground" />
                  </button>
                  <button className="p-1 rounded hover:bg-destructive/10 bg-background border shadow-sm"
                    onClick={() => handleDeleteMessage(msg.id)} title="Eliminar">
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="flex gap-2">
              <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-muted">
                <Bot className="h-3.5 w-3.5" />
              </div>
              <div className="bg-muted rounded-xl rounded-tl-sm px-3 py-2">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Pensando...
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="shrink-0 border-t px-4 py-3 bg-background">
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={messages.length === 0
                ? `Describe la rotación para ${departmentName}...`
                : "Escribe correcciones o nuevas instrucciones..."
              }
              className="min-h-[44px] max-h-[120px] text-sm resize-none"
              disabled={loading}
              rows={1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 120) + "px";
              }}
            />
            <Button onClick={handleSend} disabled={loading || !input.trim()} size="icon" className="shrink-0 h-[44px] w-[44px]">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Enter para enviar · Shift+Enter para nueva línea</p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
