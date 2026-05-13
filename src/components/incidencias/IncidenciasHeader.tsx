import { useNavigate } from "react-router-dom";
import { LogOut, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoLink } from "@/components/LogoLink";
import { useManagerAuth } from "@/hooks/useManagerAuth";
import { NotificationsBell } from "./NotificationsBell";
import type { IncidenciasUserContext } from "@/modules/control-incidencias/core/types";

interface Props {
  userContext: IncidenciasUserContext;
}

export function IncidenciasHeader({ userContext }: Props) {
  const navigate = useNavigate();
  const { logout } = useManagerAuth();
  const isAdmin = userContext.role === "admin";
  const homeRoute = "/";

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="glass-header">
      <div className="flex items-center justify-between px-4 h-12 md:h-16 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <LogoLink to="/" className="h-7 w-7 md:h-9 md:w-9 object-contain" />
          <h1 className="text-xs md:text-sm font-semibold text-foreground leading-tight">Panel Producción</h1>
          <p className="hidden sm:block text-[11px] text-muted-foreground leading-tight">
            {userContext.managerName} · <span className="capitalize">{userContext.role}</span>
          </p>
        </div>
        {/* Desktop only controls */}
        <div className="hidden md:flex items-center gap-1.5">
          <NotificationsBell />
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={() => navigate(homeRoute)} className="h-9 w-9" title={isAdmin ? "Panel Admin" : "Inicio"}>
            <Home className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="h-9 w-9 text-destructive hover:text-destructive">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
        {/* Mobile: bell + theme + (home if admin) + logout */}
        <div className="flex items-center gap-1 md:hidden">
          <NotificationsBell />
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={() => navigate(homeRoute)} className="h-8 w-8" title="Inicio">
            <Home className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="h-8 w-8 text-destructive hover:text-destructive">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
