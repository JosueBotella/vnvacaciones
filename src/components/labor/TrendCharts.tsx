import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { TrendingUp } from "lucide-react";
import { format, parseISO, eachDayOfInterval, eachWeekOfInterval, startOfWeek, endOfWeek } from "date-fns";
import { es } from "date-fns/locale";

type TimeEntry = {
  id: string;
  worker_id: string;
  entry_date: string;
  delay_minutes: number | null;
  is_absence: boolean;
};

type ViewMode = "weekly" | "monthly";

interface TrendChartsProps {
  timeEntries: TimeEntry[];
  viewMode: ViewMode;
  dateRange: { start: Date; end: Date };
  delayThreshold: number;
}

export function TrendCharts({ timeEntries, viewMode, dateRange, delayThreshold }: TrendChartsProps) {
  // Daily trend data
  const dailyTrendData = useMemo(() => {
    const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end });
    
    return days.map(day => {
      const dayStr = format(day, "yyyy-MM-dd");
      const dayEntries = timeEntries.filter(e => e.entry_date === dayStr);
      
      const delays = dayEntries.filter(e => (e.delay_minutes || 0) >= delayThreshold).length;
      const absences = dayEntries.filter(e => e.is_absence).length;
      const totalDelayMinutes = dayEntries.reduce((sum, e) => sum + (e.delay_minutes || 0), 0);
      
      return {
        date: dayStr,
        label: format(day, "EEE d", { locale: es }),
        shortLabel: format(day, "d"),
        delays,
        absences,
        avgDelay: dayEntries.length > 0 ? Math.round(totalDelayMinutes / dayEntries.length) : 0,
        total: delays + absences
      };
    });
  }, [timeEntries, dateRange, delayThreshold]);

  // Weekly trend data (for monthly view)
  const weeklyTrendData = useMemo(() => {
    if (viewMode !== "monthly") return [];
    
    const weeks = eachWeekOfInterval(
      { start: dateRange.start, end: dateRange.end },
      { weekStartsOn: 1 }
    );
    
    return weeks.map(weekStart => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const weekEntries = timeEntries.filter(e => {
        const entryDate = parseISO(e.entry_date);
        return entryDate >= weekStart && entryDate <= weekEnd;
      });
      
      const delays = weekEntries.filter(e => (e.delay_minutes || 0) >= delayThreshold).length;
      const absences = weekEntries.filter(e => e.is_absence).length;
      const totalDelayMinutes = weekEntries.reduce((sum, e) => sum + (e.delay_minutes || 0), 0);
      
      return {
        label: `${format(weekStart, "d MMM", { locale: es })}`,
        delays,
        absences,
        avgDelay: weekEntries.length > 0 ? Math.round(totalDelayMinutes / weekEntries.length) : 0,
        total: delays + absences
      };
    });
  }, [timeEntries, viewMode, dateRange, delayThreshold]);

  const chartData = viewMode === "weekly" ? dailyTrendData : weeklyTrendData;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
          <p className="font-medium mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.name}: <strong>{entry.value}</strong>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (chartData.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Incidents Bar Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            Incidencias por {viewMode === "weekly" ? "Día" : "Semana"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey={viewMode === "weekly" ? "shortLabel" : "label"} 
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                />
                <YAxis 
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  wrapperStyle={{ fontSize: "12px" }}
                  iconType="circle"
                />
                <Bar 
                  dataKey="delays" 
                  name="Retrasos" 
                  fill="hsl(var(--chart-2))"
                  radius={[4, 4, 0, 0]}
                />
                <Bar 
                  dataKey="absences" 
                  name="Ausencias" 
                  fill="hsl(var(--chart-1))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Trend Line Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            Tendencia de Incidencias
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey={viewMode === "weekly" ? "shortLabel" : "label"} 
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                />
                <YAxis 
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  wrapperStyle={{ fontSize: "12px" }}
                  iconType="circle"
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Total Incidencias"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="avgDelay"
                  name="Promedio Retraso (min)"
                  stroke="hsl(var(--chart-3))"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ fill: "hsl(var(--chart-3))", strokeWidth: 2, r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
