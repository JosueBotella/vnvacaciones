import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { 
  Search, 
  Calendar, 
  CheckCircle, 
  ArrowLeft, 
  User, 
  Building2,
  Loader2,
  Info,
  Shield
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSelector } from "@/components/LanguageSelector";
import { LanguageProvider, useLanguage } from "@/hooks/useLanguage";
import { HalfDayCalendar, DaySelection } from "@/components/HalfDayCalendar";
import { format, addMonths, startOfMonth, eachDayOfInterval, endOfMonth, isSaturday, isSunday } from "date-fns";
import { es } from "date-fns/locale";
import { LogoLink } from "@/components/LogoLink";
import LoadingScreen from "@/components/LoadingScreen";

type SearchedWorker = {
  id: string;
  name: string;
  workerNumber: string;
  email: string | null;
  departmentId: string;
  departmentName: string;
  departmentToken: string | null;
};

const AdminVacationRequestContent = () => {
  const navigate = useNavigate();
  const { t, isRTL } = useLanguage();
  const [adminWorkerNumber, setAdminWorkerNumber] = useState("");
  const [adminName, setAdminName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);

  // Worker search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchedWorker[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<SearchedWorker | null>(null);

  // Calendar state
  const [selectedDays, setSelectedDays] = useState<DaySelection[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Generate all available days (next 18 months of weekdays)
  const [availableDays, setAvailableDays] = useState<DaySelection[]>([]);

  useEffect(() => {
    // Generate weekdays for the next 18 months
    const today = new Date();
    const endDate = addMonths(today, 18);
    const start = startOfMonth(today);
    const end = endOfMonth(endDate);
    
    const allDays = eachDayOfInterval({ start, end });
    const weekdays = allDays.filter(d => !isSaturday(d) && !isSunday(d));
    
    const days: DaySelection[] = weekdays.map(d => ({
      date: format(d, 'yyyy-MM-dd'),
      halfDay: false
    }));
    
    setAvailableDays(days);
  }, []);

  const handleVerifyAdmin = async () => {
    if (!adminWorkerNumber.trim()) {
      toast.error("Introduce tu número de fichar");
      return;
    }

    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-vacation-request", {
        body: {
          action: 'check-admin-worker',
          workerNumber: adminWorkerNumber.trim()
        }
      });

      if (error) throw error;

      if (data?.success && data.isAdmin) {
        setIsAdmin(true);
        setAdminName(data.adminName || "Administrador");
        setVerified(true);
        toast.success(`Bienvenido, ${data.adminName}`);
      } else {
        toast.error("No tienes permisos de administrador");
        setIsAdmin(false);
      }
    } catch (err) {
      console.error("Error verifying admin:", err);
      toast.error("Error al verificar permisos");
    } finally {
      setVerifying(false);
    }
  };

  const handleSearchWorkers = async () => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-vacation-request", {
        body: {
          action: 'search-all-workers',
          query: searchQuery.trim(),
          limit: 15
        }
      });

      if (error) throw error;

      if (data?.success) {
        setSearchResults(data.workers || []);
      }
    } catch (err) {
      console.error("Error searching workers:", err);
      toast.error("Error al buscar trabajadores");
    } finally {
      setSearching(false);
    }
  };

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2) {
        handleSearchWorkers();
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectWorker = (worker: SearchedWorker) => {
    setSelectedWorker(worker);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedDays([]);
  };

  const handleDayClick = (date: Date, halfDay: boolean, action: 'add' | 'remove' | 'convert') => {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    if (action === 'add') {
      setSelectedDays([...selectedDays, { date: dateStr, halfDay }]);
    } else if (action === 'convert') {
      setSelectedDays(selectedDays.map(d => 
        d.date === dateStr ? { ...d, halfDay } : d
      ));
    } else if (action === 'remove') {
      setSelectedDays(selectedDays.filter(d => d.date !== dateStr));
    }
  };

  const totalSelectedDays = selectedDays.reduce((acc, d) => acc + (d.halfDay ? 0.5 : 1), 0);

  const handleSubmit = async () => {
    if (!selectedWorker) {
      toast.error("Selecciona un trabajador");
      return;
    }

    if (selectedDays.length === 0) {
      toast.error("Selecciona al menos un día");
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-vacation-request", {
        body: {
          action: 'admin-submit-vacation',
          adminWorkerNumber: adminWorkerNumber.trim(),
          targetWorkerNumber: selectedWorker.workerNumber,
          targetDepartmentId: selectedWorker.departmentId,
          selectedDates: selectedDays,
          notes: notes.trim() || null
        }
      });

      if (error) throw error;

      if (data?.success) {
        setSubmitted(true);
        toast.success(data.message || "Solicitud creada exitosamente");
      } else {
        toast.error(data?.error || "Error al crear solicitud");
      }
    } catch (err) {
      console.error("Error submitting admin vacation request:", err);
      toast.error("Error al enviar solicitud");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedWorker(null);
    setSelectedDays([]);
    setNotes("");
    setSubmitted(false);
  };

  if (!verified) {
    return (
      <div className="min-h-screen flex flex-col bg-background" dir={isRTL ? "rtl" : "ltr"}>
        <div className="flex justify-between items-center px-4 py-3 border-b border-border/50 bg-background/95 backdrop-blur-sm">
          <LanguageSelector />
          <ThemeToggle />
        </div>
        
        <div className="flex-1 flex items-center justify-center px-3 py-4 sm:p-4">
          <Card className="max-w-md w-full shadow-lg overflow-hidden">
            <CardHeader className="text-center px-4 sm:px-6">
              <div className="flex justify-center mb-3">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Shield className="h-7 w-7 text-primary" />
                </div>
              </div>
              <CardTitle className="text-xl font-semibold tracking-tight">
                Modo Administrador
              </CardTitle>
              <CardDescription className="font-light">
                Solicita vacaciones en nombre de un trabajador
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-4 sm:px-6">
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                <p className="text-sm text-muted-foreground">
                  Introduce tu número de fichar para verificar que tienes permisos de administrador.
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="admin_number">Tu número de fichar</Label>
                <Input
                  id="admin_number"
                  placeholder="Ej: 42259"
                  value={adminWorkerNumber}
                  onChange={(e) => setAdminWorkerNumber(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleVerifyAdmin();
                  }}
                />
              </div>
              
              <Button 
                onClick={handleVerifyAdmin} 
                className="w-full"
                disabled={!adminWorkerNumber.trim() || verifying}
              >
                {verifying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  "Verificar y continuar"
                )}
              </Button>

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => navigate("/vacaciones")}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver al formulario normal
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-3 py-4 sm:p-4" dir={isRTL ? "rtl" : "ltr"}>
        <Card className="max-w-md w-full shadow-lg overflow-hidden">
          <CardContent className="pt-6 text-center px-4 sm:px-6">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold text-primary mb-2 tracking-tight">Solicitud Enviada</h2>
            <p className="text-muted-foreground mb-4 font-light tracking-tight">
              La solicitud de vacaciones para <span className="font-semibold">{selectedWorker?.name}</span> ha sido enviada al encargado.
            </p>
            <div className="bg-secondary/50 rounded-xl p-4 text-start mb-4">
              <p className="text-sm font-semibold mb-2 tracking-tight">Resumen</p>
              <p className="text-sm text-muted-foreground mb-1 font-light tracking-tight">
                <span className="font-normal text-foreground">Trabajador:</span> {selectedWorker?.name} ({selectedWorker?.workerNumber})
              </p>
              <p className="text-sm text-muted-foreground mb-1 font-light tracking-tight">
                <span className="font-normal text-foreground">Departamento:</span> {selectedWorker?.departmentName}
              </p>
              <p className="text-sm text-muted-foreground font-light tracking-tight">
                <span className="font-normal text-foreground">Días solicitados:</span> {totalSelectedDays}
              </p>
            </div>
            <div className="space-y-2">
              <Button onClick={handleReset} className="w-full">
                Crear otra solicitud
              </Button>
              <Button variant="outline" onClick={() => navigate("/admin")} className="w-full">
                Volver al panel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col" dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex justify-between items-center px-4 py-3 border-b border-border/50 bg-background/95 backdrop-blur-sm sticky top-0 z-50">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <div className="flex items-center gap-2">
          <LanguageSelector />
          <ThemeToggle />
        </div>
      </div>
      
      <div className="flex-1 py-4 px-3 sm:py-6 sm:px-4">
        <div className="container mx-auto max-w-2xl">
          {/* Header */}
          <div className="text-center mb-5">
            <div className="flex justify-center mb-3">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Shield className="h-6 w-6 text-primary" />
              </div>
            </div>
            <h1 className="text-lg sm:text-2xl font-semibold text-foreground mb-1 tracking-tight">
              Solicitud de Vacaciones (Admin)
            </h1>
            <p className="text-sm text-muted-foreground font-light tracking-tight">
              Solicitando como: <span className="font-semibold text-primary">{adminName}</span>
            </p>
          </div>

          {/* Info Card */}
          <Card className="mb-4 bg-amber-500/10 border-amber-500/20">
            <CardContent className="py-3 px-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-amber-700 dark:text-amber-400">Modo Administrador</p>
                  <p className="text-amber-700/80 dark:text-amber-400/80">
                    Puedes seleccionar cualquier día sin restricciones. La solicitud se marcará como realizada por ti en nombre del trabajador.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Worker Search */}
          {!selectedWorker ? (
            <Card className="mb-4 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold tracking-tight flex items-center gap-2">
                  <Search className="h-5 w-5 text-primary" />
                  Buscar Trabajador
                </CardTitle>
                <CardDescription className="font-light tracking-tight text-sm">
                  Busca por nombre o número de fichar
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar trabajador..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {searching && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                )}

                {searchResults.length > 0 && (
                  <div className="border border-border rounded-lg overflow-hidden divide-y divide-border max-h-64 overflow-y-auto">
                    {searchResults.map((worker) => (
                      <button
                        key={worker.id}
                        onClick={() => handleSelectWorker(worker)}
                        className="w-full p-3 text-left hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <User className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground truncate">{worker.name}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>Nº {worker.workerNumber}</span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                {worker.departmentName}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No se encontraron trabajadores
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Selected Worker Card */}
              <Card className="mb-4 bg-primary/5 border-primary/20">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{selectedWorker.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Nº {selectedWorker.workerNumber} • {selectedWorker.departmentName}
                        </p>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setSelectedWorker(null)}
                    >
                      Cambiar
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Calendar */}
              <Card className="mb-4 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-semibold tracking-tight flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    Seleccionar Días
                  </CardTitle>
                  <CardDescription className="font-light tracking-tight text-sm">
                    Todos los días laborables están disponibles
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-2 sm:px-4">
                  {/* Day Counter */}
                  <div className={`rounded-xl p-3 mb-3 flex items-center justify-between ${
                    selectedDays.length > 0 ? 'bg-primary/10' : 'bg-secondary'
                  }`}>
                    <span className="text-sm font-medium text-foreground">Seleccionados:</span>
                    <span className={`text-2xl font-bold ${
                      selectedDays.length > 0 ? 'text-primary' : 'text-muted-foreground'
                    }`}>
                      {totalSelectedDays} <span className="text-base font-normal text-muted-foreground">días</span>
                    </span>
                  </div>

                  <div className="flex justify-center px-2">
                    <HalfDayCalendar
                      selectedDays={selectedDays}
                      onDayClick={handleDayClick}
                      locale={es}
                      availableDays={availableDays}
                      blockedDays={new Set()}
                      showHalfDayOption={true}
                      showFridayNotice={false}
                      disableWeekends={true}
                      t={t}
                      disabled={(date) => {
                        const dow = date.getDay();
                        return dow === 0 || dow === 6;
                      }}
                      className="rounded-lg border border-border/50"
                    />
                  </div>

                  {/* Legend */}
                  <div className="mt-3 flex flex-wrap justify-center gap-3 text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="h-3 w-3 rounded-full bg-[hsl(var(--calendar-available))] flex-shrink-0"></div>
                      <span className="text-muted-foreground">Disponible</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-3 w-3 rounded-full bg-[hsl(var(--calendar-selected))] flex-shrink-0"></div>
                      <span className="text-muted-foreground">Día completo</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-3 w-3 rounded-full bg-[hsl(var(--calendar-half-day))] flex-shrink-0"></div>
                      <span className="text-muted-foreground">Medio día</span>
                    </div>
                  </div>

                  {selectedDays.length > 0 && (
                    <div className="mt-3 bg-secondary/50 rounded-xl p-3">
                      <p className="text-xs font-semibold mb-2 text-foreground">Días seleccionados</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedDays
                          .sort((a, b) => a.date.localeCompare(b.date))
                          .map((day, idx) => (
                            <span 
                              key={idx}
                              className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                day.halfDay 
                                  ? 'bg-[hsl(var(--calendar-half-day))]/20 text-[hsl(var(--calendar-half-day-foreground))]' 
                                  : 'bg-primary/10 text-primary'
                              }`}
                            >
                              {format(new Date(day.date + 'T00:00:00'), "d MMM", { locale: es })}
                              {day.halfDay && ' ½'}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Notes */}
              <Card className="mb-4 shadow-md">
                <CardContent className="pt-4">
                  <Label htmlFor="notes" className="text-sm font-medium">Motivo / Notas (opcional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Ej: Petición extraordinaria del trabajador por motivos personales..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="mt-2"
                    rows={3}
                  />
                </CardContent>
              </Card>

              {/* Submit Button */}
              <Button
                onClick={handleSubmit}
                className="w-full h-12 text-base font-semibold"
                disabled={selectedDays.length === 0 || submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-5 w-5 mr-2" />
                    Enviar Solicitud ({totalSelectedDays} días)
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const AdminVacationRequest = () => {
  return (
    <LanguageProvider>
      <AdminVacationRequestContent />
    </LanguageProvider>
  );
};

export default AdminVacationRequest;
