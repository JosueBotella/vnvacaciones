import { cn } from "@/lib/utils";

interface Department {
  id: string;
  name: string;
}

interface DeptPillsProps {
  departments: Department[];
  selected: string;
  onChange: (id: string) => void;
  totalCount?: number;
  includeAll?: boolean;
  /** Optional per-department count map */
  counts?: Record<string, number>;
}

export function DeptPills({
  departments,
  selected,
  onChange,
  totalCount,
  includeAll = true,
  counts,
}: DeptPillsProps) {
  if (departments.length <= 1) return null;
  return (
    <div className="flex gap-1.5 flex-wrap">
      {includeAll && (
        <button
          onClick={() => onChange("all")}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
            selected === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          Todas{totalCount !== undefined ? ` (${totalCount})` : ""}
        </button>
      )}
      {departments.map(dept => {
        const count = counts?.[dept.id];
        return (
          <button
            key={dept.id}
            onClick={() => onChange(dept.id)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              selected === dept.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {dept.name}
            {count !== undefined ? ` (${count})` : ""}
          </button>
        );
      })}
    </div>
  );
}
