 import { useState, useMemo, useRef, useEffect } from "react";
 import { Check, Search, User } from "lucide-react";
 import { cn } from "@/lib/utils";
 
 type Manager = {
   id: string;
   name: string;
   role: string;
 };
 
 interface ManagerSearchSelectProps {
   managers: Manager[];
   value: string;
   onChange: (value: string) => void;
   disabled?: boolean;
   placeholder?: string;
   className?: string;
 }
 
 // Remove accents for matching
 const normalizeForSearch = (text: string): string => {
   return (text || "")
     .toLowerCase()
     .trim()
     .normalize("NFD")
     .replace(/[\u0300-\u036f]/g, "");
 };
 
 export function ManagerSearchSelect({
   managers,
   value,
   onChange,
   disabled = false,
   placeholder = "Escribe tu nombre...",
   className,
 }: ManagerSearchSelectProps) {
   const [searchQuery, setSearchQuery] = useState("");
   const [isOpen, setIsOpen] = useState(false);
   const [highlightedIndex, setHighlightedIndex] = useState(0);
   const inputRef = useRef<HTMLInputElement>(null);
   const listRef = useRef<HTMLDivElement>(null);
 
   // Get display text for selected value
   const selectedManager = useMemo(() => {
     return managers.find(m => m.id === value);
   }, [value, managers]);
 
   // Filter managers based on search query
   const filteredManagers = useMemo(() => {
     if (!searchQuery) return managers;
     const normalized = normalizeForSearch(searchQuery);
     return managers.filter(m => 
       normalizeForSearch(m.name).includes(normalized)
     );
   }, [managers, searchQuery]);
 
   // Reset highlighted index when filtered list changes
   useEffect(() => {
     setHighlightedIndex(0);
   }, [filteredManagers.length]);
 
   // Scroll highlighted item into view
   useEffect(() => {
     if (isOpen && listRef.current) {
       const highlightedEl = listRef.current.querySelector(`[data-index="${highlightedIndex}"]`);
       if (highlightedEl) {
         highlightedEl.scrollIntoView({ block: "nearest" });
       }
     }
   }, [highlightedIndex, isOpen]);
 
   const handleSelect = (managerId: string) => {
     onChange(managerId);
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
           prev < filteredManagers.length - 1 ? prev + 1 : prev
         );
         break;
       case "ArrowUp":
         e.preventDefault();
         setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
         break;
       case "Enter":
         e.preventDefault();
         if (filteredManagers[highlightedIndex]) {
           handleSelect(filteredManagers[highlightedIndex].id);
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
       if (searchQuery && filteredManagers.length === 1 && !value) {
         handleSelect(filteredManagers[0].id);
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
           value={value ? selectedManager?.name || "" : searchQuery}
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
           disabled={disabled}
           className={cn(
             "flex h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 py-2 text-base ring-offset-background",
             "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
             "disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200",
             value && "text-foreground font-medium"
           )}
         />
         {value && (
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
           {filteredManagers.length === 0 ? (
             <div className="px-3 py-4 text-sm text-muted-foreground text-center">
               No se encontraron usuarios
             </div>
           ) : (
             <div className="py-1">
               {filteredManagers.map((manager, index) => (
                 <button
                   key={manager.id}
                   type="button"
                   data-index={index}
                   onClick={() => handleSelect(manager.id)}
                   className={cn(
                     "w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors",
                     highlightedIndex === index 
                       ? "bg-accent text-accent-foreground" 
                       : "hover:bg-muted"
                   )}
                 >
                   <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                   <span className="flex-1 truncate">{manager.name}</span>
                   {manager.role === "admin" && (
                     <span className="text-xs text-primary font-medium">(Admin)</span>
                   )}
                 </button>
               ))}
             </div>
           )}
         </div>
       )}
 
       {/* Selected indicator */}
       {value && selectedManager && (
         <div className="mt-2 flex items-center gap-2 text-sm text-primary animate-fade-in">
           <Check className="h-4 w-4" />
           <span>Usuario seleccionado</span>
         </div>
       )}
     </div>
   );
 }