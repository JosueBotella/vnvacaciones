/**
 * Control de Incidencias - Protected Page
 * Uses existing manager auth system.
 * Only admin and manager roles can access (consulta excluded).
 */
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useIncidenciasAuth } from "@/modules/control-incidencias/core/useIncidenciasAuth";
import { useManagerAuth } from "@/hooks/useManagerAuth";
import { IncidenciasLayout } from "@/components/incidencias/IncidenciasLayout";
import LoadingScreen from "@/components/LoadingScreen";

const ControlIncidenciasPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated: managerAuthenticated, isLoading: managerLoading } = useManagerAuth();
  const { isAuthenticated, isLoading, isAccessDenied, userContext } = useIncidenciasAuth();

  useEffect(() => {
    if (managerLoading || isLoading) return;
    if (!managerAuthenticated) {
      navigate("/control-incidencias/login", { replace: true });
      return;
    }
    if (isAccessDenied) {
      navigate("/", { replace: true });
    }
  }, [managerAuthenticated, managerLoading, isLoading, isAccessDenied, navigate]);

  if (managerLoading || isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated || !userContext) return null;

  const activeTab = searchParams.get("tab") || undefined;
  const handleTabChange = (tab: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab) next.set("tab", tab);
      else next.delete("tab");
      return next;
    }, { replace: true });
  };

  return <IncidenciasLayout userContext={userContext} activeTab={activeTab} onTabChange={handleTabChange} />;
};

export default ControlIncidenciasPage;
