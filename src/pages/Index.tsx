import { useNavigate } from "react-router-dom";
import { LayoutDashboard, ArrowRight, Lock, Brain, FileSearch, BarChart3, FileUser } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoLink } from "@/components/LogoLink";

type Tool = {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
  path: string;
};

const tools: Tool[] = [
  {
    id: "panel-control",
    name: "Panel de Control",
    description: "Gestión unificada: vacaciones, personal, balance de horas e incidencias.",
    icon: <LayoutDashboard className="h-8 w-8" />,
    gradient: "from-[hsl(84,100%,42%)] to-[hsl(84,80%,55%)]",
    path: "/login",
  },
  {
    id: "cuadre-facturas",
    name: "Cuadre de Facturas",
    description: "Compara entradas internas con facturas de proveedores usando IA.",
    icon: <FileSearch className="h-8 w-8" />,
    gradient: "from-[hsl(84,100%,42%)] to-[hsl(84,80%,55%)]",
    path: "/cuadre-facturas",
  },
];

const analisisReclamacionesTool = {
  id: "analisis-reclamaciones",
  name: "Análisis Reclamaciones",
  description: "Presentación interactiva del análisis de reclamaciones del Dpto. de Revisadores.",
  icon: <BarChart3 className="h-8 w-8" />,
  gradient: "from-rose-500 to-pink-600",
  path: "/admin/analisis-reclamaciones/login",
};

const psicoTestTool = {
  id: "psico-test",
  name: "Test Psicotécnico",
  description: "Sistema profesional de evaluación psicotécnica para procesos de selección de personal.",
  icon: <Brain className="h-8 w-8" />,
  gradient: "from-amber-500 to-orange-600",
  path: "/admin/psico-test/login",
};

const candidaturasTool = {
  id: "candidaturas",
  name: "Candidaturas",
  description: "Filtrado inteligente de CVs con IA para procesos de selección.",
  icon: <FileUser className="h-8 w-8" />,
  gradient: "from-blue-500 to-cyan-400",
  path: "/admin/candidaturas/login",
};

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="pt-6 md:pt-8">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="flex justify-end mb-4 md:mb-6 animate-fade-in">
            <ThemeToggle />
          </div>
          <div className="flex flex-col items-center text-center pb-8 md:pb-12">
            <div className="mb-6 animate-scale-in">
              <LogoLink to="/" className="h-16 w-16 md:h-20 md:w-20 object-contain" />
            </div>
            <h1 className="text-3xl md:text-5xl font-semibold text-foreground mb-3 tracking-tight opacity-0 animate-fade-in-up">
              Panel de Producción
            </h1>
            <p className="text-base md:text-lg text-muted-foreground max-w-xl font-light tracking-tight opacity-0 animate-fade-in-up animation-delay-100">
              Herramientas y aplicaciones para el equipo de Producción
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 pb-16">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6 md:mb-8 opacity-0 animate-fade-in animation-delay-200">
            <h2 className="text-lg md:text-xl font-medium text-foreground/80 tracking-tight">
              Herramientas
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {tools.map((tool, index) => (
              <button
                key={tool.id}
                onClick={() => navigate(tool.path)}
                style={{ animationDelay: `${(index + 3) * 100}ms` }}
                className="
                  group relative overflow-hidden rounded-3xl p-6 md:p-8
                  bg-card border border-border/50
                  text-left opacity-0 animate-fade-in-up
                  hover:shadow-2xl hover:shadow-primary/10 hover:border-primary/30 hover:-translate-y-1 active:scale-[0.98]
                  transition-all duration-300 ease-out
                "
              >
                <div className={`
                  inline-flex items-center justify-center
                  w-14 h-14 md:w-16 md:h-16 rounded-2xl mb-5
                  bg-gradient-to-br ${tool.gradient}
                  text-white shadow-lg shadow-primary/20
                  transition-transform duration-300 group-hover:scale-110
                `}>
                  {tool.icon}
                </div>
                <h3 className="text-xl md:text-2xl font-semibold text-foreground mb-2 tracking-tight">
                  {tool.name}
                </h3>
                <p className="text-sm md:text-base text-muted-foreground font-light leading-relaxed mb-4">
                  {tool.description}
                </p>
                <div className="flex items-center text-primary font-medium text-sm">
                  <span>Acceder</span>
                  <ArrowRight className="h-4 w-4 ml-1 transition-transform duration-200 group-hover:translate-x-1" />
                </div>
              </button>
            ))}

            {/* Restricted tools */}
            {[analisisReclamacionesTool, psicoTestTool, candidaturasTool].map((tool, idx) => {
              const isRose = tool.id === "analisis-reclamaciones";
              const isBlue = tool.id === "candidaturas";
              const accentColor = isRose ? "rose" : isBlue ? "blue" : "amber";
              return (
                <button
                  key={tool.id}
                  onClick={() => navigate(tool.path)}
                  style={{ animationDelay: `${(tools.length + 3 + idx) * 100}ms` }}
                  className={`
                    group relative overflow-hidden rounded-3xl p-6 md:p-8
                    bg-gradient-to-br ${isRose ? "from-rose-950/30 to-pink-950/20" : isBlue ? "from-blue-950/30 to-cyan-950/20" : "from-amber-950/30 to-orange-950/20"}
                    border ${isRose ? "border-rose-500/30" : isBlue ? "border-blue-500/30" : "border-amber-500/30"}
                    text-left opacity-0 animate-fade-in-up
                    hover:shadow-2xl ${isRose ? "hover:shadow-rose-500/10 hover:border-rose-500/50" : isBlue ? "hover:shadow-blue-500/10 hover:border-blue-500/50" : "hover:shadow-amber-500/10 hover:border-amber-500/50"} hover:-translate-y-1 active:scale-[0.98]
                    transition-all duration-300 ease-out
                  `}
                >
                  <div className="absolute top-4 right-4">
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-${accentColor}-500/10 border border-${accentColor}-500/30`}>
                      <Lock className={`h-3 w-3 text-${accentColor}-500`} />
                      <span className={`text-[10px] font-medium text-${accentColor}-500 uppercase tracking-wider`}>Restringido</span>
                    </div>
                  </div>
                  <div className={`
                    inline-flex items-center justify-center
                    w-14 h-14 md:w-16 md:h-16 rounded-2xl mb-5
                    bg-gradient-to-br ${tool.gradient}
                    text-white shadow-lg shadow-${accentColor}-500/20
                    transition-transform duration-300 group-hover:scale-110
                  `}>
                    {tool.icon}
                  </div>
                  <h3 className="text-xl md:text-2xl font-semibold text-foreground mb-2 tracking-tight">
                    {tool.name}
                  </h3>
                  <p className="text-sm md:text-base text-muted-foreground font-light leading-relaxed mb-4">
                    {tool.description}
                  </p>
                  <div className={`flex items-center text-${accentColor}-500 font-medium text-sm`}>
                    <span>Acceder</span>
                    <ArrowRight className="h-4 w-4 ml-1 transition-transform duration-200 group-hover:translate-x-1" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </main>

      <footer className="border-t border-border/50 py-6 mt-8 opacity-0 animate-fade-in animation-delay-500">
        <div className="container mx-auto px-3 sm:px-4">
          <p className="text-center text-sm text-muted-foreground/60 font-light">
            Verdnatura Producción © {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
