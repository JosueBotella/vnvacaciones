import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, DayPickerMultipleProps } from "react-day-picker";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Locale } from "date-fns";

interface MobileCalendarProps extends Omit<DayPickerMultipleProps, "mode"> {
  locale?: Locale;
}

function MobileCalendar({ 
  className, 
  classNames, 
  showOutsideDays = true,
  ...props 
}: MobileCalendarProps) {
  return (
    <DayPicker
      mode="multiple"
      showOutsideDays={showOutsideDays}
      className={cn("p-3 pointer-events-auto", className)}
      classNames={{
        months: "flex flex-col",
        month: "space-y-3",
        caption: "flex justify-center pt-1 relative items-center mb-3",
        caption_label: "text-base font-semibold capitalize",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-9 w-9 bg-transparent p-0 opacity-60 hover:opacity-100 active:scale-95 transition-all duration-200 rounded-full",
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse",
        head_row: "flex justify-between mb-2",
        head_cell: "text-muted-foreground w-10 sm:w-11 font-medium text-xs uppercase text-center",
        row: "flex w-full mt-1.5 justify-between",
        cell: "relative text-center text-sm focus-within:relative focus-within:z-20",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-10 w-10 sm:h-11 sm:w-11 p-0 font-normal text-sm rounded-full hover:rounded-full transition-all duration-200 touch-manipulation active:scale-95"
        ),
        day_range_end: "day-range-end",
        day_selected:
          "!bg-[hsl(var(--calendar-selected))] !text-[hsl(var(--calendar-selected-foreground))] hover:!bg-[hsl(var(--calendar-selected))]/90 font-semibold scale-105 shadow-md",
        day_today: "font-semibold ring-2 ring-primary/40",
        day_outside:
          "day-outside text-muted-foreground/20 opacity-20",
        day_disabled: "text-muted-foreground/30 opacity-30 cursor-not-allowed",
        day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ..._props }) => <ChevronLeft className="h-5 w-5" />,
        IconRight: ({ ..._props }) => <ChevronRight className="h-5 w-5" />,
      }}
      {...props}
    />
  );
}
MobileCalendar.displayName = "MobileCalendar";

export { MobileCalendar };
