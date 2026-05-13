import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ClockControlPanel } from "./ClockControlPanel";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Upload, Calendar as CalendarIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export const LaborTimetrackingTab = () => {
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [uploading, setUploading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const csvFileRef = useRef<HTMLInputElement>(null);

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const text = await file.text();
      const lines = text.trim().split(/\r?\n/);
      const dataLines = lines.slice(1);
      const parsed: any[] = [];
      for (const line of dataLines) {
        const cols = line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
        if (cols.length < 6) continue;
        parsed.push({
          worker_number: cols[0],
          worker_name: cols[1],
          department_name: cols[2],
          punch_date: cols[3],
          punch_time: cols[4],
          direction: cols[5],
        });
      }
      if (parsed.length === 0) {
        toast.error("No se encontraron fichadas en el CSV");
        return;
      }
      const { data: res } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "importSalixClock",
          sessionToken: localStorage.getItem("manager_session_token"),
          data: { entries: parsed },
        },
      });
      if (res?.success) {
        toast.success(`Importadas ${res.imported} fichadas. ${res.matched} vinculadas, ${res.unmatched} sin vincular.`);
        setRefreshKey((k) => k + 1);
      } else {
        toast.error(res?.error || "Error al importar");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error al procesar el CSV");
    }
    setUploading(false);
    e.target.value = "";
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Fichajes</h2>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 font-normal">
                <CalendarIcon className="h-4 w-4" />
                {format(parseISO(selectedDate), "dd MMM yyyy", { locale: es })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={parseISO(selectedDate)}
                onSelect={(date) => date && setSelectedDate(format(date, "yyyy-MM-dd"))}
                initialFocus
                className="p-3 pointer-events-auto"
                locale={es}
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => csvFileRef.current?.click()} disabled={uploading}>
            <Upload className="h-4 w-4" />
            {uploading ? "Importando..." : "CSV Salix"}
          </Button>
          <input ref={csvFileRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
        </div>
      </div>

      {/* Panel único */}
      <ClockControlPanel selectedDate={selectedDate} key={refreshKey} />
    </div>
  );
};
