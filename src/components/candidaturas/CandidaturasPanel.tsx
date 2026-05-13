import { useEffect, useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";
import { Users, Briefcase, CalendarDays } from "lucide-react";
import { VacantesTab } from "./VacantesTab";
import { CandidaturasTab } from "./CandidaturasTab";
import { EntrevistasTab } from "./EntrevistasTab";

type Props = {
  embedded?: boolean;
  isAdmin?: boolean;
  isConsulta?: boolean;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
};

const VALID_TABS = ["candidaturas", "vacantes", "entrevistas"] as const;
type ValidTab = typeof VALID_TABS[number];

function isValidTab(t: string | undefined | null): t is ValidTab {
  return !!t && (VALID_TABS as readonly string[]).includes(t);
}

export function CandidaturasPanel({ embedded, isAdmin = true, isConsulta = false, activeTab: externalTab, onTabChange }: Props) {
  const { t } = useLanguage();
  // Initialise from a valid externalTab (deep-link) when present, otherwise default
  const [internalTab, setInternalTab] = useState<string>(() =>
    isValidTab(externalTab) ? externalTab! : "candidaturas"
  );

  // Keep internal state in sync when the URL-driven externalTab changes
  useEffect(() => {
    if (isValidTab(externalTab) && externalTab !== internalTab) {
      setInternalTab(externalTab!);
    }
  }, [externalTab]);

  const currentTab = isValidTab(externalTab) ? externalTab! : internalTab;

  const setTab = (tab: string) => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };

  const tabs = [
    { id: "candidaturas", label: t("cand_title"), icon: Users },
    { id: "vacantes", label: t("cand_vacantes"), icon: Briefcase },
    { id: "entrevistas", label: "Entrevistas", icon: CalendarDays },
  ];

  return (
    <div className={embedded ? "flex flex-col" : "p-6 flex flex-col"}>
      <div className="border-b border-border/20">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap shrink-0",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-7xl mx-auto w-full px-4 py-4">
        {currentTab === "candidaturas" && <CandidaturasTab isAdmin={isAdmin || isConsulta} />}
        {currentTab === "vacantes" && <VacantesTab isAdmin={isAdmin || isConsulta} />}
        {currentTab === "entrevistas" && <EntrevistasTab canManage={isAdmin || isConsulta} />}
      </div>
    </div>
  );
}
