import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Copy } from "lucide-react";
import { toast } from "sonner";
import { EmbeddedAnnualCalendar } from "@/components/EmbeddedAnnualCalendar";

type Department = {
  id: string;
  name: string;
  slug: string | null;
};

interface Props {
  departments: Department[];
  selectedDepartment: string;
  loading: boolean;
}

export function ConsultaCalendarsPanel({ departments, selectedDepartment, loading }: Props) {
  const handleCopyCalendarLink = () => {
    const dept = departments.find(d => d.id === selectedDepartment);
    if (!dept?.slug) {
      toast.error("Departamento sin slug configurado");
      return;
    }
    const url = `${window.location.origin}/calendario/${dept.slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Enlace del calendario copiado");
  };

  if (loading) {
    return (
      <Card className="shadow-md">
        <CardHeader>
          <Skeleton className="h-8 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full sm:w-64" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (departments.length === 0) {
    return (
      <Card className="shadow-md">
        <CardContent className="py-12 text-center text-muted-foreground">
          No hay calendarios disponibles
        </CardContent>
      </Card>
    );
  }

  const selectedDept = departments.find(d => d.id === selectedDepartment);

  return (
    <Card className="shadow-md">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-lg md:text-xl font-semibold tracking-tight flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Calendarios Anuales
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {selectedDept?.name || "Selecciona un departamento"}
            </p>
          </div>
          {selectedDept?.slug && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopyCalendarLink}
              className="rounded-xl gap-2 self-start sm:self-auto"
            >
              <Copy className="h-4 w-4" />
              <span className="hidden sm:inline">Copiar enlace</span>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {selectedDepartment ? (
          <EmbeddedAnnualCalendar
            key={selectedDepartment}
            departmentId={selectedDepartment}
            departmentSlug={selectedDept?.slug || undefined}
          />
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Selecciona un departamento para ver el calendario
          </div>
        )}
      </CardContent>
    </Card>
  );
}
