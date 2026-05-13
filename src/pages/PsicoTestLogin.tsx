import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, User, Phone, Loader2, Clock, CheckCircle2, XCircle, Brain, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LogoLink } from "@/components/LogoLink";
import { TestArea } from "@/components/psico/AreaSelector";

type Step = "registration" | "instructions";

export default function PsicoTestLogin() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("registration");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedAreaId, setSelectedAreaId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [loadingAreas, setLoadingAreas] = useState(false);
  const [areas, setAreas] = useState<TestArea[]>([]);
  const [sessionData, setSessionData] = useState<{
    sessionId: string;
    candidateName: string;
    testName: string;
    timeLimit: number;
    questionsCount: number;
    areaName?: string;
  } | null>(null);

  // Load available areas on mount
  useEffect(() => {
    loadAreas();
  }, []);

  const loadAreas = async () => {
    setLoadingAreas(true);
    try {
      const { data, error } = await supabase.functions.invoke("psico-test-operations", {
        body: { action: "getAreas" }
      });

      if (error || !data?.success) {
        console.error("Error loading areas:", error || data?.error);
        setAreas([]);
        return;
      }

      const activeAreas = (data.areas || []).filter((a: TestArea) => a.is_active);
      setAreas(activeAreas);
      
      // Auto-select if only one area
      if (activeAreas.length === 1) {
        setSelectedAreaId(activeAreas[0].id);
      }
    } catch (err) {
      console.error("Error loading areas:", err);
    } finally {
      setLoadingAreas(false);
    }
  };

  const handleStartTest = async () => {
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedFirstName || !trimmedLastName) {
      toast.error("Por favor, introduce tu nombre y apellido");
      return;
    }

    if (trimmedFirstName.length < 2 || trimmedLastName.length < 2) {
      toast.error("El nombre y apellido deben tener al menos 2 caracteres");
      return;
    }

    if (!trimmedPhone || trimmedPhone.length < 9) {
      toast.error("Por favor, introduce un número de teléfono válido");
      return;
    }

    // If there are active areas but none selected
    if (areas.length > 0 && !selectedAreaId) {
      toast.error("Por favor, selecciona el área a la que te presentas");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("psico-test-operations", {
        body: { 
          action: "registerAndStartTest", 
          firstName: trimmedFirstName,
          lastName: trimmedLastName,
          phone: trimmedPhone,
          areaId: selectedAreaId || null
        }
      });

      if (error || !data?.success) {
        toast.error(data?.error || "Error al iniciar el test");
        setLoading(false);
        return;
      }

      const selectedArea = areas.find(a => a.id === selectedAreaId);

      setSessionData({
        sessionId: data.sessionId,
        candidateName: data.candidateName,
        testName: data.testName,
        timeLimit: data.timeLimit,
        questionsCount: data.questionsCount,
        areaName: selectedArea?.name || undefined
      });
      setStep("instructions");
    } catch (err) {
      console.error("Error registering candidate:", err);
      toast.error("Error al registrar el candidato");
    } finally {
      setLoading(false);
    }
  };

  const handleBeginTest = async () => {
    if (!sessionData) return;
    navigate(`/psico-test/active?session=${sessionData.sessionId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
      {/* Minimal header with theme toggle */}
      <header className="absolute top-4 right-4">
        <ThemeToggle />
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <AnimatePresence mode="wait">
          {step === "registration" && (
            <motion.div
              key="registration"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-md"
            >
              {/* Registration Card */}
              <Card className="p-8 border-0 shadow-xl bg-card/80 backdrop-blur-sm">
                {/* Centered Logo + Title */}
                <div className="text-center mb-8">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="mb-6"
                  >
                    <LogoLink to="/" className="h-16 w-auto mx-auto" />
                  </motion.div>
                  <h1 className="text-2xl font-bold text-primary mb-2">
                    Test Psicotécnico
                  </h1>
                  <p className="text-muted-foreground text-sm">
                    Introduce tus datos para comenzar la evaluación
                  </p>
                </div>

                <div className="space-y-4">
                  {/* First Name */}
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    className="relative group"
                  >
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors z-10" />
                    <Input
                      type="text"
                      placeholder="Nombre"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="pl-10 h-12 border-muted-foreground/20 focus:border-primary focus:shadow-sm transition-all"
                      maxLength={50}
                    />
                  </motion.div>

                  {/* Last Name */}
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15 }}
                    className="relative group"
                  >
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors z-10" />
                    <Input
                      type="text"
                      placeholder="Apellidos"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="pl-10 h-12 border-muted-foreground/20 focus:border-primary focus:shadow-sm transition-all"
                      maxLength={100}
                    />
                  </motion.div>

                  {/* Phone */}
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="relative group"
                  >
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors z-10" />
                    <Input
                      type="tel"
                      placeholder="Teléfono"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="pl-10 h-12 border-muted-foreground/20 focus:border-primary focus:shadow-sm transition-all"
                      maxLength={15}
                    />
                  </motion.div>

                  {/* Area Selector Dropdown - Simplified */}
                  {loadingAreas ? (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center justify-center h-12 border rounded-md border-muted-foreground/20"
                    >
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </motion.div>
                  ) : areas.length > 0 ? (
                    <motion.div 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.25 }}
                      className="relative"
                    >
                      <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground z-10 pointer-events-none" />
                      <Select value={selectedAreaId} onValueChange={setSelectedAreaId}>
                        <SelectTrigger className="h-12 pl-10 border-muted-foreground/20 focus:border-primary focus:shadow-sm transition-all">
                          <SelectValue placeholder="Selecciona el área" />
                        </SelectTrigger>
                        <SelectContent>
                          {areas.map((area) => (
                            <SelectItem key={area.id} value={area.id}>
                              {area.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </motion.div>
                  ) : null}

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <Button
                      onClick={handleStartTest}
                      disabled={loading || loadingAreas || !firstName.trim() || !lastName.trim() || !phone.trim() || (areas.length > 0 && !selectedAreaId)}
                      className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.01]"
                    >
                      {loading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <>
                          Comenzar Test
                          <ArrowRight className="ml-2 h-5 w-5" />
                        </>
                      )}
                    </Button>
                  </motion.div>
                </div>

                <p className="text-center text-xs text-muted-foreground mt-6">
                  Al continuar, aceptas realizar la evaluación psicotécnica
                </p>
              </Card>
            </motion.div>
          )}

          {step === "instructions" && sessionData && (
            <motion.div
              key="instructions"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-md"
            >
              {/* Instructions Card */}
              <Card className="p-8 border-0 shadow-xl bg-card/80 backdrop-blur-sm border-primary/20">
                <div className="text-center mb-6">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="mb-4"
                  >
                    <LogoLink to="/" className="h-12 w-auto mx-auto" />
                  </motion.div>
                  <h1 className="text-xl font-bold text-foreground mb-1">
                    ¡Bienvenido/a, {sessionData.candidateName}!
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {sessionData.areaName ? `Test: ${sessionData.areaName}` : sessionData.testName}
                  </p>
                </div>

                {/* Test info */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 text-center border border-primary/20">
                    <Clock className="h-6 w-6 mx-auto mb-2 text-primary" />
                    <p className="text-2xl font-bold text-foreground">{sessionData.timeLimit}</p>
                    <p className="text-xs text-muted-foreground">minutos</p>
                  </div>
                  <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 text-center border border-primary/20">
                    <Brain className="h-6 w-6 mx-auto mb-2 text-primary" />
                    <p className="text-2xl font-bold text-foreground">{sessionData.questionsCount}</p>
                    <p className="text-xs text-muted-foreground">preguntas</p>
                  </div>
                </div>

                {/* Instructions list */}
                <div className="space-y-3 mb-6">
                  <h3 className="font-semibold text-foreground text-sm">Instrucciones:</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">
                        Cada pregunta tiene un tiempo límite individual
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">
                        El test avanzará automáticamente si se agota el tiempo
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">
                        No puedes volver a preguntas anteriores
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">
                        No cierres ni recargues la página durante el test
                      </span>
                    </div>
                  </div>
                </div>

                {/* Start button */}
                <Button
                  onClick={handleBeginTest}
                  disabled={loading}
                  className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      Comenzar Test
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </>
                  )}
                </Button>

                <p className="text-center text-xs text-muted-foreground mt-4">
                  Al comenzar, aceptas que el test no puede pausarse
                </p>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="p-4 text-center text-xs text-muted-foreground">
        Verdnatura © {new Date().getFullYear()}
      </footer>
    </div>
  );
}
