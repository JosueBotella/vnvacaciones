import { useState, useMemo } from "react";
import { Check, CheckCircle2, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Department = {
  id: string;
  name: string;
  slug?: string;
  schedule_configured?: boolean;
};

interface DepartmentSearchSelectProps {
  departments: Department[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  includeAll?: boolean;
  placeholder?: string;
  className?: string;
  showConfiguredStatus?: boolean;
}

// Remove accents for matching
const normalizeForSearch = (text: string): string => {
  return (text || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

export function DepartmentSearchSelect({
  departments,
  value,
  onChange,
  disabled = false,
  includeAll = true,
  placeholder = "Buscar departamento...",
  className,
  showConfiguredStatus = false,
}: DepartmentSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Get display text for selected value
  const selectedLabel = useMemo(() => {
    if (value === "all") return "Todos los departamentos";
    const dept = departments.find(d => d.id === value);
    return dept?.name || placeholder;
  }, [value, departments, placeholder]);

  // Filter departments based on search query
  const filteredDepartments = useMemo(() => {
    if (!searchQuery) return departments;
    const normalized = normalizeForSearch(searchQuery);
    return departments.filter(dept => 
      normalizeForSearch(dept.name).includes(normalized)
    );
  }, [departments, searchQuery]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full max-w-xs justify-between font-normal",
            !value && "text-muted-foreground",
            className
          )}
          disabled={disabled}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0 bg-background z-50" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              placeholder={placeholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <CommandList>
            <CommandEmpty>No se encontraron departamentos.</CommandEmpty>
            <CommandGroup>
              {includeAll && (
                <CommandItem
                  value="all"
                  onSelect={() => {
                    onChange("all");
                    setOpen(false);
                    setSearchQuery("");
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === "all" ? "opacity-100" : "opacity-0"
                    )}
                  />
                  Todos los departamentos
                </CommandItem>
              )}
              {filteredDepartments.map((dept) => (
                <CommandItem
                  key={dept.id}
                  value={dept.id}
                  onSelect={() => {
                    onChange(dept.id);
                    setOpen(false);
                    setSearchQuery("");
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === dept.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="flex-1">{dept.name}</span>
                  {showConfiguredStatus && dept.schedule_configured && (
                    <CheckCircle2 className="ml-2 h-4 w-4 text-primary shrink-0" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
