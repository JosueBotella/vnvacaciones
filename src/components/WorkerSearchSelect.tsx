 import { useState, useMemo, useRef, useEffect } from "react";
 import { Check, Search, User, Loader2 } from "lucide-react";
 import { cn } from "@/lib/utils";
 import { supabase } from "@/integrations/supabase/client";
 
interface Worker {
  id: string;
  name: string;
  worker_number: string;
  worker_code?: string | null;
  department_id?: string;
  department_name?: string;
}
 
 interface WorkerSearchSelectProps {
   value: string;
   onChange: (value: string) => void;
   disabled?: boolean;
   placeholder?: string;
   className?: string;
   excludeWorkerIds?: Set<string>;
   departmentId?: string; // Optional: filter by department
 }
 
 // Remove accents for matching
 const normalizeForSearch = (text: string): string => {
   return (text || "")
     .toLowerCase()
     .trim()
     .normalize("NFD")
     .replace(/[\u0300-\u036f]/g, "");
 };
 
 export function WorkerSearchSelect({
   value,
   onChange,
   disabled = false,
   placeholder = "Buscar por nombre o número...",
   className,
   excludeWorkerIds = new Set(),
   departmentId,
 }: WorkerSearchSelectProps) {
   const [searchQuery, setSearchQuery] = useState("");
   const [isOpen, setIsOpen] = useState(false);
   const [highlightedIndex, setHighlightedIndex] = useState(0);
   const [workers, setWorkers] = useState<Worker[]>([]);
   const [loading, setLoading] = useState(false);
   const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
   const inputRef = useRef<HTMLInputElement>(null);
   const listRef = useRef<HTMLDivElement>(null);
 
   // Fetch all workers on mount
   useEffect(() => {
     const fetchWorkers = async () => {
       setLoading(true);
      const sessionToken = localStorage.getItem("manager_session_token");
      
       try {
        const { data, error } = await supabase.functions.invoke("admin-operations", {
          body: {
            action: "searchAllWorkers",
            sessionToken,
            data: { departmentId },
          },
        });

        if (error || !data?.success) {
          console.error("Error fetching workers:", data?.error || error);
           return;
         }
 
        let mapped: Worker[] = data.workers || [];
        
        // Filter by department if specified
        if (departmentId) {
          mapped = mapped.filter(w => w.department_id === departmentId);
        }
        
         setWorkers(mapped);
       } catch (err) {
         console.error("Error:", err);
       } finally {
         setLoading(false);
       }
     };
 
     fetchWorkers();
   }, [departmentId]);
 
   // When value changes, find the worker
   useEffect(() => {
     if (value && workers.length > 0) {
       const found = workers.find(w => w.id === value);
       setSelectedWorker(found || null);
     } else {
       setSelectedWorker(null);
     }
   }, [value, workers]);
 
   // Filter workers based on search query
   const filteredWorkers = useMemo(() => {
     const available = workers.filter(w => !excludeWorkerIds.has(w.id));
     
     if (!searchQuery) return available.slice(0, 50); // Limit initial results
     
      const normalized = normalizeForSearch(searchQuery);
      return available.filter(w => 
        normalizeForSearch(w.name).includes(normalized) ||
        w.worker_number.includes(searchQuery.trim()) ||
        (w.worker_code && normalizeForSearch(w.worker_code).includes(normalized))
      ).slice(0, 50);
   }, [workers, searchQuery, excludeWorkerIds]);
 
   // Reset highlighted index when filtered list changes
   useEffect(() => {
     setHighlightedIndex(0);
   }, [filteredWorkers.length]);
 
   // Scroll highlighted item into view
   useEffect(() => {
     if (isOpen && listRef.current) {
       const highlightedEl = listRef.current.querySelector(`[data-index="${highlightedIndex}"]`);
       if (highlightedEl) {
         highlightedEl.scrollIntoView({ block: "nearest" });
       }
     }
   }, [highlightedIndex, isOpen]);
 
   const handleSelect = (workerId: string) => {
     onChange(workerId);
     setSearchQuery("");
     setIsOpen(false);
   };
 
   const handleKeyDown = (e: React.KeyboardEvent) => {
     if (!isOpen) {
       if (e.key === "ArrowDown" || e.key === "Enter") {
         setIsOpen(true);
         e.preventDefault();
       }
       return;
     }
 
     switch (e.key) {
       case "ArrowDown":
         e.preventDefault();
         setHighlightedIndex(prev => 
           prev < filteredWorkers.length - 1 ? prev + 1 : prev
         );
         break;
       case "ArrowUp":
         e.preventDefault();
         setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
         break;
       case "Enter":
         e.preventDefault();
         if (filteredWorkers[highlightedIndex]) {
           handleSelect(filteredWorkers[highlightedIndex].id);
         }
         break;
       case "Escape":
         setIsOpen(false);
         setSearchQuery("");
         break;
     }
   };
 
   const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
     setSearchQuery(e.target.value);
     if (!isOpen) setIsOpen(true);
     // Clear selection when typing
     if (value) {
       onChange("");
     }
   };
 
   const handleBlur = () => {
     // Delay to allow click on list item
     setTimeout(() => {
       setIsOpen(false);
       // If there's only one match, auto-select it
       if (searchQuery && filteredWorkers.length === 1 && !value) {
         handleSelect(filteredWorkers[0].id);
       } else if (!value) {
         setSearchQuery("");
       }
     }, 200);
   };
 
   return (
     <div className={cn("relative", className)}>
       <div className="relative">
         <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
         <input
           ref={inputRef}
           type="text"
           value={value ? (selectedWorker ? `${selectedWorker.name} (#${selectedWorker.worker_number}${selectedWorker.worker_code ? ` · ${selectedWorker.worker_code}` : ''})` : "") : searchQuery}
           onChange={handleInputChange}
           onFocus={() => {
             setIsOpen(true);
             if (value) {
               setSearchQuery("");
             }
           }}
           onBlur={handleBlur}
           onKeyDown={handleKeyDown}
           placeholder={placeholder}
           disabled={disabled || loading}
           className={cn(
             "flex h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 py-2 text-base ring-offset-background",
             "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
             "disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200",
             value && "text-foreground font-medium"
           )}
         />
         {loading && (
           <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
         )}
         {value && !loading && (
           <button
             type="button"
             onClick={() => {
               onChange("");
               setSearchQuery("");
               inputRef.current?.focus();
             }}
             className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
           >
             ×
           </button>
         )}
       </div>
 
       {/* Dropdown list */}
       {isOpen && !value && (
         <div 
           ref={listRef}
           className="absolute z-50 w-full mt-1 max-h-60 overflow-auto rounded-xl border border-border bg-popover shadow-lg animate-fade-in"
         >
           {loading ? (
             <div className="px-3 py-4 text-sm text-muted-foreground text-center flex items-center justify-center gap-2">
               <Loader2 className="h-4 w-4 animate-spin" />
               Cargando trabajadores...
             </div>
           ) : filteredWorkers.length === 0 ? (
             <div className="px-3 py-4 text-sm text-muted-foreground text-center">
               {searchQuery ? "No se encontraron trabajadores" : "Escribe para buscar..."}
             </div>
           ) : (
             <div className="py-1">
               {filteredWorkers.map((worker, index) => (
                 <button
                   key={worker.id}
                   type="button"
                   data-index={index}
                   onClick={() => handleSelect(worker.id)}
                   className={cn(
                     "w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors",
                     highlightedIndex === index 
                       ? "bg-accent text-accent-foreground" 
                       : "hover:bg-muted"
                   )}
                 >
                   <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                   <div className="flex-1 min-w-0">
                     <span className="truncate block">{worker.name}</span>
                      <span className="text-xs text-muted-foreground">
                        #{worker.worker_number}
                        {worker.worker_code && ` · ${worker.worker_code}`}
                        {worker.department_name && ` • ${worker.department_name}`}
                      </span>
                   </div>
                 </button>
               ))}
             </div>
           )}
         </div>
       )}
 
       {/* Selected indicator */}
       {value && selectedWorker && (
         <div className="mt-2 flex items-center gap-2 text-sm text-primary animate-fade-in">
           <Check className="h-4 w-4" />
           <span>Trabajador seleccionado</span>
         </div>
       )}
     </div>
   );
 }