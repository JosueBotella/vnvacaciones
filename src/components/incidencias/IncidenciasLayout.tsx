import { useIncidenciasAuth } from "@/modules/control-incidencias/core/useIncidenciasAuth";
import type { IncidenciasUserContext } from "@/modules/control-incidencias/core/types";
import { EncargadoPanel } from "./EncargadoPanel";
import { AdminPanel } from "./AdminPanel";

interface Props {
  userContext: IncidenciasUserContext;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export function IncidenciasLayout({ userContext, activeTab, onTabChange }: Props) {
  if (userContext.role === "admin") {
    return <AdminPanel userContext={userContext} activeTab={activeTab} onTabChange={onTabChange} />;
  }
  return <EncargadoPanel userContext={userContext} activeTab={activeTab} onTabChange={onTabChange} />;
}
