import * as React from "react";
import { ChevronLeft, ChevronRight, Circle, CircleDot, Info, AlertCircle, ShieldCheck } from "lucide-react";
import { DayPicker, DayProps, useDayRender } from "react-day-picker";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Locale, format, isSaturday, isSunday } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type DaySelection = {
  date: string; // yyyy-MM-dd format
  halfDay: boolean;
};

type SelectionMode = 'full' | 'half';

interface HalfDayCalendarProps {
  locale?: Locale;
  selectedDays: DaySelection[];
  onDayClick: (date: Date, halfDay: boolean, action: 'add' | 'remove' | 'convert') => void;
  onBlockedDayClick?: (date: Date) => void; // Callback when clicking a blocked day
  availableDays?: DaySelection[];
  blockedDays?: Set<string>; // Days blocked by annual calendar (yyyy-MM-dd format)
  approvedExceptionDays?: Set<string>; // Days with approved exceptions (yyyy-MM-dd format)
  disabled?: (date: Date) => boolean;
  className?: string;
  showHalfDayOption?: boolean;
  showFridayNotice?: boolean;
  blockWeekends?: boolean; // Block weekends visually (for admin view)
  disableWeekends?: boolean; // Completely disable weekends (for worker forms)
  t?: (key: string) => string; // Translation function
}

// Context to pass blocked days info to custom Day component
const BlockedDaysContext = React.createContext<{
  blockedDays: Set<string>;
  approvedExceptionDays: Set<string>;
  onBlockedDayClick?: (date: Date) => void;
  translate: (key: string) => string;
}>({
  blockedDays: new Set(),
  approvedExceptionDays: new Set(),
  onBlockedDayClick: undefined,
  translate: (key) => key,
});

// Custom Day component with tooltip for blocked days and approved exception indicator
function CustomDay(props: DayProps) {
  const { blockedDays, approvedExceptionDays, onBlockedDayClick, translate } = React.useContext(BlockedDaysContext);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const dayRender = useDayRender(props.date, props.displayMonth, buttonRef);
  
  if (dayRender.isHidden) {
    return <div role="gridcell"></div>;
  }
  
  const dateStr = format(props.date, 'yyyy-MM-dd');
  const isBlocked = blockedDays.has(dateStr);
  const hasApprovedException = approvedExceptionDays.has(dateStr);
  
  // If this day has an approved exception, show small indicator
  if (hasApprovedException) {
    return (
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>
          <button
            {...dayRender.buttonProps}
            ref={buttonRef}
            className={cn(dayRender.buttonProps.className, "approved-exception-day")}
          >
            {props.date.getDate()}
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5 items-center justify-center">
              <ShieldCheck className="h-2.5 w-2.5 text-primary" />
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="!px-2 !py-1" sideOffset={5}>
          <p className="text-[10px]">Excepción aprobada</p>
        </TooltipContent>
      </Tooltip>
    );
  }
  
  // If this day is blocked and we have a callback, wrap with tooltip
  if (isBlocked && onBlockedDayClick) {
    return (
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>
          <button
            {...dayRender.buttonProps}
            ref={buttonRef}
            className={cn(dayRender.buttonProps.className, "blocked-day-with-tooltip")}
          >
            {props.date.getDate()}
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5 items-center justify-center">
              <AlertCircle className="h-2.5 w-2.5 text-muted-foreground/80" />
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className={cn(
            "max-w-[190px] text-center",
            "bg-popover/95 text-popover-foreground border-border/60 shadow-sm",
            "!px-2 !py-1"
          )}
          sideOffset={5}
        >
          {(() => {
            const title = translate("blockedDayTooltipTitle");
            const action = translate("blockedDayTooltipAction");
            const titleText = title === "blockedDayTooltipTitle" ? "Día bloqueado" : title;
            const actionText = action === "blockedDayTooltipAction" ? "Pulsa para solicitar desbloqueo" : action;
            return (
              <>
                <p className="text-[11px] font-medium leading-snug">{titleText}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{actionText}</p>
              </>
            );
          })()}
        </TooltipContent>
      </Tooltip>
    );
  }
  
  // Normal day rendering
  return (
    <button {...dayRender.buttonProps} ref={buttonRef}>
      {props.date.getDate()}
    </button>
  );
}

function HalfDayCalendar({ 
  className, 
  locale,
  selectedDays,
  onDayClick,
  onBlockedDayClick,
  availableDays = [],
  blockedDays = new Set(),
  approvedExceptionDays = new Set(),
  disabled,
  showHalfDayOption = true,
  showFridayNotice = true,
  blockWeekends = false,
  disableWeekends = false,
  t,
}: HalfDayCalendarProps) {
  // Default translations (Spanish)
  const defaultT = (key: string) => {
    const defaults: Record<string, string> = {
      fullDay: "Día completo",
      halfDay: "Medio día",
      important: "Importante:",
      fridayEqualsSunday: "Cualquier día marcado en viernes equivale al domingo de esa semana.",
      selectionModeHint: "Selecciona \"{mode}\" arriba y pulsa en el calendario. Pulsa de nuevo para quitar.",
      blockedDayTooltipTitle: "Día bloqueado",
      blockedDayTooltipAction: "Pulsa para solicitar desbloqueo al encargado",
    };
    return defaults[key] || key;
  };

  // If a provided translation function returns the key itself, fall back to defaults
  const translate = React.useCallback(
    (key: string) => {
      const value = t ? t(key) : key;
      return value && value !== key ? value : defaultT(key);
    },
    [t],
  );

  const [selectionMode, setSelectionMode] = React.useState<SelectionMode>("full");
  
  // Helper to check if a date is a weekend
  const isWeekend = (date: Date) => isSaturday(date) || isSunday(date);
  
  // Convert selections to Date arrays for modifiers
  const fullDays = selectedDays
    .filter(d => !d.halfDay)
    .map(d => new Date(d.date + 'T00:00:00'));
  
  const halfDays = selectedDays
    .filter(d => d.halfDay)
    .map(d => new Date(d.date + 'T00:00:00'));

  // Filter out weekends from available days when disableWeekends is true
  const filteredAvailableDays = disableWeekends 
    ? availableDays.filter(d => {
        const date = new Date(d.date + 'T00:00:00');
        return !isWeekend(date);
      })
    : availableDays;

  const availableFullDays = filteredAvailableDays
    .filter(d => !d.halfDay)
    .map(d => new Date(d.date + 'T00:00:00'));
  
  const availableHalfDays = filteredAvailableDays
    .filter(d => d.halfDay)
    .map(d => new Date(d.date + 'T00:00:00'));

  // Convert blocked days to Date array
  // If a blocked day is selected, show it with the selected modifier (not as blocked red)
  const selectedSet = React.useMemo(
    () => new Set(selectedDays.map((d) => d.date)),
    [selectedDays],
  );

  const blockedDaysArray = Array.from(blockedDays)
    .filter((d) => !selectedSet.has(d))
    .map((d) => new Date(d + "T00:00:00"));

  const handleDayClick = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");

    const currentSelection = selectedDays.find((d) => d.date === dateStr);
    const isHalfMode = selectionMode === "half" && showHalfDayOption;

    // If day is blocked and we have a callback, open the exception flow.
    // IMPORTANT: do NOT select the blocked day until it has been approved/unblocked.
    if (blockedDays.has(dateStr) && onBlockedDayClick && !currentSelection) {
      onBlockedDayClick(date);
      return;
    }

    if (!currentSelection) {
      // Not selected - add with current mode
      onDayClick(date, isHalfMode, "add");
    } else if (currentSelection.halfDay === isHalfMode) {
      // Same type selected - remove it
      onDayClick(date, isHalfMode, "remove");
    } else {
      // Different type - convert it
      onDayClick(date, isHalfMode, "convert");
    }
  };

  // Combined disabled function including weekends and external disabled
  // Note: blocked days are NOT disabled if onBlockedDayClick is provided (to allow exception requests)
  const combinedDisabled = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    if (disableWeekends && isWeekend(date)) return true;

    // Allow clicking blocked days for exception requests even if external `disabled` would block them
    if (blockedDays.has(dateStr) && onBlockedDayClick) return false;

    // Only disable blocked days if there's no callback for handling them
    if (blockedDays.has(dateStr) && !onBlockedDayClick) return true;

    if (disabled) return disabled(date);
    return false;
  };

  const modifiers = {
    fullDay: fullDays,
    halfDay: halfDays,
    blocked: blockedDaysArray,
    weekend: blockWeekends ? (date: Date) => isWeekend(date) : () => false,
    availableFull: availableFullDays.filter(d => 
      !selectedDays.some(sd => sd.date === format(d, 'yyyy-MM-dd')) &&
      !blockedDays.has(format(d, 'yyyy-MM-dd'))
    ),
    availableHalf: availableHalfDays.filter(d => 
      !selectedDays.some(sd => sd.date === format(d, 'yyyy-MM-dd')) &&
      !blockedDays.has(format(d, 'yyyy-MM-dd'))
    ),
  };

  const modifiersClassNames = {
    fullDay: "!bg-[hsl(var(--calendar-selected))] !text-[hsl(var(--calendar-selected-foreground))] hover:!bg-[hsl(var(--calendar-selected))]/90 font-medium shadow-sm",
    halfDay: "!bg-[hsl(var(--calendar-half-day))] !text-[hsl(var(--calendar-half-day-foreground))] hover:!bg-[hsl(var(--calendar-half-day))]/90 font-medium shadow-sm half-day-indicator",
    blocked: `!bg-destructive !text-destructive-foreground hover:!bg-destructive/80 ${onBlockedDayClick ? 'cursor-pointer' : 'cursor-not-allowed'} opacity-90`,
    weekend: "!bg-muted/50 !text-muted-foreground/50",
    availableFull: "bg-[hsl(var(--calendar-available))] text-[hsl(var(--calendar-available-foreground))] hover:bg-[hsl(var(--calendar-available))]/80",
    availableHalf: "bg-[hsl(var(--calendar-half-day))]/30 text-[hsl(var(--calendar-half-day-foreground))] hover:bg-[hsl(var(--calendar-half-day))]/50",
  };

  // Context value for custom Day component
  const blockedDaysContextValue = React.useMemo(() => ({
    blockedDays,
    approvedExceptionDays,
    onBlockedDayClick,
    translate,
  }), [blockedDays, approvedExceptionDays, onBlockedDayClick, translate]);

  return (
    <TooltipProvider delayDuration={100}>
      <BlockedDaysContext.Provider value={blockedDaysContextValue}>
        <div className="relative space-y-3">
          {/* Selection Mode Legend */}
          {showHalfDayOption && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectionMode('full')}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border",
                    selectionMode === 'full'
                      ? "bg-[hsl(var(--calendar-selected))] text-[hsl(var(--calendar-selected-foreground))] border-[hsl(var(--calendar-selected))] shadow-md scale-105"
                      : "bg-background hover:bg-muted border-border text-foreground"
                  )}
                >
                  <Circle className="h-3 w-3 fill-current" />
                  {translate("fullDay")}
                </button>
                
                <button
                  type="button"
                  onClick={() => setSelectionMode('half')}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border",
                    selectionMode === 'half'
                      ? "bg-[hsl(var(--calendar-half-day))] text-[hsl(var(--calendar-half-day-foreground))] border-[hsl(var(--calendar-half-day))] shadow-md scale-105"
                      : "bg-background hover:bg-muted border-border text-foreground"
                  )}
                >
                  <CircleDot className="h-3 w-3" />
                  {translate("halfDay")}
                </button>
              </div>
              
              <p className="text-[10px] text-muted-foreground">
                {translate("selectionModeHint").replace("{mode}", selectionMode === 'full' ? translate("fullDay") : translate("halfDay"))}
              </p>
            </div>
          )}

          {/* Friday = Sunday notice */}
          {showFridayNotice && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  <strong>{translate("important")}</strong> {translate("fridayEqualsSunday")}
                </p>
              </div>
            </div>
          )}

          <DayPicker
            mode="multiple"
            showOutsideDays={true}
            className={cn("p-3 pointer-events-auto", className)}
            locale={locale}
            selected={[...fullDays, ...halfDays]}
            onDayClick={handleDayClick}
            disabled={combinedDisabled}
            modifiers={modifiers}
            modifiersClassNames={modifiersClassNames}
            classNames={{
              months: "flex flex-col",
              month: "space-y-2",
              caption: "flex justify-center pt-1 relative items-center mb-2",
              caption_label: "text-sm font-medium capitalize",
              nav: "space-x-1 flex items-center",
              nav_button: cn(
                buttonVariants({ variant: "ghost" }),
                "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 transition-opacity",
              ),
              nav_button_previous: "absolute left-1",
              nav_button_next: "absolute right-1",
              table: "w-full border-collapse",
              head_row: "flex justify-between mb-1",
              head_cell: "text-muted-foreground w-8 sm:w-9 font-normal text-[10px] uppercase text-center",
              row: "flex w-full mt-0.5 justify-between",
              cell: "relative text-center text-xs focus-within:relative focus-within:z-20",
              day: cn(
                buttonVariants({ variant: "ghost" }),
                "h-8 w-8 sm:h-9 sm:w-9 p-0 font-normal text-xs rounded-full hover:rounded-full transition-all duration-150 touch-manipulation"
              ),
              day_range_end: "day-range-end",
              day_today: "font-medium ring-1 ring-primary/30",
              day_outside: "day-outside text-muted-foreground/15 opacity-15",
              day_disabled: "text-muted-foreground/25 opacity-25 cursor-not-allowed",
              day_hidden: "invisible",
            }}
            components={{
              IconLeft: ({ ..._props }) => <ChevronLeft className="h-4 w-4" />,
              IconRight: ({ ..._props }) => <ChevronRight className="h-4 w-4" />,
              Day: CustomDay,
            }}
          />
          
          {/* Half-day visual indicator styles */}
          <style>{`
            .half-day-indicator {
              position: relative;
            }
            .half-day-indicator::after {
              content: '½';
              position: absolute;
              bottom: -2px;
              right: 2px;
              font-size: 9px;
              font-weight: bold;
              opacity: 0.8;
            }
            .blocked-day-with-tooltip {
              position: relative;
            }
            /* Mobile touch hint - pulse animation for blocked days */
            @media (hover: none) and (pointer: coarse) {
              .blocked-day-with-tooltip::before {
                content: '';
                position: absolute;
                inset: -2px;
                border-radius: 50%;
                border: 2px solid hsl(var(--destructive));
                animation: pulse-blocked 2s ease-in-out infinite;
              }
            }
            @keyframes pulse-blocked {
              0%, 100% { opacity: 0.3; transform: scale(1); }
              50% { opacity: 0.8; transform: scale(1.05); }
            }
          `}</style>
        </div>
      </BlockedDaysContext.Provider>
    </TooltipProvider>
  );
}

HalfDayCalendar.displayName = "HalfDayCalendar";

export { HalfDayCalendar };
