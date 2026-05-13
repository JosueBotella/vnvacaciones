import { motion } from "framer-motion";
import { Phone, Code, Package, ClipboardList, ArrowRight, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface TestArea {
  id: string;
  name: string;
  description: string;
  icon: string;
  is_active: boolean;
  display_order: number;
}

interface AreaSelectorProps {
  areas: TestArea[];
  selectedAreaId: string | null;
  onSelectArea: (areaId: string) => void;
  loading?: boolean;
}

const iconMap: Record<string, React.ReactNode> = {
  Phone: <Phone className="h-8 w-8" />,
  Code: <Code className="h-8 w-8" />,
  Package: <Package className="h-8 w-8" />,
  ClipboardList: <ClipboardList className="h-8 w-8" />,
};

const gradientMap: Record<string, string> = {
  Phone: "from-emerald-500 to-green-600",
  Code: "from-blue-500 to-indigo-600",
  Package: "from-orange-500 to-amber-600",
  ClipboardList: "from-purple-500 to-violet-600",
};

export default function AreaSelector({ 
  areas, 
  selectedAreaId, 
  onSelectArea,
  loading = false 
}: AreaSelectorProps) {
  // Filter only active areas
  const activeAreas = areas.filter(a => a.is_active).sort((a, b) => a.display_order - b.display_order);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (activeAreas.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No hay áreas de test disponibles en este momento.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-foreground mb-2">
          ¿A qué área te presentas?
        </h2>
        <p className="text-sm text-muted-foreground">
          Selecciona el departamento para el que aplicas
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {activeAreas.map((area, index) => {
          const isSelected = selectedAreaId === area.id;
          const gradient = gradientMap[area.icon] || "from-gray-500 to-gray-600";
          const icon = iconMap[area.icon] || <ClipboardList className="h-8 w-8" />;

          return (
            <motion.div
              key={area.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card
                onClick={() => onSelectArea(area.id)}
                className={cn(
                  "p-5 cursor-pointer transition-all duration-200",
                  "hover:shadow-lg hover:-translate-y-0.5",
                  "border-2",
                  isSelected 
                    ? "border-primary bg-primary/5 shadow-lg" 
                    : "border-transparent hover:border-primary/30"
                )}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={cn(
                    "w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0",
                    "bg-gradient-to-br text-white shadow-lg",
                    gradient,
                    isSelected && "scale-110"
                  )}>
                    {icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground text-lg mb-1">
                      {area.name}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {area.description}
                    </p>
                  </div>

                  {/* Selection indicator */}
                  <div className={cn(
                    "w-6 h-6 rounded-full border-2 flex-shrink-0",
                    "flex items-center justify-center transition-all",
                    isSelected 
                      ? "border-primary bg-primary" 
                      : "border-muted-foreground/30"
                  )}>
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="w-2 h-2 bg-white rounded-full"
                      />
                    )}
                  </div>
                </div>

                {/* Arrow on selection */}
                {isSelected && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="mt-3 flex items-center gap-2 text-primary text-sm font-medium"
                  >
                    <span>Test seleccionado</span>
                    <ArrowRight className="h-4 w-4" />
                  </motion.div>
                )}
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
