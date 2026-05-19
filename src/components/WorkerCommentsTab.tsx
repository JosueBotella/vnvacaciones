import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  MessageSquare,
  Send,
  Check,
  Trash2,
  History,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useManagerAuth } from "@/modules/auth/hooks/useManagerAuth";

type WorkerComment = {
  id: string;
  worker_id: string;
  comment: string;
  is_resolved: boolean;
  resolved_at: string | null;
  created_at: string;
  created_by?: string;
  resolved_by?: string;
};

interface WorkerCommentsTabProps {
  workerId: string;
  workerName: string;
}

export const WorkerCommentsTab = ({ workerId, workerName }: WorkerCommentsTabProps) => {
  const { getSessionToken, manager } = useManagerAuth();
  const [comments, setComments] = useState<WorkerComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  
  // Cache to prevent unnecessary reloads
  const cacheRef = useRef<{ comments: WorkerComment[]; fetchedAt: number } | null>(null);
  const CACHE_TTL = 60000; // 1 minute

  useEffect(() => {
    fetchComments();
  }, [workerId]);

  const fetchComments = async (forceRefresh = false) => {
    const sessionToken = getSessionToken();
    if (!sessionToken) return;

    // Check cache
    if (!forceRefresh && cacheRef.current && Date.now() - cacheRef.current.fetchedAt < CACHE_TTL) {
      setComments(cacheRef.current.comments);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "getWorkerComments",
          sessionToken,
          data: { workerId },
        },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || "Error al cargar comentarios");
      }

      const fetchedComments = data.comments || [];
      setComments(fetchedComments);
      cacheRef.current = { comments: fetchedComments, fetchedAt: Date.now() };
    } catch (err: any) {
      console.error("Error fetching comments:", err);
      toast.error(err.message || "Error al cargar comentarios");
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async () => {
    const sessionToken = getSessionToken();
    if (!sessionToken || !newComment.trim()) return;

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "addWorkerComment",
          sessionToken,
          data: {
            workerId,
            comment: newComment.trim(),
            createdBy: manager?.name || "Admin",
          },
        },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || "Error al añadir comentario");
      }

      toast.success("Comentario añadido");
      setNewComment("");
      
      // Optimistic update
      const newCommentObj: WorkerComment = {
        id: data.commentId || crypto.randomUUID(),
        worker_id: workerId,
        comment: newComment.trim(),
        is_resolved: false,
        resolved_at: null,
        created_at: new Date().toISOString(),
        created_by: manager?.name || "Admin",
      };
      setComments(prev => [newCommentObj, ...prev]);
      cacheRef.current = null; // Invalidate cache
    } catch (err: any) {
      console.error("Error adding comment:", err);
      toast.error(err.message || "Error al añadir comentario");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async (commentId: string) => {
    const sessionToken = getSessionToken();
    if (!sessionToken) return;

    try {
      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "resolveWorkerComment",
          sessionToken,
          data: {
            commentId,
            resolvedBy: manager?.name || "Admin",
          },
        },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || "Error al resolver comentario");
      }

      // Optimistic update
      setComments(prev =>
        prev.map(c =>
          c.id === commentId
            ? { ...c, is_resolved: true, resolved_at: new Date().toISOString(), resolved_by: manager?.name }
            : c
        )
      );
      cacheRef.current = null;
      toast.success("Comentario resuelto");
    } catch (err: any) {
      console.error("Error resolving comment:", err);
      toast.error(err.message || "Error al resolver comentario");
    }
  };

  const handleDelete = async (commentId: string) => {
    const sessionToken = getSessionToken();
    if (!sessionToken) return;

    try {
      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "deleteWorkerComment",
          sessionToken,
          data: { commentId },
        },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || "Error al eliminar comentario");
      }

      // Optimistic update
      setComments(prev => prev.filter(c => c.id !== commentId));
      cacheRef.current = null;
      toast.success("Comentario eliminado");
    } catch (err: any) {
      console.error("Error deleting comment:", err);
      toast.error(err.message || "Error al eliminar comentario");
    }
  };

  const activeComments = comments.filter(c => !c.is_resolved);
  const resolvedComments = comments.filter(c => c.is_resolved);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="h-5 w-5" />
          Comentarios de {workerName}
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fetchComments(true)}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Comment */}
        <div className="flex gap-2">
          <Textarea
            placeholder="Escribir un comentario..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="min-h-[80px] resize-none"
          />
          <Button
            onClick={handleAddComment}
            disabled={submitting || !newComment.trim()}
            className="self-end"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Toggle Resolved */}
        <div className="flex items-center gap-2">
          <Switch
            id="showResolved"
            checked={showResolved}
            onCheckedChange={setShowResolved}
          />
          <Label htmlFor="showResolved" className="text-sm text-muted-foreground cursor-pointer">
            Mostrar comentarios resueltos ({resolvedComments.length})
          </Label>
        </div>

        {/* Comments List */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {activeComments.length === 0 && !showResolved && (
                <div className="text-center py-8 text-muted-foreground">
                  No hay comentarios activos
                </div>
              )}

              {/* Active Comments */}
              {activeComments.map((comment) => (
                <div
                  key={comment.id}
                  className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/30 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm flex-1 whitespace-pre-wrap">{comment.comment}</p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-emerald-500 hover:text-emerald-600"
                        onClick={() => handleResolve(comment.id)}
                        title="Marcar como resuelto"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive/80"
                        onClick={() => handleDelete(comment.id)}
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{format(new Date(comment.created_at), "d MMM yyyy, HH:mm", { locale: es })}</span>
                    {comment.created_by && (
                      <>
                        <span>•</span>
                        <span>{comment.created_by}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}

              {/* Resolved Comments */}
              {showResolved && resolvedComments.length > 0 && (
                <>
                  {activeComments.length > 0 && (
                    <div className="flex items-center gap-2 py-2">
                      <History className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground font-medium">
                        Comentarios resueltos
                      </span>
                    </div>
                  )}
                  {resolvedComments.map((comment) => (
                    <div
                      key={comment.id}
                      className="p-3 bg-muted/30 rounded-lg border border-border/50 space-y-2 opacity-70"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm flex-1 whitespace-pre-wrap line-through">
                          {comment.comment}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive/80"
                          onClick={() => handleDelete(comment.id)}
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-xs h-5">
                          Resuelto
                        </Badge>
                        {comment.resolved_at && (
                          <span>
                            {format(new Date(comment.resolved_at), "d MMM yyyy", { locale: es })}
                          </span>
                        )}
                        {comment.resolved_by && (
                          <>
                            <span>•</span>
                            <span>por {comment.resolved_by}</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
