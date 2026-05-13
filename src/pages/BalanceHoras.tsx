import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useManagerAuth } from "@/hooks/useManagerAuth";
import LoadingScreen from "@/components/LoadingScreen";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BalanceListTab } from "@/components/balance/BalanceListTab";
import { BalanceImportTab } from "@/components/balance/BalanceImportTab";
import { BalanceHistoryTab } from "@/components/balance/BalanceHistoryTab";
import { BalanceSettingsTab } from "@/components/balance/BalanceSettingsTab";
import { Home, LogOut, List, Upload, History, Settings, MoreHorizontal } from "lucide-react";
import { LogoLink } from "@/components/LogoLink";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";

type BalanceTab = "balance" | "import" | "history" | "settings";

const primaryBalanceTabs: { id: BalanceTab; label: string; icon: typeof List }[] = [
  { id: "balance", label: "Listado", icon: List },
  { id: "import", label: "Importar", icon: Upload },
];

const secondaryBalanceTabs: { id: BalanceTab; label: string; icon: typeof History }[] = [
  { id: "history", label: "Historial", icon: History },
  { id: "settings", label: "Ajustes", icon: Settings },
];

export default function BalanceHoras({ embedded = false, activeTab: externalTab, onTabChange: externalOnTabChange }: { embedded?: boolean; activeTab?: string; onTabChange?: (tab: string) => void }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { manager, isLoading: authLoading, logout } = useManagerAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const resolvedTab = (embedded && externalTab) ? externalTab : undefined;
  const localTab = searchParams.get("tab") || "balance";
  const activeTab = (resolvedTab ?? localTab) as BalanceTab;
  
  const setActiveTab = (tab: string) => {
    if (embedded && externalOnTabChange) {
      externalOnTabChange(tab);
    } else {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (tab === "balance") next.delete("tab");
        else next.set("tab", tab);
        return next;
      }, { replace: true });
    }
  };
  const [refreshKey, setRefreshKey] = useState(0);

  // Check authentication and authorization
  useEffect(() => {
    if (embedded || authLoading) return;
    if (!manager) {
      navigate("/balance-horas/login", { replace: true });
      return;
    }
    if (manager.role !== "admin") {
      toast({
        title: "Acceso denegado",
        description: "Solo los administradores pueden acceder a esta herramienta",
        variant: "destructive",
      });
      navigate("/", { replace: true });
    }
  }, [manager, authLoading, navigate, toast, embedded]);

  const handleLogout = async () => {
    await logout();
    navigate("/balance-horas/login", { replace: true });
  };

  const handleImportComplete = () => {
    setRefreshKey((prev) => prev + 1);
    setActiveTab("balance");
  };

  if (!embedded && authLoading) {
    return <LoadingScreen />;
  }

  if (!embedded && (!manager || manager.role !== "admin")) {
    return <LoadingScreen />;
  }

  const isSecondaryActive = secondaryBalanceTabs.some(t => t.id === activeTab);
  const activeSecondaryLabel = secondaryBalanceTabs.find(t => t.id === activeTab)?.label;

  return (
    <div className={!embedded ? "min-h-screen bg-background flex flex-col" : "bg-background flex flex-col"}>
      {!embedded && (
      <header className="glass-header opacity-0 animate-fade-in-down">
...
      </header>
      )}

      {/* Pill tab navigation */}
      <div className="border-b border-border/20">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {primaryBalanceTabs.map(tab => {
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
              {secondaryBalanceTabs.map(tab => {
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
              {activeTab === "balance" && <BalanceListTab key={refreshKey} />}
              {activeTab === "import" && <BalanceImportTab onImportComplete={handleImportComplete} />}
              {activeTab === "history" && <BalanceHistoryTab />}
              {activeTab === "settings" && <BalanceSettingsTab />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
