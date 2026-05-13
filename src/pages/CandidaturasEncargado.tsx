import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useManagerAuth } from "@/hooks/useManagerAuth";
import { supabase } from "@/integrations/supabase/client";
import LoadingScreen from "@/components/LoadingScreen";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoLink } from "@/components/LogoLink";
import { LogOut, CalendarDays, Eye, ArrowLeft } from "lucide-react";
import { EncargadoEntrevistasView } from "@/components/candidaturas/EncargadoEntrevistasView";
import { ManagerAvatar } from "@/components/candidaturas/ManagerAvatar";
import { ManagerProfileDrawer } from "@/components/candidaturas/ManagerProfileDrawer";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Dedicated, minimal panel for managers with `candidaturas_only = true`.
 * They can only see and evaluate interviews — no other modules.
 *
 * Supports admin preview mode via `?preview=<managerId>`: shows the panel
 * exactly as the previewed manager would see it, with a banner + back button.
 */
export default function CandidaturasEncargado() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const previewId = searchParams.get("preview");
  const { manager, isAuthenticated, isLoading, logout } = useManagerAuth();
  const isPreviewMode = !!(previewId && manager?.role === "admin");
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [localProfile, setLocalProfile] = useState<{ email?: string | null; avatar_url?: string | null }>({});

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !manager) {
      navigate("/admin/candidaturas/login", { replace: true });
      return;
    }
    // Admin preview: load previewed manager's name + avatar
    if (isPreviewMode && previewId) {
      (async () => {
        const { data } = await supabase.rpc("get_public_managers");
        const m = data?.find((x: any) => x.id === previewId);
        if (m) {
          setPreviewName(m.name);
          setPreviewAvatar(m.avatar_url || null);
        }
      })();
      return;
    }
    // If user has full access (and is NOT in preview), send them to the regular admin panel
    if ((manager.role === "admin" || manager.role === "consulta") && !manager.candidaturas_only) {
      navigate("/admin?module=candidaturas&tab=candidaturas", { replace: true });
    }
  }, [isAuthenticated, isLoading, manager, navigate, isPreviewMode, previewId]);

  const handleLogout = () => {
    logout();
    navigate("/admin/candidaturas/login", { replace: true });
  };

  const handleExitPreview = () => {
    navigate("/admin", { replace: true });
  };

  if (isLoading || !manager) return <LoadingScreen />;

  return (
    <div className="min-h-screen bg-background">
      {isPreviewMode && (
        <div className="sticky top-0 z-50 bg-amber-500/10 border-b border-amber-500/30 backdrop-blur-xl">
          <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 min-w-0">
              <Eye className="h-3.5 w-3.5 shrink-0" />
              <span className="font-medium truncate">
                Vista previa{previewName ? `: ${previewName}` : "…"}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExitPreview}
              className="h-7 px-2 gap-1.5 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="text-xs">Volver</span>
            </Button>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 border-b border-border/30 bg-background/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <LogoLink to="/" className="h-8 w-8 object-contain shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm font-semibold tracking-tight truncate flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-blue-500" />
                Entrevistas
              </h1>
              <p className="text-[10px] text-muted-foreground font-light truncate">
                {isPreviewMode ? previewName || "Cargando…" : manager.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            {!isPreviewMode ? (
              <>
                <button
                  type="button"
                  onClick={() => setProfileOpen(true)}
                  className="rounded-full hover:opacity-80 transition-opacity ml-1"
                  aria-label="Mi perfil"
                  title="Mi perfil"
                >
                  <ManagerAvatar
                    name={manager.name}
                    avatarUrl={localProfile.avatar_url !== undefined ? localProfile.avatar_url : (manager as any).avatar_url}
                    size="md"
                    showTooltip={false}
                  />
                </button>
                <Button variant="ghost" size="sm" onClick={handleLogout} className="h-8 px-2 gap-1.5">
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline text-xs">Salir</span>
                </Button>
              </>
            ) : (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-1">
                      <ManagerAvatar
                        name={previewName}
                        avatarUrl={previewAvatar}
                        size="md"
                        showTooltip={false}
                        className="opacity-60"
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Edición de perfil no disponible en vista previa
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </header>

      <ManagerProfileDrawer
        open={profileOpen}
        onOpenChange={setProfileOpen}
        manager={
          manager
            ? {
                id: manager.id,
                name: manager.name,
                email: localProfile.email !== undefined ? localProfile.email : (manager as any).email,
                avatar_url: localProfile.avatar_url !== undefined ? localProfile.avatar_url : (manager as any).avatar_url,
              }
            : null
        }
        adminMode={false}
        allowPasswordChange={true}
        onSaved={(updates) => setLocalProfile((prev) => ({ ...prev, ...updates }))}
      />

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-5">
          <h2 className="text-2xl font-semibold tracking-tight">Mi calendario de entrevistas</h2>
          <p className="text-sm text-muted-foreground font-light tracking-tight mt-1">
            Consulta las entrevistas, descarga CVs y registra tu evaluación.
          </p>
        </div>
        <EncargadoEntrevistasView previewManagerId={isPreviewMode ? previewId : null} />
      </main>
    </div>
  );
}
