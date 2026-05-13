import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { History, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface ImportRecord {
  id: string;
  admin_name: string;
  total_csv_records: number;
  total_imported: number;
  total_ignored: number;
  notes: string | null;
  created_at: string;
}

export function BalanceHistoryTab() {
  const { toast } = useToast();
  const [history, setHistory] = useState<ImportRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const sessionToken = localStorage.getItem("manager_session_token") || localStorage.getItem("managerSessionToken");
      if (!sessionToken) {
        throw new Error("No session token");
      }

      const { data, error } = await supabase.functions.invoke("hour-balance-operations", {
        body: { action: "getImportHistory", sessionToken },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      setHistory(data.data || []);
    } catch (error: any) {
      console.error("Error fetching history:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo cargar el historial",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <History className="h-5 w-5" />
          Historial de Importaciones
        </CardTitle>
        <CardDescription>
          Registro de todas las importaciones de balances de horas
        </CardDescription>
      </CardHeader>

      <CardContent>
        {history.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No hay importaciones registradas</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Administrador</TableHead>
                  <TableHead className="text-center">CSV</TableHead>
                  <TableHead className="text-center">Importados</TableHead>
                  <TableHead className="text-center">Ignorados</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(record.created_at), "dd MMM yyyy, HH:mm", { locale: es })}
                    </TableCell>
                    <TableCell>{record.admin_name}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{record.total_csv_records}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className="bg-primary/20 text-primary">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        {record.total_imported}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {record.total_ignored > 0 ? (
                        <Badge variant="secondary">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          {record.total_ignored}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {record.notes || <span className="text-muted-foreground">-</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
