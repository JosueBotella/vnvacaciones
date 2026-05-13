import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { toast } from "sonner";
import { LogOut, Users, UsersRound, Calendar, Clock, BarChart3, Upload, Settings, Home, LogIn, ArrowLeft, Key, Loader2, LayoutDashboard, MonitorOff, Mail, Activity, MoreHorizontal } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoLink } from "@/components/LogoLink";
import LoadingPanel from "@/components/LoadingPanel";

import { LaborSchedulesTab } from "@/components/labor/LaborSchedulesTab";
import { LaborTimetrackingTab } from "@/components/labor/LaborTimetrackingTab";
import { LaborSummariesTab } from "@/components/labor/LaborSummariesTab";
import { LaborSettingsTab } from "@/components/labor/LaborSettingsTab";
import { LaborDashboardTab } from "@/components/labor/LaborDashboardTab";
import { LaborWorkforceTab } from "@/components/labor/LaborWorkforceTab";
import { PerformanceImportPanel } from "@/components/labor/PerformanceImportPanel";
import { LaborPerformanceTab } from "@/components/labor/LaborPerformanceTab";
import { useManagerAuth } from "@/hooks/useManagerAuth";
import { cn } from "@/lib/utils";
import WorkerGroupsAdmin from "@/pages/WorkerGroupsAdmin";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";


const LaborModule = ({ embedded = false, activeTab: externalTab, onTabChange: externalOnTabChange }: { embedded?: boolean; activeTab?: string; onTabChange?: (tab: string) => void }) => {
  const navigate = useNavigate();
  const { loginByEmail, setPassword } = useManagerAuth();
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Tab state: use external props if embedded, otherwise useSearchParams
  const resolvedTab = (embedded && externalTab) ? externalTab : undefined;
  const [searchParams, setSearchParams] = useSearchParams();
  const localTab = searchParams.get("tab") || "dashboard";
  const activeTab = resolvedTab ?? localTab;
  
  const setActiveTab = (tab: string) => {
    if (embedded && externalOnTabChange) {
      externalOnTabChange(tab);
    } else {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (tab === "dashboard") next.delete("tab");
        else next.set("tab", tab);
        return next;
      }, { replace: true });
    }
  };
  
  // Login form state
  const [email, setEmail] = useState("");
  const [password, setPasswordValue] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [showSetPassword, setShowSetPassword] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    if (embedded) {
      setIsAuthenticated(true);
      setLoading(false);
      return;
    }
    
    const validateSession = async () => {
      // First check for existing manager session token
      const sessionToken = localStorage.getItem("manager_session_token");
      if (sessionToken) {
        try {
          // Validate the manager session
          const { data: response, error } = await supabase.functions.invoke('manager-auth', {
            body: { action: 'validateSession', sessionToken }
          });
          
          if (!isMounted) return;
          
          // Only clear session on explicit invalid/expired errors, not network errors
          if (error) {
            console.warn('Session validation network error:', error);
            // On network error, trust the local session temporarily
            setIsAuthenticated(true);
            setLoading(false);
            return;
          }
          
          if (response?.success && response?.manager?.role === 'admin') {
            setIsAuthenticated(true);
            setLoading(false);
            return;
          } else if (response?.error === 'Invalid session' || response?.error === 'Session expired' || response?.error === 'Invalid session token') {
            // Only clear on explicit session invalidity
            localStorage.removeItem("manager_session_token");
            localStorage.removeItem("manager_id");
            localStorage.removeItem("manager_name");
            localStorage.removeItem("manager_role");
          } else if (response?.manager?.role !== 'admin') {
            // Valid session but not admin - don't clear, just don't authenticate for this module
            console.log('Manager is not admin, access denied to labor module');
          }
        } catch (err) {
          console.warn('Session validation error:', err);
          // On any error, trust local session
          if (isMounted) {
            setIsAuthenticated(true);
            setLoading(false);
            return;
          }
        }
      }
      
      if (!isMounted) return;
      
      // Then check Supabase auth
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await checkAdminRole(session.user.id);
      } else {
        setLoading(false);
      }
    };

    validateSession();

    // Only subscribe to auth changes if we don't have a manager session
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      
      // Ignore auth changes if we have a valid manager session
      if (localStorage.getItem("manager_session_token")) {
        return;
      }
      
      if (session) {
        checkAdminRole(session.user.id);
      } else {
        setIsAuthenticated(false);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword.length < 4) {
      toast.error("La contraseña debe tener al menos 4 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }

    setLoginLoading(true);
    try {
      const response = await supabase.functions.invoke('manager-auth', {
        body: { action: 'setPasswordByEmail', email, newPassword }
      });
      if (response.data?.success) {
        toast.success("Contraseña establecida. Ahora inicia sesión.");
        setShowSetPassword(false);
        setNewPassword("");
        setConfirmPassword("");
      } else {
        toast.error(response.data?.error || "Error al establecer la contraseña");
      }
    } catch {
      toast.error("Error de conexión");
    }
    setLoginLoading(false);
  };

  const checkAdminRole = async (userId: string) => {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();
    
    if (roles?.role === "admin") {
      setIsAuthenticated(true);
    } else {
      setIsAuthenticated(false);
    }
    setLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      toast.error("Introduce tu email");
      return;
    }

    setLoginLoading(true);
    const result = await loginByEmail(email, password);
    
    if (result.locked) {
      toast.error(result.error || "Cuenta bloqueada temporalmente");
    } else if (result.success) {
      // Verify admin role from the stored session
      const storedSession = localStorage.getItem("manager_session");
      if (storedSession) {
        try {
          const mgr = JSON.parse(storedSession);
          if (mgr.role !== 'admin') {
            toast.error("Solo administradores pueden acceder a este módulo");
            setLoginLoading(false);
            return;
          }
        } catch {}
      }
      toast.success("Sesión iniciada");
      setIsAuthenticated(true);
    } else if (result.needsPassword) {
      setShowSetPassword(true);
      toast.info("Debes establecer tu contraseña primero");
    } else {
      const msg = result.remainingAttempts !== undefined && result.remainingAttempts <= 2
        ? `${result.error} (${result.remainingAttempts} intento${result.remainingAttempts !== 1 ? 's' : ''} restante${result.remainingAttempts !== 1 ? 's' : ''})`
        : (result.error || "Credenciales incorrectas");
      toast.error(msg);
    }
    setLoginLoading(false);
  };

  const handleLogout = async () => {
    // Simple logout (only this device)
    const sessionToken = localStorage.getItem("manager_session_token");
    if (sessionToken) {
      try {
        await supabase.functions.invoke('manager-auth', {
          body: { action: 'logout', sessionToken }
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
    }
    await supabase.auth.signOut();
    localStorage.removeItem("manager_session_token");
    localStorage.removeItem("manager_session");
    localStorage.removeItem("manager_id");
    localStorage.removeItem("manager_name");
    localStorage.removeItem("manager_role");
    setIsAuthenticated(false);
    navigate("/");
  };

  const handleLogoutAll = async () => {
    // Logout from all devices
    const sessionToken = localStorage.getItem("manager_session_token");
    if (sessionToken) {
      try {
        await supabase.functions.invoke('manager-auth', {
          body: { action: 'logoutAll', sessionToken }
        });
      } catch (error) {
        console.error('Logout all error:', error);
      }
    }
    await supabase.auth.signOut();
    localStorage.removeItem("manager_session_token");
    localStorage.removeItem("manager_session");
    localStorage.removeItem("manager_id");
    localStorage.removeItem("manager_name");
    localStorage.removeItem("manager_role");
    setIsAuthenticated(false);
    navigate("/");
    toast.success("Sesión cerrada en todos los dispositivos");
  };

  if (loading) {
    return <LoadingPanel />;
  }

  // Show login form if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-3 py-4 sm:p-4">
        <div className="fixed top-4 left-4 z-50 animate-fade-in">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
        </div>
        <div className="fixed right-4 z-50 animate-fade-in" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}>
          <ThemeToggle />
        </div>
        
        <Card className="w-full max-w-md shadow-xl border-border/50 opacity-0 animate-scale-in overflow-hidden">
          <CardHeader className="space-y-2 text-center px-4 sm:px-6">
            <div className="flex justify-center mb-4 md:mb-6">
              <LogoLink to="/" className="h-16 w-16 md:h-20 md:w-20 object-contain" />
            </div>
            <CardTitle className="text-2xl md:text-3xl font-semibold text-primary tracking-tight">
              Gestión de Personal
            </CardTitle>
            <CardDescription className="font-light tracking-tight">
              Módulo Laboral - Acceso administrador
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            <form onSubmit={showSetPassword ? handleSetPassword : handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="tu@verdnatura.es"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setShowSetPassword(false); }}
                    className="pl-9 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              {showSetPassword ? (
                <div className="animate-fade-in space-y-4">
                  <div className="bg-primary/10 rounded-xl p-4 text-sm">
                    <div className="flex items-center gap-2 text-primary font-medium mb-1">
                      <Key className="h-4 w-4" />
                      Primera vez
                    </div>
                    <p className="text-muted-foreground">
                      Establece tu contraseña para acceder al sistema.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">Nueva contraseña</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                      required
                    />
                  </div>
                  <Button 
                    type="submit"
                    className="w-full rounded-xl font-normal h-12 text-base transition-all duration-200 active:scale-[0.98]"
                    disabled={loginLoading}
                  >
                    {loginLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <Key className="mr-2 h-4 w-4" />
                        Establecer contraseña
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="password">Contraseña</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPasswordValue(e.target.value)}
                      className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                      required
                    />
                  </div>
                  <Button 
                    type="submit"
                    className="w-full rounded-xl font-normal h-12 text-base transition-all duration-200 active:scale-[0.98]"
                    disabled={loginLoading}
                  >
                    {loginLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Iniciando sesión...
                      </>
                    ) : (
                      <>
                        <LogIn className="mr-2 h-4 w-4" />
                        Iniciar sesión
                      </>
                    )}
                  </Button>
                </>
              )}
            </form>

            <div className="text-xs text-center text-muted-foreground font-light mt-6 space-y-1">
              <p>Utiliza tu correo corporativo: <span className="font-medium">nombre@verdnatura.es</span></p>
              <p>Solo administradores pueden acceder</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const laborPrimaryTabs = [
    { id: "dashboard", label: "Inicio", icon: LayoutDashboard },
    { id: "trabajadores", label: "Trabajadores", icon: Users },
    { id: "schedules", label: "Horarios", icon: Calendar },
  ];

  const laborSecondaryTabs = [
    { id: "plantilla", label: "Plantilla", icon: UsersRound },
    { id: "timetracking", label: "Fichajes", icon: Clock },
    { id: "performance", label: "Rendimiento", icon: Activity },
    { id: "summaries", label: "Resúmenes", icon: BarChart3 },
    { id: "imports", label: "Importaciones", icon: Upload },
    { id: "settings", label: "Ajustes", icon: Settings },
  ];

  const isSecondaryActive = laborSecondaryTabs.some(t => t.id === activeTab);
  const activeSecondaryLabel = laborSecondaryTabs.find(t => t.id === activeTab)?.label;

  return (
    <div className={cn("bg-background flex flex-col", !embedded && "min-h-screen")}>
      {!embedded && (
      <header className="glass-header">
...
      </header>
      )}

      {/* Pill tab navigation */}
      <div className="border-b border-border/20">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {laborPrimaryTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap shrink-0",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}>
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap shrink-0",
                isSecondaryActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              )}>
                <MoreHorizontal className="h-3.5 w-3.5" />
                {isSecondaryActive ? activeSecondaryLabel : "Más"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {laborSecondaryTabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <DropdownMenuItem key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className={cn(activeTab === tab.id && "bg-accent")}>
                    <Icon className="h-4 w-4 mr-2" />
                    {tab.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {activeTab === "dashboard" && <LaborDashboardTab onNavigateTab={setActiveTab} />}
              {activeTab === "performance" && <LaborPerformanceTab />}
              {activeTab === "trabajadores" && <WorkerGroupsAdmin embedded />}
              {activeTab === "schedules" && <LaborSchedulesTab />}
              {activeTab === "plantilla" && <LaborWorkforceTab />}
              {activeTab === "timetracking" && <LaborTimetrackingTab />}
              {activeTab === "summaries" && <LaborSummariesTab />}
              {activeTab === "imports" && <PerformanceImportPanel />}
              {activeTab === "settings" && <LaborSettingsTab />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

export default LaborModule;
