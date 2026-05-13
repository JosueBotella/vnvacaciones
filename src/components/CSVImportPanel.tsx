import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  ArrowRight,
  Copy,
  UserPlus,
  UserCog,
  UserMinus,
  FileSpreadsheet,
  Eye,
  CheckCheck,
  Loader2,
  Users,
  HeartPulse,
  Umbrella,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CalendarDays,
  CalendarClock,
} from "lucide-react";

type Department = {
  id: string;
  name: string;
};

type WorkerTeam = {
  id: string;
  name: string;
  department_id: string;
};

type ParsedEmployee = {
  rowIndex: number;
  workerNumber: string;
  fullName: string;
  workerCode: string;
  fiscalId: string;
  currentFiscalId?: string;
  fiscalIdChanged?: boolean;
  rawDeptGroup: string;
  extractedDepartment: string;
  extractedGroup: string;
  extractedRole: string | null;
  matchedDepartmentId: string | null;
  matchedDepartmentName: string | null;
  matchedTeamId: string | null;
  matchedTeamName: string | null;
  absenceStatus: "active" | "baja" | "vacaciones";
  absenceRaw: string;
  action: "create" | "update" | "skip" | "no_change" | "delete" | "restore";
  skipReason?: string;
  changeDetails?: string[];
  selected: boolean;
  existingWorkerId?: string;
  existingTeamName?: string;
  existingRole?: string | null;
  pendingVacationDays: number;
  currentPendingVacationDays?: number;
  previousDepartmentId?: string | null;
  vacationDaysChanged?: boolean;
  roleChanged?: boolean;
  startContractDate?: string | null;
  currentStartContractDate?: string | null;
  contractDateChanged?: boolean;
  currentWorkerCode?: string;
  workerCodeChanged?: boolean;
};

type ImportResult = {
  workerNumber: string;
  name: string;
  workerId?: string;
  status: "created" | "updated" | "skipped" | "error" | "deleted" | "vacation_updated" | "restored";
  reason?: string;
  oldDays?: number;
  newDays?: number;
};

// Import action types
type ImportActionType = "all" | "workers_only" | "vacation_days_only" | "contract_dates_only" | "fiscal_id_only";

type Props = {
  departments: Department[];
  teams: WorkerTeam[];
  getSessionToken: () => string | null;
  onImportComplete: (data: { createdWorkers: string[]; updatedWorkers: string[] }) => void;
  onWorkerClick?: (workerNumber: string) => void;
};

const isActionableEmployee = (employee: Pick<ParsedEmployee, "action">) =>
  employee.action === "create" ||
  employee.action === "update" ||
  employee.action === "delete" ||
  employee.action === "restore";

const shouldAutoSelectEmployee = (employee: Pick<ParsedEmployee, "action" | "matchedDepartmentId">) =>
  (employee.action === "create" || employee.action === "update" || employee.action === "restore") &&
  Boolean(employee.matchedDepartmentId);

const normalizeEmployeeSelection = (employees: ParsedEmployee[]) =>
  employees.map((employee) => {
    if (!isActionableEmployee(employee)) {
      return { ...employee, selected: false };
    }

    if (employee.action === "delete") {
      return { ...employee, selected: employee.selected === true };
    }

    return {
      ...employee,
      selected: employee.selected === true || shouldAutoSelectEmployee(employee),
    };
  });

// FIXED CSV FORMAT - Database export columns (PERMANENT - DO NOT CHANGE)
const FIXED_COLUMNS = {
  id: "id",
  fullName: "full_name",
  deptGroup: "department_group",
  absence: "COALESCE(at.name, '')"
};

// Fallback column names for absence (handles different CSV exports)
const ABSENCE_COLUMN_NAMES = [
  "COALESCE(at.name, '')",
  "coalesce(at.name, '')",
  "ausencia",
  "Ausencia",
  "absence",
  "Absence",
  "estado_ausencia",
  "Estado ausencia",
  "tipo_ausencia",
  "at.name",
];

// Optional CSV column for pending vacation days - multiple possible names
const VACATION_DAYS_COLUMN_NAMES = [
  "pendingDaysSetCalendar",
  "pendingdayssetcalendar",
  "Días pendientes calendario",
  "dias pendientes calendario",
  "pending days set",
  "Pending days set",
  "pending_days_set",
  "dias_pendientes",
  "Días pendientes",
  "dias pendientes",
  "pending_vacation_days",
  "pending vacation days",
];

// Optional CSV column for start contract date
const CONTRACT_DATE_COLUMN_NAMES = [
  "start_contract_date",
  "startcontractdate",
  "fecha_inicio_contrato",
  "fecha inicio contrato",
  "contract_start_date",
  "fecha_contrato",
  "fecha contrato",
];

// Optional CSV column for worker code (siglas)
const WORKER_CODE_COLUMN_NAMES = [
  "worker_code",
  "workercode",
  "siglas",
  "codigo",
  "code",
];

// Optional CSV column for fiscal ID (DNI/NIE)
const FISCAL_ID_COLUMN_NAMES = [
  "fi",
  "idfiscal",
  "id_fiscal",
  "dni",
  "nie",
  "dni_nie",
  "dninie",
];

// lines_hour import removed - now handled by dedicated PerformanceImportPanel

/**
 * SPECIAL CASE: CAMARA department handling
 * Detects "AUXILIAR CAMARA A" -> department: "CAMARA", group: "A", role: "AUXILIAR CAMARA"
 * Detects "CAMARA A" -> department: "CAMARA", group: "A", role: "CAMARA"
 * Detects "AUXILIAR CAMARA" (no group) -> department: "CAMARA", group: "", role: "AUXILIAR CAMARA"
 * Detects "CAMARA" (no group) -> department: "CAMARA", group: "", role: "CAMARA"
 */
function extractCamaraInfo(combined: string): { department: string; group: string; role: string | null } | null {
  if (!combined || typeof combined !== "string") return null;
  
  const normalized = combined.trim().toUpperCase().replace(/\s+/g, " ");
  
  // Pattern: "AUXILIAR CAMARA X" where X is the group (A, B, etc.)
  const auxiliarWithGroupMatch = normalized.match(/^AUXILIAR\s+CAMARA\s+([A-Z])$/i);
  if (auxiliarWithGroupMatch) {
    return {
      department: "CAMARA",
      group: auxiliarWithGroupMatch[1].toUpperCase(),
      role: "AUXILIAR CAMARA"
    };
  }
  
  // Pattern: "AUXILIAR CAMARA" (without group letter)
  if (normalized === "AUXILIAR CAMARA") {
    return {
      department: "CAMARA",
      group: "",
      role: "AUXILIAR CAMARA"
    };
  }
  
  // Pattern: "CAMARA X" where X is the group (A, B, etc.)
  const camaraWithGroupMatch = normalized.match(/^CAMARA\s+([A-Z])$/i);
  if (camaraWithGroupMatch) {
    return {
      department: "CAMARA",
      group: camaraWithGroupMatch[1].toUpperCase(),
      role: "CAMARA"
    };
  }
  
  // Pattern: "CAMARA" (without group letter)
  if (normalized === "CAMARA") {
    return {
      department: "CAMARA",
      group: "",
      role: "CAMARA"
    };
  }
  
  return null;
}

/**
 * SPECIAL CASE: PR department handling
 * Detects "Sacado PRA" -> department: "Sacado Previa", group: "A"
 * Detects "Encajado PRB" -> department: "Encajado Previa", group: "B"
 * PR is followed by a single letter which is the group code
 */
function extractPreviaInfo(combined: string): { department: string; group: string; role: string | null } | null {
  if (!combined || typeof combined !== "string") return null;
  
  const trimmed = combined.trim().replace(/\s+/g, " ");
  const parts = trimmed.split(" ");
  
  if (parts.length < 2) return null;
  
  const lastPart = parts[parts.length - 1].toUpperCase();
  
  // Pattern: "SACADO PRA", "ENCAJADO PRB", etc. - PR followed by a letter
  const previaMatch = lastPart.match(/^PR([A-Z])$/i);
  if (previaMatch) {
    const baseParts = parts.slice(0, -1);
    const department = [...baseParts, "Previa"].join(" ");
    const group = previaMatch[1].toUpperCase();
    return { department, group, role: null };
  }
  
  return null;
}

/**
 * Extract department and group from combined string
 */
function extractDepartmentAndGroup(combined: string): { department: string; group: string; role: string | null } {
  if (!combined || typeof combined !== "string") {
    return { department: "", group: "", role: null };
  }

  // SPECIAL CASE: ALMACENAJE ALTILLO → Almacenaje sin equipo
  const upperTrimmed = combined.trim().toUpperCase();
  if (upperTrimmed === "ALMACENAJE ALTILLO") {
    return { department: "ALMACENAJE", group: "", role: null };
  }

  // SPECIAL CASE: VNH = Verdnatura Holland
  if (upperTrimmed === "VNH" || upperTrimmed.startsWith("VNH ")) {
    return { department: "VERDNATURA HOLLAND", group: upperTrimmed === "VNH" ? "" : combined.trim().substring(4).trim(), role: null };
  }

  // SPECIAL CASE: "SACADO H - TEAMNAME N" → department "SACADO H", group "Teamname - N"
  // e.g. "SACADO H - ELITE 1" → { department: "SACADO H", group: "Élite - 1" }
  // Plain "SACADO H" → { department: "SACADO H", group: "" } (Sin equipo)
  const sacadoHDashMatch = upperTrimmed.match(/^SACADO\s+H\s*-\s*(\S+)\s+(\d+)$/);
  if (sacadoHDashMatch) {
    const rawTeamName = sacadoHDashMatch[1];
    const teamNumber = sacadoHDashMatch[2];
    // Map CSV team names (uppercase, no accents) to actual DB team names (with accents)
    const sacadoHTeamMap: Record<string, string> = {
      "ELITE": "Élite",
      "CUPULA": "Cúpula",
      "GALLOS": "Gallos",
      "GLADIADORES": "Gladiadores",
      "HALCONES": "Halcones",
      "POTENCIA": "Potencia",
      "SABEN": "Saben",
      "VIKINGOS": "Vikingos",
    };
    const mappedName = sacadoHTeamMap[rawTeamName] || rawTeamName.charAt(0) + rawTeamName.slice(1).toLowerCase();
    return { department: "SACADO H", group: `${mappedName} - ${teamNumber}`, role: null };
  }
  // Plain "SACADO H" without dash → Sin equipo
  if (upperTrimmed === "SACADO H") {
    return { department: "SACADO H", group: "", role: null };
  }

  // SPECIAL CASE: Check for CAMARA patterns first
  const camaraInfo = extractCamaraInfo(combined);
  if (camaraInfo) {
    return camaraInfo;
  }

  // SPECIAL CASE: Check for PR (Previa) patterns
  const previaInfo = extractPreviaInfo(combined);
  if (previaInfo) {
    return previaInfo;
  }

  const trimmed = combined.trim().replace(/\s+/g, " ");
  const parts = trimmed.split(" ");
  
  if (parts.length < 2) {
    return { department: trimmed, group: "", role: null };
  }
  
  const lastPart = parts[parts.length - 1];
  
  const letterNumberMatch = lastPart.match(/^([A-Za-z]+)(\d+)$/);
  if (letterNumberMatch) {
    const letterPart = letterNumberMatch[1];
    const numberPart = letterNumberMatch[2];
    
    if (letterPart.length >= 2) {
      // First letter is a department suffix (H, V, etc.), rest + number is group
      // e.g. "SACADO HC4" → dept "SACADO H", group "C4"
      // e.g. "ENCAJADO VA1" → dept "ENCAJADO V", group "A1"
      const baseParts = parts.slice(0, -1);
      const deptSuffix = letterPart[0].toUpperCase();
      const department = [...baseParts, deptSuffix].join(" ");
      const group = letterPart.substring(1) + numberPart;
      return { department, group, role: null };
    } else {
      const department = parts.slice(0, -1).join(" ");
      return { department, group: lastPart, role: null };
    }
  }
  
  if (lastPart.length === 1 && /^[A-Za-z]$/.test(lastPart)) {
    const department = parts.slice(0, -1).join(" ");
    return { department, group: lastPart, role: null };
  }
  
  if (lastPart.length === 2 && /^[A-Za-z]{2}$/.test(lastPart)) {
    const prefixLetter = lastPart[0].toUpperCase();
    const groupLetter = lastPart[1].toUpperCase();
    const baseParts = parts.slice(0, -1);
    const department = [...baseParts, prefixLetter].join(" ");
    return { department, group: groupLetter, role: null };
  }
  
  return { department: trimmed, group: "", role: null };
}

/**
 * Determine absence status from the COALESCE(at.name, '') column
 */
function parseAbsenceStatus(absenceValue: string): "active" | "baja" | "vacaciones" {
  if (!absenceValue || typeof absenceValue !== "string") {
    return "active";
  }
  
  const normalized = absenceValue.toLowerCase().trim();
  // Strip accents (e.g., 'ó' -> 'o') to handle encoding variations
  const noAccents = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  // Direct "baja" match
  if (noAccents.includes("baja")) {
    return "baja";
  }
  
  // Maternidad / Paternidad / Prórroga / INS (INSS) → treated as "baja"
  if (
    noAccents.includes("maternidad") || 
    noAccents.includes("paternidad") || 
    noAccents.includes("prorroga") ||
    noAccents.includes("proroga") ||
    noAccents.includes("prorr") ||
    /\bins\b/i.test(noAccents) ||
    noAccents.includes("inss") ||
    noAccents.includes("incapacidad")
  ) {
    return "baja";
  }
  
  // Vacaciones match
  if (noAccents.includes("vacaciones")) {
    return "vacaciones";
  }
  
  // Permiso Retribuido → treated as "vacaciones"
  if (noAccents.includes("permiso retribuido")) {
    return "vacaciones";
  }
  
  return "active";
}

/**
 * Parse contract date from various formats
 * Accepts: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY
 * Returns ISO date string (YYYY-MM-DD) or null
 */
function parseContractDate(dateStr: string): string | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Some exports include time (e.g. "2022-04-21 02:00:00" or "2022-04-21T02:00:00")
  // Normalize to just the date part before parsing.
  const dateOnly = (() => {
    const isoDatePrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoDatePrefix) return isoDatePrefix[1];
    // Handle leading date in European formats with time (e.g. "21/04/2022 02:00:00")
    const euroPrefix = trimmed.match(/^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/);
    if (euroPrefix) return euroPrefix[1];
    return trimmed;
  })();
  
  // Try ISO format first (YYYY-MM-DD)
  const isoMatch = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) {
      return `${year}-${month}-${day}`;
    }
  }
  
  // Try DD/MM/YYYY or DD-MM-YYYY
  const euroMatch = dateOnly.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (euroMatch) {
    const [, day, month, year] = euroMatch;
    const d = day.padStart(2, '0');
    const m = month.padStart(2, '0');
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) {
      return `${year}-${m}-${d}`;
    }
  }
  
  return null;
}

/**
 * Normalize text: "MIGUEL ANGEL PUIG CRUCES" → "Miguel Angel Puig Cruces"
 */
function normalizeText(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .split(" ")
    .filter(word => word.length > 0)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Normalize CSV header keys for resilient matching (handles BOM, accents, spaces, casing)
 */
function normalizeHeaderKey(text: string): string {
  return (text || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^"|"$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Parse a CSV line respecting quoted fields
 */
function parseCSVLine(line: string, separator: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === separator && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

/**
 * Parse CSV content with auto-detection of separator
 */
function parseCSV(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const firstLine = lines[0];
  let separator = ",";
  
  let inQuotes = false;
  let semicolonCount = 0;
  let commaCount = 0;
  for (const char of firstLine) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes) {
      if (char === ';') semicolonCount++;
      else if (char === ',') commaCount++;
    }
  }
  
  if (semicolonCount > 0 && semicolonCount >= commaCount) {
    separator = ";";
  }

  const headers = parseCSVLine(lines[0], separator);
  const rows: string[][] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], separator);
    if (values.length >= headers.length - 1 && values.length <= headers.length + 1) {
      while (values.length < headers.length) values.push("");
      if (values.length > headers.length) values.length = headers.length;
      rows.push(values);
    }
  }

  return { headers, rows };
}

// Step indicator component
const StepIndicator = ({ currentStep }: { currentStep: number }) => {
  const steps = [
    { label: "Cargar", icon: <FileSpreadsheet className="h-4 w-4" /> },
    { label: "Revisar", icon: <Eye className="h-4 w-4" /> },
    { label: "Completado", icon: <CheckCheck className="h-4 w-4" /> },
  ];

  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {steps.map((step, idx) => (
        <div key={idx} className="flex items-center">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors ${
              idx === currentStep
                ? "bg-primary text-primary-foreground"
                : idx < currentStep
                ? "bg-primary/20 text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {step.icon}
            <span className="hidden sm:inline">{step.label}</span>
          </div>
          {idx < steps.length - 1 && (
            <div className={`w-8 h-0.5 mx-1 ${idx < currentStep ? "bg-primary" : "bg-muted"}`} />
          )}
        </div>
      ))}
    </div>
  );
};

export const CSVImportPanel = ({ departments, teams, getSessionToken, onImportComplete, onWorkerClick }: Props) => {
  const [step, setStep] = useState<"upload" | "preview" | "importing" | "results">("upload");
  const [parsedEmployees, setParsedEmployees] = useState<ParsedEmployee[]>([]);
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState<string>("all");
  const [selectedActionFilter, setSelectedActionFilter] = useState<string>("all");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("all");
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedResultSection, setExpandedResultSection] = useState<"created" | "updated" | "deleted" | "vacation_updated" | "error" | null>(null);
  const [hasVacationDaysColumn, setHasVacationDaysColumn] = useState(false);
  const [vacationDaysHeader, setVacationDaysHeader] = useState<string | null>(null);
  const [hasContractDateColumn, setHasContractDateColumn] = useState(false);
  const [hasFiscalIdColumn, setHasFiscalIdColumn] = useState(false);
  const [importAction, setImportAction] = useState<ImportActionType>("all");
  // Store raw CSV data to allow re-processing without re-uploading
  const [storedCsvData, setStoredCsvData] = useState<{ headers: string[]; rows: string[][] } | null>(null);

  const isInvalidSessionError = (payload: any, invokeError: any) => {
    const msg = (payload?.error || invokeError?.message || "").toString().toLowerCase();
    return (
      msg.includes("invalid session") ||
      msg.includes("sesión inválida") ||
      msg.includes("sesion inválida") ||
      msg.includes("sesión expirada") ||
      msg.includes("session expired")
    );
  };

  const handleSessionExpired = () => {
    toast.error("Tu sesión ha expirado. Vuelve a iniciar sesión.");
    localStorage.removeItem("manager_session");
    localStorage.removeItem("manager_session_token");
    // Force re-login; admin pages use the same login screen
    window.location.assign("/login");
  };

  const validateSessionToken = async (token: string) => {
    const res = await supabase.functions.invoke("manager-auth", {
      body: { action: "validateSession", sessionToken: token },
    });

    if (res.error || !res.data?.success) {
      if (isInvalidSessionError(res.data, res.error) || res.data?.error) {
        handleSessionExpired();
        return false;
      }
      // If it's a transient network issue, don't kick the user out
      toast.error("No se pudo validar la sesión. Reintenta.");
      return false;
    }

    return true;
  };

  const currentStepIndex = step === "upload" ? 0 : step === "preview" || step === "importing" ? 1 : 2;

  // Normalize for matching (remove accents, lowercase, trim)
  const normalizeForMatch = (text: string): string => {
    return (text || "")
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  };

  // Match department by name (accent-insensitive)
  const matchDepartment = useCallback((deptName: string): Department | null => {
    if (!deptName) return null;
    const normalized = normalizeForMatch(deptName);
    return departments.find(d => normalizeForMatch(d.name) === normalized) || null;
  }, [departments]);

  // Match team by name and department (accent-insensitive)
  const matchTeam = useCallback((teamName: string, departmentId: string | null): WorkerTeam | null => {
    if (!teamName || !departmentId) return null;
    const normalized = normalizeForMatch(teamName);
    
    // Find matching teams for this department
    const deptTeams = teams.filter(t => t.department_id === departmentId);
    
    const matched = deptTeams.find(t => normalizeForMatch(t.name) === normalized);
    
    if (!matched) {
      console.log('[CSVImport] Team match failed:', {
        searchingFor: teamName,
        normalized,
        departmentId,
        availableTeams: deptTeams.map(t => ({ name: t.name, normalized: normalizeForMatch(t.name) }))
      });
    }
    
    return matched || null;
  }, [teams]);

  // Process CSV data
  const processCSVData = useCallback(async (headers: string[], rows: string[][]) => {
    setIsProcessing(true);

    try {
      const sessionToken = getSessionToken();
      if (!sessionToken) {
        toast.error("Sesión no válida");
        setIsProcessing(false);
        return;
      }

      // Find column indices
      const idColIndex = headers.findIndex(h => h === FIXED_COLUMNS.id);
      const nameColIndex = headers.findIndex(h => h === FIXED_COLUMNS.fullName);
      const deptGroupColIndex = headers.findIndex(h => h === FIXED_COLUMNS.deptGroup);
      // Find absence column - try exact match first, then fallback names
      const normalizedHeaders = headers.map(normalizeHeaderKey);
      let absenceColIndex = headers.findIndex(h => h === FIXED_COLUMNS.absence);
      if (absenceColIndex === -1) {
        // Try fallback names (normalized matching)
        absenceColIndex = normalizedHeaders.findIndex((h) =>
          ABSENCE_COLUMN_NAMES.some((name) => normalizeHeaderKey(name) === h)
        );
        if (absenceColIndex !== -1) {
          console.log('[CSVImport] Absence column found via fallback:', headers[absenceColIndex]);
        }
      }
      const vacationDaysColIndex = normalizedHeaders.findIndex((h) =>
        VACATION_DAYS_COLUMN_NAMES.some((name) => h === normalizeHeaderKey(name))
      );
      
      // Find contract date column
      const contractDateColIndex = normalizedHeaders.findIndex((h) =>
        CONTRACT_DATE_COLUMN_NAMES.some((name) => h === normalizeHeaderKey(name))
      );
      
      // Find worker code column
      const workerCodeColIndex = normalizedHeaders.findIndex((h) =>
        WORKER_CODE_COLUMN_NAMES.some((name) => h === normalizeHeaderKey(name))
      );

      // Find fiscal ID column (DNI/NIE)
      const fiscalIdColIndex = normalizedHeaders.findIndex((h) =>
        FISCAL_ID_COLUMN_NAMES.some((name) => h === normalizeHeaderKey(name))
      );

      // lines_hour import removed - handled by PerformanceImportPanel

      // Check if vacation days column exists
      const hasDays = vacationDaysColIndex !== -1;
      setHasVacationDaysColumn(hasDays);
      setVacationDaysHeader(hasDays ? headers[vacationDaysColIndex] : null);
      
      // Check if contract date column exists
      const hasContractDates = contractDateColIndex !== -1;
      setHasContractDateColumn(hasContractDates);

      // Check if fiscal ID (DNI/NIE) column exists
      setHasFiscalIdColumn(fiscalIdColIndex !== -1);

      // Validate required columns
      const missingCols: string[] = [];
      if (idColIndex === -1) missingCols.push("id");
      if (nameColIndex === -1) missingCols.push("full_name");
      if (deptGroupColIndex === -1) missingCols.push("department_group");

      if (missingCols.length > 0) {
        toast.error(`Columnas requeridas no encontradas: ${missingCols.join(", ")}`);
        setIsProcessing(false);
        return;
      }

      // Fetch existing workers, all teams, and role aliases from ALL departments
      const [workersResult, teamsResult, aliasesResult] = await Promise.all([
        supabase.functions.invoke("admin-operations", {
          body: { action: "getAllWorkersForImport", sessionToken }
        }),
        supabase.functions.invoke("admin-operations", {
          body: { action: "getAllTeamsForImport", sessionToken }
        }),
        supabase.functions.invoke("admin-operations", {
          body: { action: "getAllRoleAliases", sessionToken }
        })
      ]);

      if (workersResult.error || !workersResult.data?.success) {
        toast.error("Error al obtener datos de trabajadores");
        setIsProcessing(false);
        return;
      }

      const existingWorkers = workersResult.data.workers || [];
      
      // Use fresh teams from API if available, fallback to props
      const freshTeams: WorkerTeam[] = teamsResult.data?.success ? teamsResult.data.teams : teams;
      console.log('[CSVImport] Using teams:', { count: freshTeams.length, fromAPI: teamsResult.data?.success });

      // Role aliases map: alias_name (normalized) -> department_id
      const roleAliases: { id: string; department_id: string; alias_name: string }[] = 
        aliasesResult.data?.success ? aliasesResult.data.aliases : [];
      console.log('[CSVImport] Role aliases loaded:', roleAliases.length);

      // Create a map of normalized alias names to department IDs
      const aliasMap = new Map<string, string>();
      for (const alias of roleAliases) {
        const normalizedAlias = normalizeForMatch(alias.alias_name);
        aliasMap.set(normalizedAlias, alias.department_id);
      }

      // Local function to match department by name OR alias (with space-insensitive fallback)
      const matchDepartmentWithAliases = (deptName: string): { department: Department | null; isAlias: boolean; aliasRole: string | null } => {
        if (!deptName) return { department: null, isAlias: false, aliasRole: null };
        
        const normalized = normalizeForMatch(deptName);
        
        // First try direct match
        const directMatch = departments.find(d => normalizeForMatch(d.name) === normalized);
        if (directMatch) {
          return { department: directMatch, isAlias: false, aliasRole: null };
        }
        
        // Try space-insensitive match (e.g. "SacadoH" → "Sacado H")
        const noSpaces = normalized.replace(/\s+/g, "");
        const spaceInsensitiveMatch = departments.find(d => normalizeForMatch(d.name).replace(/\s+/g, "") === noSpaces);
        if (spaceInsensitiveMatch) {
          return { department: spaceInsensitiveMatch, isAlias: false, aliasRole: null };
        }
        
        // Then try alias match
        const aliasDepartmentId = aliasMap.get(normalized);
        if (aliasDepartmentId) {
          const aliasDept = departments.find(d => d.id === aliasDepartmentId);
          if (aliasDept) {
            return { department: aliasDept, isAlias: true, aliasRole: deptName.trim() };
          }
        }
        
        return { department: null, isAlias: false, aliasRole: null };
      };

      // Local function to match team using fresh data
      const matchTeamLocal = (teamName: string, departmentId: string | null): WorkerTeam | null => {
        if (!teamName || !departmentId) return null;
        const normalized = normalizeForMatch(teamName);
        const deptTeams = freshTeams.filter(t => t.department_id === departmentId);
        const matched = deptTeams.find(t => normalizeForMatch(t.name) === normalized);
        
        if (!matched && deptTeams.length > 0) {
          console.log('[CSVImport] Team match failed:', {
            searchingFor: teamName,
            normalized,
            departmentId,
            availableTeams: deptTeams.map(t => ({ name: t.name, normalized: normalizeForMatch(t.name) }))
          });
        }
        
        return matched || null;
      };

      // Parse employees
      const parsed: ParsedEmployee[] = [];
      const seenWorkerNumbers = new Set<string>();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const workerNumber = row[idColIndex]?.trim() || "";
        const rawName = row[nameColIndex]?.trim() || "";
        const rawDeptGroup = row[deptGroupColIndex]?.trim() || "";
        const rawAbsence = absenceColIndex !== -1 ? (row[absenceColIndex]?.trim() || "") : "";
        const workerCode = workerCodeColIndex !== -1 ? (row[workerCodeColIndex]?.trim() || "") : "";
        const fiscalId = fiscalIdColIndex !== -1 ? (row[fiscalIdColIndex]?.trim().toUpperCase() || "") : "";
        
        // Parse pending vacation days
        let pendingVacationDays = 0;
        if (vacationDaysColIndex !== -1) {
          const rawVacationDays = row[vacationDaysColIndex]?.trim() || "";
          const parsedDays = parseFloat(rawVacationDays.replace(",", "."));
          pendingVacationDays = isNaN(parsedDays) ? 0 : parsedDays;
        }
        
        // Parse start contract date
        let startContractDate: string | null = null;
        if (contractDateColIndex !== -1) {
          const rawContractDate = row[contractDateColIndex]?.trim() || "";
          if (rawContractDate) {
            // Try to parse different date formats
            const parsed = parseContractDate(rawContractDate);
            startContractDate = parsed;
          }
        }
        

        if (!workerNumber && !rawName) continue;

        const fullName = normalizeText(rawName);
        let { department: extractedDept, group: extractedGroup, role: extractedRole } = extractDepartmentAndGroup(rawDeptGroup);
        const absenceStatus = parseAbsenceStatus(rawAbsence);

        // Use the new matching function that includes aliases
        let { department: matchedDept, isAlias, aliasRole } = matchDepartmentWithAliases(extractedDept);
        let matchedTeam = (matchedDept && extractedGroup) ? matchTeamLocal(extractedGroup, matchedDept.id) : null;
        
        // Fallback: if department didn't match but we split off a group, try the full string as department
        if (!matchedDept && extractedGroup) {
          const fullRetry = matchDepartmentWithAliases(rawDeptGroup.trim());
          if (fullRetry.department) {
            matchedDept = fullRetry.department;
            isAlias = fullRetry.isAlias;
            aliasRole = fullRetry.aliasRole;
            extractedDept = rawDeptGroup.trim();
            extractedGroup = "";
            matchedTeam = null;
          }
        }
        
        // If matched via alias, the aliasRole becomes the extractedRole
        if (isAlias && aliasRole) {
          extractedRole = aliasRole;
        }

        // Track role changes for CAMARA department
        let roleChanged = false;
        let existingRole: string | null = null;

        let action: "create" | "update" | "skip" | "no_change" | "restore" = "create";
        let skipReason: string | undefined;
        let existingWorkerId: string | undefined;
        let changeDetails: string[] = [];
        let previousDepartmentId: string | null | undefined = undefined;
        let currentPendingVacationDays = 0;
        let vacationDaysChanged = false;
        let currentStartContractDate: string | null = null;
        let contractDateChanged = false;
        let currentWorkerCode: string | undefined;
        let workerCodeChanged = false;
        let currentFiscalId: string | undefined;
        let fiscalIdChanged = false;

        if (!workerNumber) {
          action = "skip";
          skipReason = "Sin número de trabajador";
        } else if (seenWorkerNumbers.has(workerNumber)) {
          action = "skip";
          skipReason = "Duplicado en CSV";
        } else {
          const existingWorker = existingWorkers.find((w: any) => w.worker_number === workerNumber);
          if (existingWorker) {
            existingWorkerId = existingWorker.id;
            previousDepartmentId = existingWorker.department_id;
            currentPendingVacationDays = existingWorker.pending_vacation_days || 0;
            currentStartContractDate = existingWorker.start_contract_date || null;
            existingRole = existingWorker.role || null;
            currentWorkerCode = existingWorker.worker_code || "";
            currentFiscalId = existingWorker.fiscal_id || "";
            
            
            // Check if worker is soft-deleted (needs restoration)
            const isDeleted = !!existingWorker.deleted_at;
            
            if (isDeleted) {
              // Worker was previously deleted - mark for restoration
              action = "restore";
              changeDetails = ["Trabajador eliminado anteriormente - se restaurará"];
            } else {
              const csvIsOnLeave = absenceStatus === "baja";
              const csvIsOnVacation = absenceStatus === "vacaciones";
              const changes: string[] = [];
              
              if (existingWorker.name?.toLowerCase().trim() !== fullName.toLowerCase().trim()) {
                changes.push(`Nombre: "${existingWorker.name}" → "${fullName}"`);
              }
              
              if (matchedDept && existingWorker.department_id !== matchedDept.id) {
                const existingDeptName = departments.find(d => d.id === existingWorker.department_id)?.name || "desconocido";
                changes.push(`Departamento: ${existingDeptName} → ${matchedDept.name}`);
              } else if (!matchedDept && extractedDept) {
                // New department not recognized but CSV shows a different dept name
                const existingDeptName = departments.find(d => d.id === existingWorker.department_id)?.name || "";
                const normalizedExisting = normalizeForMatch(existingDeptName);
                const normalizedExtracted = normalizeForMatch(extractedDept);
                if (normalizedExisting !== normalizedExtracted) {
                  changes.push(`Departamento: ${existingDeptName} → ${extractedDept} (no reconocido)`);
                }
              }
              
              if (matchedTeam && existingWorker.worker_team_id !== matchedTeam.id) {
                changes.push(`Equipo: ${matchedTeam.name}`);
              } else if (!matchedTeam && existingWorker.worker_team_id) {
                changes.push(`Equipo eliminado`);
              }
              
              if (existingWorker.is_on_leave !== csvIsOnLeave) {
                changes.push(csvIsOnLeave ? "Estado: Baja" : "Estado: Activo");
              }
              
              // Also compare vacation status - if worker was on vacation but CSV says not anymore
              if (existingWorker.is_on_vacation !== csvIsOnVacation) {
                changes.push(csvIsOnVacation ? "Estado: Vacaciones" : "Fin vacaciones");
              }

              // Compare role (for CAMARA department)
              if (extractedRole && extractedRole !== existingRole) {
                changes.push(`Rol: ${existingRole || 'sin rol'} → ${extractedRole}`);
                roleChanged = true;
              }

              // Compare vacation days
              if (vacationDaysColIndex !== -1 && pendingVacationDays !== currentPendingVacationDays) {
                changes.push(`Días pendientes: ${currentPendingVacationDays} → ${pendingVacationDays}`);
                vacationDaysChanged = true;
              }
              
              // Compare contract date - ONLY flag as change if existing worker has NO contract date
              // If the worker already has a contract date, don't notify/overwrite
              if (contractDateColIndex !== -1 && startContractDate && !currentStartContractDate) {
                changes.push(`Fecha contrato: sin fecha → ${startContractDate}`);
                contractDateChanged = true;
              }

              // Compare worker code (siglas)
              if (workerCode && workerCode !== (currentWorkerCode || "")) {
                changes.push(`Siglas: ${currentWorkerCode || 'sin siglas'} → ${workerCode}`);
                workerCodeChanged = true;
              }

              // Compare fiscal ID (DNI/NIE)
              if (fiscalId && fiscalId !== (currentFiscalId || "")) {
                changes.push(`DNI/NIE: ${currentFiscalId || 'sin DNI'} → ${fiscalId}`);
                fiscalIdChanged = true;
              }

              if (changes.length > 0) {
                action = "update";
                changeDetails = changes;
              } else {
                action = "no_change";
              }
            }
          }
          seenWorkerNumbers.add(workerNumber);
        }

        // B) Si la acción es "create" pero no hay departamento válido, cambiar a "skip"
        let finalAction = action;
        let finalSkipReason = skipReason;
        if (action === "create" && !matchedDept) {
          finalAction = "skip";
          finalSkipReason = `Departamento no reconocido: "${extractedDept}"`;
        }

        // A) Solo auto-seleccionar si hay departamento válido
        const shouldAutoSelect = (finalAction === "create" || finalAction === "update" || finalAction === "restore") && !!matchedDept?.id;

        parsed.push({
          rowIndex: i,
          workerNumber,
          fullName,
          workerCode,
          fiscalId,
          currentFiscalId,
          fiscalIdChanged,
          rawDeptGroup,
          extractedDepartment: extractedDept,
          extractedGroup,
          extractedRole,
          matchedDepartmentId: matchedDept?.id || null,
          matchedDepartmentName: matchedDept?.name || null,
          matchedTeamId: matchedTeam?.id || null,
          matchedTeamName: matchedTeam?.name || null,
          absenceStatus,
          absenceRaw: rawAbsence,
          action: finalAction,
          skipReason: finalSkipReason,
          changeDetails,
          selected: shouldAutoSelect,
          existingWorkerId,
          existingRole,
          pendingVacationDays,
          currentPendingVacationDays,
          previousDepartmentId,
          vacationDaysChanged,
          roleChanged,
          startContractDate,
          currentStartContractDate,
          contractDateChanged,
          currentWorkerCode,
          workerCodeChanged,
        });
      }

      // Detect workers not in CSV (exclude soft-deleted workers from "delete" suggestions)
      const csvWorkerNumbers = new Set(seenWorkerNumbers);
      for (const existingWorker of existingWorkers) {
        // Skip soft-deleted workers - they shouldn't show as "to delete"
        if (existingWorker.deleted_at) continue;
        
        if (!csvWorkerNumbers.has(existingWorker.worker_number)) {
          const workerDept = departments.find(d => d.id === existingWorker.department_id);
          const workerTeam = freshTeams.find(t => t.id === existingWorker.worker_team_id);
          
          parsed.push({
            rowIndex: parsed.length + 1000,
            workerNumber: existingWorker.worker_number,
            fullName: existingWorker.name,
            workerCode: existingWorker.worker_code || "",
            fiscalId: existingWorker.fiscal_id || "",
            rawDeptGroup: workerDept?.name || "",
            extractedDepartment: workerDept?.name || "",
            extractedGroup: workerTeam?.name || "",
            extractedRole: existingWorker.role || null,
            matchedDepartmentId: existingWorker.department_id,
            matchedDepartmentName: workerDept?.name || null,
            matchedTeamId: existingWorker.worker_team_id,
            matchedTeamName: workerTeam?.name || null,
            existingTeamName: workerTeam?.name || undefined,
            existingRole: existingWorker.role || null,
            absenceStatus: existingWorker.is_on_leave ? "baja" : "active",
            absenceRaw: "",
            action: "delete",
            skipReason: "No aparece en CSV",
            selected: false,
            existingWorkerId: existingWorker.id,
            pendingVacationDays: existingWorker.pending_vacation_days || 0,
            currentPendingVacationDays: existingWorker.pending_vacation_days || 0,
          });
        }
      }

      if (parsed.length === 0) {
        toast.error("No se encontraron empleados válidos en el archivo CSV");
        setIsProcessing(false);
        return;
      }

      setParsedEmployees(normalizeEmployeeSelection(parsed));
      setStep("preview");
      
      const deleteCount = parsed.filter(p => p.action === "delete").length;
      const vacationChanges = parsed.filter(p => p.vacationDaysChanged).length;
      
      let message = `${parsed.length} empleados encontrados`;
      if (deleteCount > 0) message += ` (${deleteCount} no en CSV)`;
      if (vacationChanges > 0) message += ` (${vacationChanges} con días pendientes diferentes)`;
      toast.success(message);
      
    } catch (err) {
      console.error("Error processing CSV:", err);
      toast.error("Error al procesar el archivo CSV");
    } finally {
      setIsProcessing(false);
    }
  }, [getSessionToken, matchDepartment, matchTeam, departments, teams]);

  // Handle file upload
  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) {
      toast.error("Solo se permiten archivos CSV");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const { headers, rows } = parseCSV(content);

      if (headers.length === 0 || rows.length === 0) {
        toast.error("El archivo CSV está vacío o tiene formato incorrecto");
        return;
      }

      // Store raw CSV data for potential re-processing
      setStoredCsvData({ headers, rows });
      processCSVData(headers, rows);
    };
    reader.onerror = () => toast.error("Error al leer el archivo");
    reader.readAsText(file, "UTF-8");
  }, [processCSVData]);

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    let result = parsedEmployees;
    
    if (selectedDepartmentFilter !== "all") {
      result = result.filter(emp =>
        emp.matchedDepartmentId === selectedDepartmentFilter
      );
    }
    
    if (selectedActionFilter !== "all") {
      result = result.filter(emp => emp.action === selectedActionFilter);
    }
    
    if (selectedStatusFilter !== "all") {
      result = result.filter(emp => emp.absenceStatus === selectedStatusFilter);
    }
    
    return result;
  }, [parsedEmployees, selectedDepartmentFilter, selectedActionFilter, selectedStatusFilter, departments]);

  // Statistics
  const stats = useMemo(() => {
    const actionableInView = filteredEmployees.filter(isActionableEmployee);

    const isScoped =
      selectedDepartmentFilter !== "all" ||
      selectedActionFilter !== "all" ||
      selectedStatusFilter !== "all";

    const selectedInView = actionableInView.filter((e) => e.selected === true);
    const selectedGlobal = parsedEmployees.filter(
      (e) => isActionableEmployee(e) && e.selected === true
    );

    // Count existing workers that can have vacation days updated
    const existingWorkersWithDays = parsedEmployees.filter((e) => e.existingWorkerId && e.action !== "skip");
    
    // Count existing workers that have contract date CHANGED (new or different)
    const existingWorkersWithContractDate = parsedEmployees.filter(
      (e) => e.existingWorkerId && e.action !== "skip" && e.contractDateChanged
    );

    // Count existing workers that have DNI/NIE CHANGED (new or different)
    const existingWorkersWithFiscalIdChanged = parsedEmployees.filter(
      (e) => e.existingWorkerId && e.action !== "skip" && e.fiscalIdChanged
    );

    return {
      total: filteredEmployees.length,
      selected: isScoped ? selectedInView.length : selectedGlobal.length,
      toCreate: filteredEmployees.filter((e) => e.action === "create").length,
      toRestore: filteredEmployees.filter((e) => e.action === "restore").length,
      toUpdate: filteredEmployees.filter((e) => e.action === "update").length,
      toDelete: filteredEmployees.filter((e) => e.action === "delete").length,
      noChange: filteredEmployees.filter((e) => e.action === "no_change").length,
      skipped: filteredEmployees.filter((e) => e.action === "skip").length,
      // Unique teams that will be auto-created (extracted from CSV but don't exist yet)
      teamsToCreate: [...new Set(
        actionableInView
          .filter((e) => !e.matchedTeamId && e.extractedGroup)
          .map((e) => `${e.matchedDepartmentId}::${e.extractedGroup.toUpperCase()}`)
      )].length,
      // Employees without any team info
      noTeam: actionableInView.filter((e) => !e.matchedTeamId && !e.extractedGroup).length,
      noDept: actionableInView.filter((e) => !e.matchedDepartmentId).length,
      onBaja: filteredEmployees.filter((e) => e.absenceStatus === "baja").length,
      onVacaciones: filteredEmployees.filter((e) => e.absenceStatus === "vacaciones").length,
      vacationDaysChanges: parsedEmployees.filter((e) => e.vacationDaysChanged).length,
      contractDateChanges: parsedEmployees.filter((e) => e.contractDateChanged).length,
      fiscalIdChanges: parsedEmployees.filter((e) => e.fiscalIdChanged).length,
      existingWorkersCount: existingWorkersWithDays.length,
      existingWorkersWithContractDateCount: existingWorkersWithContractDate.length,
      existingWorkersWithFiscalIdChangedCount: existingWorkersWithFiscalIdChanged.length,
    };
  }, [filteredEmployees, parsedEmployees, selectedDepartmentFilter, selectedActionFilter, selectedStatusFilter]);

  // Calculate which departments have pending actions (create, update, delete)
  // Uses matchedDepartmentId for accurate counting
  const departmentsWithPendingActions = useMemo(() => {
    const deptPendingMap = new Map<string, { create: number; update: number; delete: number; restore: number }>();
    
    for (const dept of departments) {
      // Count employees that match this department using matchedDepartmentId
      const deptEmployees = parsedEmployees.filter(emp =>
        emp.matchedDepartmentId === dept.id
      );
      
      const counts = { create: 0, update: 0, delete: 0, restore: 0 };
      for (const emp of deptEmployees) {
        if (emp.action === "create") counts.create++;
        else if (emp.action === "update") counts.update++;
        else if (emp.action === "delete") counts.delete++;
        else if (emp.action === "restore") counts.restore++;
      }
      
      if (counts.create > 0 || counts.update > 0 || counts.delete > 0 || counts.restore > 0) {
        deptPendingMap.set(dept.id, counts);
      }
    }
    
    return deptPendingMap;
  }, [parsedEmployees, departments]);

  // Toggle employee selection
  const toggleEmployee = (rowIndex: number) => {
    setParsedEmployees(prev => prev.map(emp =>
      emp.rowIndex === rowIndex && isActionableEmployee(emp)
        ? { ...emp, selected: !(emp.selected === true) }
        : emp
    ));
  };

  // Toggle all
  const toggleAll = (selected: boolean) => {
    const filteredRowIndices = new Set(
      filteredEmployees
        .filter(isActionableEmployee)
        .map(e => e.rowIndex)
    );
    
    setParsedEmployees(prev => prev.map(emp => ({
      ...emp,
      selected: filteredRowIndices.has(emp.rowIndex) ? selected : emp.selected
    })));
  };

  // Execute import
  const executeImport = async () => {
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      toast.error("Sesión no válida");
      return;
    }

    // Ensure the session is really valid before starting a long import
    const okSession = await validateSessionToken(sessionToken);
    if (!okSession) return;

    const isScoped =
      selectedDepartmentFilter !== "all" ||
      selectedActionFilter !== "all" ||
      selectedStatusFilter !== "all";

    const scopeEmployees = isScoped ? filteredEmployees : parsedEmployees;
    const results: ImportResult[] = [];

    // Based on import action type, decide what to process
    if (importAction === "vacation_days_only") {
      // Update vacation days for ALL existing workers in CSV (not just those with changes)
      const vacationUpdates = scopeEmployees.filter(
        (e) => e.existingWorkerId && e.action !== "skip"
      );

      if (vacationUpdates.length === 0) {
        toast.error("No hay trabajadores existentes en el CSV para actualizar días");
        return;
      }

      setStep("importing");

      for (const emp of vacationUpdates) {
        try {
          const { data, error } = await supabase.functions.invoke("admin-operations", {
            body: {
              action: "updateWorkerVacationDays",
              sessionToken,
              data: {
                workerId: emp.existingWorkerId,
                pendingVacationDays: emp.pendingVacationDays,
              },
            },
          });

          if (isInvalidSessionError(data, error)) {
            handleSessionExpired();
            return;
          }

          if (data?.success) {
            results.push({
              workerNumber: emp.workerNumber,
              name: emp.fullName,
              workerId: emp.existingWorkerId,
              status: "vacation_updated",
              oldDays: emp.currentPendingVacationDays,
              newDays: emp.pendingVacationDays,
            });
          } else {
            results.push({
              workerNumber: emp.workerNumber,
              name: emp.fullName,
              status: "error",
              reason: data?.error || "Error desconocido",
            });
          }
        } catch (err: any) {
          results.push({
            workerNumber: emp.workerNumber,
            name: emp.fullName,
            status: "error",
            reason: err.message || "Error de conexión",
          });
        }
      }
    } else if (importAction === "contract_dates_only") {
      // Update contract dates only for workers with CHANGED contract date
      const contractUpdates = scopeEmployees.filter(
        (e) => e.existingWorkerId && e.action !== "skip" && e.contractDateChanged
      );

      if (contractUpdates.length === 0) {
        toast.error("No hay trabajadores existentes con fecha de contrato para actualizar");
        return;
      }

      setStep("importing");

      for (const emp of contractUpdates) {
        try {
          const { data, error } = await supabase.functions.invoke("admin-operations", {
            body: {
              action: "updateWorkerContractDate",
              sessionToken,
              data: {
                workerId: emp.existingWorkerId,
                startContractDate: emp.startContractDate,
              },
            },
          });

          if (isInvalidSessionError(data, error)) {
            handleSessionExpired();
            return;
          }

          if (data?.success) {
            results.push({
              workerNumber: emp.workerNumber,
              name: emp.fullName,
              workerId: emp.existingWorkerId,
              status: "updated",
              reason: `Fecha contrato: ${emp.startContractDate}`,
            });
          } else {
            results.push({
              workerNumber: emp.workerNumber,
              name: emp.fullName,
              status: "error",
              reason: data?.error || "Error desconocido",
            });
          }
        } catch (err: any) {
          results.push({
            workerNumber: emp.workerNumber,
            name: emp.fullName,
            status: "error",
            reason: err.message || "Error de conexión",
          });
        }
      }
    } else if (importAction === "fiscal_id_only") {
      // Update DNI/NIE only for workers with CHANGED fiscal_id
      const fiscalIdUpdates = scopeEmployees.filter(
        (e) => e.existingWorkerId && e.action !== "skip" && e.fiscalIdChanged
      );

      if (fiscalIdUpdates.length === 0) {
        toast.error("No hay trabajadores con DNI/NIE nuevo o cambiado para actualizar");
        return;
      }

      setStep("importing");

      for (const emp of fiscalIdUpdates) {
        try {
          const { data, error } = await supabase.functions.invoke("admin-operations", {
            body: {
              action: "updateWorker",
              sessionToken,
              data: {
                workerId: emp.existingWorkerId,
                fiscalId: emp.fiscalId,
              },
            },
          });

          if (isInvalidSessionError(data, error)) {
            handleSessionExpired();
            return;
          }

          if (data?.success) {
            results.push({
              workerNumber: emp.workerNumber,
              name: emp.fullName,
              workerId: emp.existingWorkerId,
              status: "updated",
              reason: `DNI/NIE: ${emp.fiscalId || "—"}`,
            });
          } else {
            results.push({
              workerNumber: emp.workerNumber,
              name: emp.fullName,
              status: "error",
              reason: data?.error || "Error desconocido",
            });
          }
        } catch (err: any) {
          results.push({
            workerNumber: emp.workerNumber,
            name: emp.fullName,
            status: "error",
            reason: err.message || "Error de conexión",
          });
        }
      }
    } else {
      // Full import or workers only - include restore action
      const toImport = scopeEmployees.filter(
        (e) => e.selected && (e.action === "create" || e.action === "update" || e.action === "restore")
      );
      const toDeleteWorkers = scopeEmployees.filter((e) => e.selected && e.action === "delete");

      if (toImport.length === 0 && toDeleteWorkers.length === 0) {
        toast.error("No hay empleados seleccionados para importar o eliminar");
        return;
      }

      setStep("importing");

      // Import/update workers
      for (const emp of toImport) {
        try {
          const { data, error } = await supabase.functions.invoke("admin-operations", {
            body: {
              action: "importWorker",
              sessionToken,
              data: {
                workerNumber: emp.workerNumber,
                name: emp.fullName,
                departmentId: emp.matchedDepartmentId,
                teamId: emp.matchedTeamId,
                teamName: emp.extractedGroup,
                role: emp.extractedRole, // CAMARA department role
                isOnLeave: emp.absenceStatus === "baja",
                isOnVacation: emp.absenceStatus === "vacaciones",
                isUpdate: emp.action === "update" || emp.action === "restore",
                existingWorkerId: emp.existingWorkerId,
                isRestore: emp.action === "restore",
                // Include vacation days if action is "all"
                pendingVacationDays: importAction === "all" ? emp.pendingVacationDays : undefined,
                previousDepartmentId: emp.previousDepartmentId,
                // Include start contract date if present
                startContractDate: emp.startContractDate || undefined,
                // Include worker code (siglas)
                workerCode: emp.workerCode || undefined,
                // Include DNI/NIE
                fiscalId: emp.fiscalId || undefined,
              }
            }
          });

          if (isInvalidSessionError(data, error)) {
            handleSessionExpired();
            return;
          }

          if (data?.success) {
            const resultStatus = data.action === 'restored' ? 'restored' : 
                                 emp.action === "update" ? "updated" : "created";
            results.push({
              workerNumber: emp.workerNumber,
              name: emp.fullName,
              workerId: data.workerId || emp.existingWorkerId,
              status: resultStatus
            });
          } else {
            results.push({
              workerNumber: emp.workerNumber,
              name: emp.fullName,
              status: "error",
              reason: data?.error || "Error desconocido"
            });
          }
        } catch (err: any) {
          results.push({
            workerNumber: emp.workerNumber,
            name: emp.fullName,
            status: "error",
            reason: err.message || "Error de conexión"
          });
        }
      }

      // Delete workers
      for (const emp of toDeleteWorkers) {
        try {
          const { data, error } = await supabase.functions.invoke("admin-operations", {
            body: {
              action: "deleteWorker",
              sessionToken,
              data: { 
                workerId: emp.existingWorkerId,
                reason: "No aparece en CSV"
              }
            }
          });

          if (isInvalidSessionError(data, error)) {
            handleSessionExpired();
            return;
          }

          if (data?.success) {
            results.push({
              workerNumber: emp.workerNumber,
              name: emp.fullName,
              workerId: emp.existingWorkerId,
              status: "deleted"
            });
          } else {
            results.push({
              workerNumber: emp.workerNumber,
              name: emp.fullName,
              status: "error",
              reason: data?.error || "Error al eliminar"
            });
          }
        } catch (err: any) {
          results.push({
            workerNumber: emp.workerNumber,
            name: emp.fullName,
            status: "error",
            reason: err.message || "Error de conexión"
          });
        }
      }
    }

    setImportResults(results);
    setStep("results");

    const created = results.filter(r => r.status === "created").length;
    const updated = results.filter(r => r.status === "updated").length;
    const restored = results.filter(r => r.status === "restored").length;
    const deleted = results.filter(r => r.status === "deleted").length;
    const vacationUpdated = results.filter(r => r.status === "vacation_updated").length;
    const errors = results.filter(r => r.status === "error").length;

    const messages: string[] = [];
    if (created > 0) messages.push(`${created} creados`);
    if (restored > 0) messages.push(`${restored} restaurados`);
    if (updated > 0) messages.push(`${updated} actualizados`);
    if (deleted > 0) messages.push(`${deleted} eliminados`);
    if (vacationUpdated > 0) messages.push(`${vacationUpdated} días actualizados`);
    
    // C) Mejorar mensajes: si no hay éxitos pero hay errores, mostrar solo error
    if (messages.length > 0) {
      toast.success(`Completado: ${messages.join(", ")}`);
      const createdWorkerNumbers = results.filter(r => r.status === "created" || r.status === "restored").map(r => r.workerNumber);
      const updatedWorkerNumbers = results.filter(r => r.status === "updated" || r.status === "vacation_updated").map(r => r.workerNumber);
      onImportComplete({ createdWorkers: createdWorkerNumbers, updatedWorkers: updatedWorkerNumbers });
      if (errors > 0) {
        toast.warning(`${errors} errores durante la operación`);
      }
    } else if (errors > 0) {
      // No hubo ningún éxito, solo errores
      toast.error(`Operación fallida: ${errors} errores`);
    }
  };

  // Reset
  const resetImport = () => {
    setStep("upload");
    setParsedEmployees([]);
    setSelectedDepartmentFilter("all");
    setSelectedActionFilter("all");
    setSelectedStatusFilter("all");
    setImportResults([]);
    setExpandedResultSection(null);
    setHasVacationDaysColumn(false);
    setHasContractDateColumn(false);
    setHasFiscalIdColumn(false);
    setImportAction("all");
    setStoredCsvData(null);
  };

  // Continue importing - re-process the same CSV without re-uploading
  const continueImporting = useCallback(() => {
    if (storedCsvData) {
      // Re-process the stored CSV data to check what's remaining
      setSelectedDepartmentFilter("all");
      setSelectedActionFilter("all");
      setSelectedStatusFilter("all");
      setExpandedResultSection(null);
      setImportAction("all");
      processCSVData(storedCsvData.headers, storedCsvData.rows);
    } else {
      // Fallback to upload step if no stored data
      setStep("upload");
      setParsedEmployees([]);
      setSelectedDepartmentFilter("all");
      setSelectedActionFilter("all");
      setSelectedStatusFilter("all");
      setExpandedResultSection(null);
      setHasVacationDaysColumn(false);
      setImportAction("all");
    }
    // Keep importResults for reference
  }, [storedCsvData, processCSVData]);

  // Copy results
  const copyResults = () => {
    const created = importResults.filter(r => r.status === "created").length;
    const updated = importResults.filter(r => r.status === "updated").length;
    const restored = importResults.filter(r => r.status === "restored").length;
    const deleted = importResults.filter(r => r.status === "deleted").length;
    const vacationUpdated = importResults.filter(r => r.status === "vacation_updated").length;
    const errors = importResults.filter(r => r.status === "error");

    let summary = `Operación CSV completada:\n- Creados: ${created}\n- Restaurados: ${restored}\n- Actualizados: ${updated}\n- Eliminados: ${deleted}\n- Días actualizados: ${vacationUpdated}`;
    if (errors.length > 0) {
      summary += `\n\nErrores (${errors.length}):\n${errors.map(e => `${e.workerNumber}: ${e.reason}`).join("\n")}`;
    }
    navigator.clipboard.writeText(summary);
    toast.success("Resumen copiado al portapapeles");
  };

  // Download errors CSV
  const downloadErrors = () => {
    const errors = importResults.filter(r => r.status === "error");
    if (errors.length === 0) return;

    const csv = "Numero,Nombre,Error\n" + errors.map(e =>
      `"${e.workerNumber}","${e.name}","${e.reason}"`
    ).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "errores_importacion.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" />
          Importar desde CSV
        </CardTitle>
        <CardDescription>
          Carga el archivo CSV exportado para sincronizar trabajadores y días pendientes
        </CardDescription>
      </CardHeader>
      <CardContent>
        <StepIndicator currentStep={currentStepIndex} />

        {/* Upload Step */}
        {step === "upload" && (
          <div className="space-y-6">
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
              }}
              onClick={() => document.getElementById("csv-file-input")?.click()}
            >
              {isProcessing ? (
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="w-12 h-12 animate-spin text-primary" />
                  <p className="text-lg font-medium">Procesando archivo...</p>
                </div>
              ) : (
                <>
                  <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium mb-2">
                    Arrastra tu archivo CSV aquí
                  </p>
                  <p className="text-sm text-muted-foreground mb-4">
                    o haz clic para seleccionar
                  </p>
                  <input
                    id="csv-file-input"
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                  />
                  <Button variant="outline" size="sm">
                    Seleccionar archivo
                  </Button>
                </>
              )}
            </div>

          </div>
        )}

        {/* Preview Step */}
        {(step === "preview" || step === "importing") && (
          <div className="space-y-4">
            {/* Action selector */}
            <Card className="bg-muted/30">
              <CardContent className="pt-4">
                <div className="flex flex-col gap-3">
                  <label className="text-sm font-medium">¿Qué quieres hacer con este CSV?</label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={importAction === "all" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setImportAction("all")}
                      className="gap-2"
                    >
                      <Users className="h-4 w-4" />
                      Todo (trabajadores + días)
                    </Button>
                    <Button
                      variant={importAction === "workers_only" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setImportAction("workers_only")}
                      className="gap-2"
                    >
                      <UserCog className="h-4 w-4" />
                      Solo trabajadores
                    </Button>
                    {hasVacationDaysColumn && stats.existingWorkersCount > 0 && (
                      <Button
                        variant={importAction === "vacation_days_only" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setImportAction("vacation_days_only")}
                        className="gap-2"
                      >
                        <CalendarDays className="h-4 w-4" />
                        Solo días pendientes ({stats.existingWorkersCount})
                      </Button>
                    )}
                    {hasContractDateColumn && stats.existingWorkersCount > 0 && (
                      <Button
                        variant={importAction === "contract_dates_only" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setImportAction("contract_dates_only")}
                        className="gap-2"
                      >
                        <CalendarClock className="h-4 w-4" />
                        Solo fechas contrato ({stats.existingWorkersCount})
                      </Button>
                    )}
                    {hasFiscalIdColumn && stats.existingWorkersWithFiscalIdChangedCount > 0 && (
                      <Button
                        variant={importAction === "fiscal_id_only" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setImportAction("fiscal_id_only")}
                        className="gap-2"
                      >
                        <FileText className="h-4 w-4" />
                        Solo DNI/NIE ({stats.existingWorkersWithFiscalIdChangedCount})
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Filters */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Filtros</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  <div className="flex-1 min-w-[180px]">
                    <label className="text-sm text-muted-foreground mb-1.5 block">Departamento</label>
                    <Select value={selectedDepartmentFilter} onValueChange={setSelectedDepartmentFilter}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Todos los departamentos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos los departamentos</SelectItem>
                        {departments.map(dept => {
                          const pending = departmentsWithPendingActions.get(dept.id);
                          const hasPending = pending && (pending.create > 0 || pending.update > 0 || pending.delete > 0 || pending.restore > 0);
                          const totalPending = pending ? pending.create + pending.update + pending.delete + pending.restore : 0;
                          
                          return (
                            <SelectItem 
                              key={dept.id} 
                              value={dept.id}
                              className={hasPending ? "text-primary font-medium" : ""}
                            >
                              <span className="flex items-center gap-2">
                                {dept.name}
                                {hasPending && (
                                  <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                                    {totalPending}
                                  </span>
                                )}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex-1 min-w-[150px]">
                    <label className="text-sm text-muted-foreground mb-1.5 block">Acción</label>
                    <Select value={selectedActionFilter} onValueChange={setSelectedActionFilter}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Todas las acciones" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="create">Crear</SelectItem>
                        <SelectItem value="restore">Restaurar</SelectItem>
                        <SelectItem value="update">Actualizar</SelectItem>
                        <SelectItem value="delete">Eliminar (no en CSV)</SelectItem>
                        <SelectItem value="skip">Omitidos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex-1 min-w-[150px]">
                    <label className="text-sm text-muted-foreground mb-1.5 block">Estado</label>
                    <Select value={selectedStatusFilter} onValueChange={setSelectedStatusFilter}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Todos los estados" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="baja">De baja</SelectItem>
                        <SelectItem value="vacaciones">Vacaciones</SelectItem>
                        <SelectItem value="active">Activo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="text-2xl font-bold">{stats.total}</div>
                  <p className="text-xs text-muted-foreground">Total</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="text-2xl font-bold text-green-500">{stats.toCreate}</div>
                  <p className="text-xs text-muted-foreground">Nuevos</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="text-2xl font-bold text-blue-500">{stats.toUpdate}</div>
                  <p className="text-xs text-muted-foreground">Actualizar</p>
                </CardContent>
              </Card>
              {stats.toRestore > 0 && (
                <Card 
                  className={`border-purple-500/30 cursor-pointer hover:bg-purple-500/5 transition-colors ${selectedActionFilter === "restore" ? "bg-purple-500/10" : ""}`}
                  onClick={() => setSelectedActionFilter(selectedActionFilter === "restore" ? "all" : "restore")}
                >
                  <CardContent className="pt-4 pb-3">
                    <div className="text-2xl font-bold text-purple-500">{stats.toRestore}</div>
                    <p className="text-xs text-muted-foreground">Restaurar</p>
                  </CardContent>
                </Card>
              )}
              {stats.noChange > 0 && (
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <div className="text-2xl font-bold text-muted-foreground">{stats.noChange}</div>
                    <p className="text-xs text-muted-foreground">Sin cambios</p>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="text-2xl font-bold text-yellow-500">{stats.skipped}</div>
                  <p className="text-xs text-muted-foreground">Omitidos</p>
                </CardContent>
              </Card>
              {stats.toDelete > 0 && (
                <Card 
                  className={`border-red-500/30 cursor-pointer hover:bg-red-500/5 transition-colors ${selectedActionFilter === "delete" ? "bg-red-500/10" : ""}`}
                  onClick={() => setSelectedActionFilter(selectedActionFilter === "delete" ? "all" : "delete")}
                >
                  <CardContent className="pt-4 pb-3">
                    <div className="text-2xl font-bold text-red-500">{stats.toDelete}</div>
                    <p className="text-xs text-muted-foreground">No en CSV</p>
                  </CardContent>
                </Card>
              )}
              {hasVacationDaysColumn && stats.vacationDaysChanges > 0 && (
                <Card className="border-primary/30">
                  <CardContent className="pt-4 pb-3">
                    <div className="text-2xl font-bold text-primary">{stats.vacationDaysChanges}</div>
                    <p className="text-xs text-muted-foreground">Días diferentes</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Info: Teams to create */}
            {stats.teamsToCreate > 0 && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <Users className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium text-primary">Equipos nuevos</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Se crearán automáticamente {stats.teamsToCreate} equipo(s) que no existen en el departamento
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Workers not in CSV warning */}
            {stats.toDelete > 0 && (
              <Card className="border-red-500/50 bg-red-500/5">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <UserMinus className="w-5 h-5 text-red-500 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-red-500">Trabajadores no encontrados en CSV</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {stats.toDelete} trabajador(es) están en el sistema pero no aparecen en el archivo CSV. 
                        Selecciónalos y pulsa "Procesar" para eliminarlos.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 border-red-500/30 text-red-500 hover:bg-red-500/10"
                        onClick={() => {
                          setSelectedActionFilter("delete");
                          // Auto-select all delete employees
                          setParsedEmployees(prev => prev.map(emp => ({
                            ...emp,
                            selected: emp.action === "delete" ? true : emp.selected
                          })));
                        }}
                      >
                        <UserMinus className="w-4 h-4 mr-2" />
                        Seleccionar todos para eliminar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Warnings */}
            {(stats.noDept > 0 || stats.noTeam > 0) && (
              <Card className="border-yellow-500/50">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5" />
                    <div>
                      <p className="font-medium">Advertencias</p>
                      <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                        {stats.noDept > 0 && (
                          <li>{stats.noDept} empleado(s) sin departamento asignado</li>
                        )}
                        {stats.noTeam > 0 && (
                          <li>{stats.noTeam} empleado(s) sin equipo en el CSV</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Employee Table */}
            {filteredEmployees.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Empleados ({stats.selected} seleccionados)
                    </CardTitle>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => toggleAll(true)}>
                        Todos
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => toggleAll(false)}>
                        Ninguno
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border max-h-96 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-background sticky top-0 z-10 border-b">
                        <tr>
                          <th className="w-10 p-3 text-left bg-background"></th>
                          <th className="w-24 p-3 text-left font-medium bg-background whitespace-nowrap">Nº</th>
                          <th className="p-3 text-left font-medium bg-background">Nombre</th>
                          <th className="p-3 text-left font-medium bg-background whitespace-nowrap">Departamento</th>
                          <th className="w-16 p-3 text-left font-medium bg-background whitespace-nowrap">Equipo</th>
                          <th className="w-24 p-3 text-left font-medium bg-background whitespace-nowrap">Estado</th>
                          <th className="w-28 p-3 text-left font-medium bg-background whitespace-nowrap">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEmployees.filter(e => e.action !== "no_change").map((emp) => (
                          <tr
                            key={emp.rowIndex}
                            className={`border-t ${emp.action === "skip" ? "opacity-50" : ""}`}
                          >
                            <td className="p-3">
                              <Checkbox
                                checked={emp.selected === true}
                                onCheckedChange={() => toggleEmployee(emp.rowIndex)}
                                disabled={!isActionableEmployee(emp)}
                              />
                            </td>
                            <td className="p-3 font-mono">
                              {emp.workerNumber ? (
                                <a
                                  href={`https://salix.verdnatura.es/#!/worker/${emp.workerNumber}/summary`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline flex items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {emp.workerNumber}
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td className="p-3 truncate">
                              {emp.fullName || "-"}
                              {emp.workerCode && (
                                <span className="ml-1.5 text-xs text-muted-foreground font-mono">[{emp.workerCode}]</span>
                              )}
                              {emp.fiscalId && (
                                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                  {emp.fiscalId}
                                </div>
                              )}
                            </td>
                            <td className="p-3">
                              <div className="flex flex-col gap-0.5">
                                {emp.matchedDepartmentName ? (
                                  <span>{emp.matchedDepartmentName}</span>
                                ) : (
                                  <span className="text-muted-foreground italic">
                                    {emp.extractedDepartment || "Sin departamento"}
                                  </span>
                                )}
                                {emp.extractedRole && (
                                  <span className="text-xs text-muted-foreground">
                                    Rol: {emp.extractedRole}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3">
                              {emp.matchedTeamName ? (
                                <Badge variant="outline">{emp.matchedTeamName}</Badge>
                              ) : emp.extractedGroup ? (
                                <span className="text-muted-foreground italic">{emp.extractedGroup}</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="p-3">
                              {emp.absenceStatus === "baja" && (
                                <Badge className="bg-red-500/10 text-red-500 hover:bg-red-500/20">
                                  <HeartPulse className="w-3 h-3 mr-1" />
                                  Baja
                                </Badge>
                              )}
                              {emp.absenceStatus === "vacaciones" && (
                                <Badge className="bg-cyan-500/10 text-cyan-500 hover:bg-cyan-500/20">
                                  <Umbrella className="w-3 h-3 mr-1" />
                                  Vacaciones
                                </Badge>
                              )}
                              {emp.absenceStatus === "active" && (
                                <span className="text-muted-foreground">Activo</span>
                              )}
                            </td>
                            <td className="p-3">
                              {emp.action === "create" && (
                                <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20">
                                  <UserPlus className="w-3 h-3 mr-1" />
                                  Crear
                                </Badge>
                              )}
                              {emp.action === "update" && (
                                <div className="space-y-1">
                                  <Badge className="bg-blue-500/10 text-blue-500 hover:bg-blue-500/20">
                                    <UserCog className="w-3 h-3 mr-1" />
                                    Actualizar
                                  </Badge>
                                  {emp.changeDetails && emp.changeDetails.length > 0 && (
                                    <p className="text-xs text-muted-foreground">{emp.changeDetails.join(", ")}</p>
                                  )}
                                </div>
                              )}
                              {emp.action === "restore" && (
                                <div className="space-y-1">
                                  <Badge className="bg-purple-500/10 text-purple-500 hover:bg-purple-500/20">
                                    <UserPlus className="w-3 h-3 mr-1" />
                                    Restaurar
                                  </Badge>
                                  {emp.changeDetails && emp.changeDetails.length > 0 && (
                                    <p className="text-xs text-muted-foreground">{emp.changeDetails.join(", ")}</p>
                                  )}
                                </div>
                              )}
                              {emp.action === "delete" && (
                                <div className="flex flex-col gap-1">
                                  <Badge className="bg-red-500/20 text-red-500 hover:bg-red-500/30 border border-red-500/30">
                                    <UserMinus className="w-3 h-3 mr-1" />
                                    No en CSV
                                  </Badge>
                                  <span className="text-xs text-red-500/70">Seleccionar para eliminar</span>
                                </div>
                              )}
                              {emp.action === "skip" && (
                                <Badge variant="secondary" className="text-yellow-600">
                                  {emp.skipReason || "Omitir"}
                                </Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Actions */}
            <div className="flex justify-between">
              <Button variant="outline" onClick={resetImport} disabled={step === "importing"}>
                Cancelar
              </Button>
              <Button
                onClick={executeImport}
                disabled={
                  step === "importing" || 
                  (importAction === "vacation_days_only" 
                    ? stats.existingWorkersCount === 0 
                    : importAction === "contract_dates_only"
                      ? stats.existingWorkersWithContractDateCount === 0
                      : importAction === "fiscal_id_only"
                        ? stats.existingWorkersWithFiscalIdChangedCount === 0
                        : stats.selected === 0
                  )
                }
              >
                {step === "importing" ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    {importAction === "vacation_days_only" 
                      ? `Actualizar ${stats.existingWorkersCount} días pendientes`
                      : importAction === "contract_dates_only"
                        ? `Actualizar ${stats.existingWorkersWithContractDateCount} fechas contrato`
                        : importAction === "fiscal_id_only"
                          ? `Actualizar ${stats.existingWorkersWithFiscalIdChangedCount} DNI/NIE`
                          : `Procesar ${stats.selected} empleado(s)`
                    }
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Results Step */}
        {step === "results" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                Operación completada
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {/* Created */}
                <button
                  onClick={() => setExpandedResultSection(expandedResultSection === "created" ? null : "created")}
                  className="text-center p-4 bg-green-500/10 rounded-lg hover:bg-green-500/20 transition-colors cursor-pointer"
                >
                  <div className="text-2xl font-bold text-green-500">
                    {importResults.filter(r => r.status === "created").length}
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                    Creados
                    {importResults.filter(r => r.status === "created").length > 0 && (
                      expandedResultSection === "created" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                    )}
                  </p>
                </button>
                
                {/* Updated */}
                <button
                  onClick={() => setExpandedResultSection(expandedResultSection === "updated" ? null : "updated")}
                  className="text-center p-4 bg-blue-500/10 rounded-lg hover:bg-blue-500/20 transition-colors cursor-pointer"
                >
                  <div className="text-2xl font-bold text-blue-500">
                    {importResults.filter(r => r.status === "updated").length}
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                    Actualizados
                    {importResults.filter(r => r.status === "updated").length > 0 && (
                      expandedResultSection === "updated" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                    )}
                  </p>
                </button>

                {/* Vacation Updated */}
                <button
                  onClick={() => setExpandedResultSection(expandedResultSection === "vacation_updated" ? null : "vacation_updated")}
                  className="text-center p-4 bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors cursor-pointer"
                >
                  <div className="text-2xl font-bold text-primary">
                    {importResults.filter(r => r.status === "vacation_updated").length}
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                    Días actualizados
                    {importResults.filter(r => r.status === "vacation_updated").length > 0 && (
                      expandedResultSection === "vacation_updated" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                    )}
                  </p>
                </button>

                {/* Deleted */}
                <button
                  onClick={() => setExpandedResultSection(expandedResultSection === "deleted" ? null : "deleted")}
                  className="text-center p-4 bg-orange-500/10 rounded-lg hover:bg-orange-500/20 transition-colors cursor-pointer"
                >
                  <div className="text-2xl font-bold text-orange-500">
                    {importResults.filter(r => r.status === "deleted").length}
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                    Eliminados
                    {importResults.filter(r => r.status === "deleted").length > 0 && (
                      expandedResultSection === "deleted" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                    )}
                  </p>
                </button>
                
                {/* Errors */}
                <button
                  onClick={() => setExpandedResultSection(expandedResultSection === "error" ? null : "error")}
                  className="text-center p-4 bg-red-500/10 rounded-lg hover:bg-red-500/20 transition-colors cursor-pointer"
                >
                  <div className="text-2xl font-bold text-red-500">
                    {importResults.filter(r => r.status === "error").length}
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                    Errores
                    {importResults.filter(r => r.status === "error").length > 0 && (
                      expandedResultSection === "error" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                    )}
                  </p>
                </button>
              </div>

              {/* Expanded section */}
              {expandedResultSection && (
                <div className="p-4 rounded-lg border bg-muted/30">
                  <p className="font-medium mb-3">
                    {expandedResultSection === "created" && "Trabajadores creados"}
                    {expandedResultSection === "updated" && "Trabajadores actualizados"}
                    {expandedResultSection === "vacation_updated" && "Días pendientes actualizados"}
                    {expandedResultSection === "deleted" && "Trabajadores eliminados"}
                    {expandedResultSection === "error" && "Errores"}
                  </p>
                  <div className="max-h-64 overflow-auto space-y-2">
                    {importResults
                      .filter(r => r.status === expandedResultSection)
                      .map((r, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-2 bg-background rounded border"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">{r.workerNumber}</span>
                            <span className="text-muted-foreground">-</span>
                            <span>{r.name}</span>
                            {r.oldDays !== undefined && r.newDays !== undefined && (
                              <span className="text-sm text-muted-foreground">
                                ({r.oldDays} → {r.newDays} días)
                              </span>
                            )}
                            {r.reason && (
                              <span className="text-sm text-destructive">({r.reason})</span>
                            )}
                          </div>
                          {expandedResultSection !== "error" && expandedResultSection !== "deleted" && onWorkerClick && (
                            <button
                              onClick={() => onWorkerClick(r.workerNumber)}
                              className="flex items-center gap-1 text-sm text-primary hover:underline"
                            >
                              Ver ficha
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    {importResults.filter(r => r.status === expandedResultSection).length === 0 && (
                      <p className="text-sm text-muted-foreground">No hay registros</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={copyResults}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copiar resumen
                </Button>
                {importResults.filter(r => r.status === "error").length > 0 && (
                  <Button variant="outline" size="sm" onClick={downloadErrors}>
                    <Download className="w-4 h-4 mr-2" />
                    Descargar errores
                  </Button>
                )}
                <Button variant="outline" onClick={continueImporting}>
                  <Upload className="w-4 h-4 mr-2" />
                  Añadir más
                </Button>
                <Button onClick={resetImport}>
                  Nueva importación
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
};
