import { useState, useCallback } from "react";
import { FileText, UserPlus, Banknote, UserX, UserMinus, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import OperativaJustificantesTab from "./OperativaJustificantesTab";
import OperativaAltasTab from "./OperativaAltasTab";
import OperativaAnticiposTab from "./OperativaAnticiposTab";
import OperativaNsppTab from "./OperativaNsppTab";
import OperativaDespidosTab from "./OperativaDespidosTab";

type OperativaTab = "justificantes" | "altas" | "anticipos" | "nspp" | "despidos";

const primaryTabs: { id: OperativaTab; label: string; icon: typeof FileText }[] = [
  { id: "justificantes", label: "Justificantes", icon: FileText },
  { id: "altas", label: "Altas", icon: UserPlus },
  { id: "anticipos", label: "Anticipos", icon: Banknote },
];

const secondaryTabs: { id: OperativaTab; label: string; icon: typeof UserX }[] = [
  { id: "nspp", label: "NSPP", icon: UserX },
  { id: "despidos", label: "Despidos", icon: UserMinus },
];

interface Props {
  embedded?: boolean;
}

export default function OperativaDiariaPanel({ embedded }: Props) {
  const [activeTab, setActiveTab] = useState<OperativaTab>("justificantes");

  const isSecondaryActive = secondaryTabs.some(t => t.id === activeTab);
  const activeSecondaryLabel = secondaryTabs.find(t => t.id === activeTab)?.label;

  return (
    <div className={embedded ? "flex flex-col" : "min-h-screen flex flex-col"}>
      {/* Pill tab navigation */}
      <div className="border-b border-border/20">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {primaryTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap shrink-0",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}>
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap shrink-0",
                isSecondaryActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              )}>
                <MoreHorizontal className="h-3.5 w-3.5" />
                {isSecondaryActive ? activeSecondaryLabel : "Más"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {secondaryTabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <DropdownMenuItem key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className={cn(activeTab === tab.id && "bg-accent")}>
                    <Icon className="h-4 w-4 mr-2" />
                    {tab.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-4 md:py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === "justificantes" && <OperativaJustificantesTab />}
            {activeTab === "altas" && <OperativaAltasTab />}
            {activeTab === "anticipos" && <OperativaAnticiposTab />}
            {activeTab === "nspp" && <OperativaNsppTab />}
            {activeTab === "despidos" && <OperativaDespidosTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
