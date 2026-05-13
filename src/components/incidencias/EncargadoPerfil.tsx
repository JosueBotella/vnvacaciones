import { useState, useEffect } from "react";
import { LogOut, Building2, User, Loader2, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { IncidenciasUserContext } from "@/modules/control-incidencias/core/types";
import { useNavigate } from "react-router-dom";

interface Props {
  userContext: IncidenciasUserContext;
}

export function EncargadoPerfil({ userContext }: Props) {
  const navigate = useNavigate();
  const sessionToken = localStorage.getItem("manager_session_token") || "";
  const [deptNames, setDeptNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [activeDept, setActiveDept] = useState<string>(userContext.departmentIds[0] || "");

  useEffect(() => {
    async function loadDepts() {
      try {
        const { data } = await supabase.functions.invoke("incidencias-operations", {
          body: { action: "listIncidenciasDepartments", sessionToken },
        });
        const names: Record<string, string> = {};
        for (const d of (data?.departments || [])) {
          names[d.id] = d.name;
        }
        setDeptNames(names);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadDepts();
  }, [sessionToken]);

  const handleLogout = () => {
    localStorage.removeItem("manager_session_token");
    localStorage.removeItem("manager_id");
    localStorage.removeItem("manager_name");
    localStorage.removeItem("manager_role");
    navigate("/control-incidencias/login");
  };

  const initial = userContext.managerName?.charAt(0)?.toUpperCase() || "?";

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      {/* Avatar + name */}
      <div className="flex flex-col items-center gap-3">
        <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-3xl font-bold text-primary">{initial}</span>
        </div>
        <div className="text-center">
          <p className="text-xl font-semibold">{userContext.managerName}</p>
          <Badge variant="secondary" className="mt-1">
            {userContext.role === 'admin' ? 'Administrador' : 'Encargado'}
          </Badge>
        </div>
      </div>

      {/* Department selector */}
      {userContext.departmentIds.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Departamento activo</h3>
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-2">
              {userContext.departmentIds.map((id) => {
                const isActive = activeDept === id;
                return (
                  <Card
                    key={id}
                    className={`rounded-2xl cursor-pointer transition-all ${isActive ? 'ring-2 ring-primary border-primary' : 'border-border/30 hover:border-border'}`}
                    onClick={() => setActiveDept(id)}
                  >
                    <CardContent className="p-4 flex items-center gap-3">
                      <Building2 className="h-5 w-5 text-primary" />
                      <span className="text-sm font-medium flex-1">{deptNames[id] || id}</span>
                      {isActive && (
                        <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                          <Check className="h-4 w-4 text-primary-foreground" />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Button variant="destructive" className="w-full h-14 rounded-xl text-base" onClick={handleLogout}>
        <LogOut className="h-5 w-5 mr-2" />
        Cerrar sesión
      </Button>

      <p className="text-center text-[10px] text-muted-foreground">v2.0 · Panel Producción</p>
    </div>
  );
}
