import { format, parseISO, isValid } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Safely parse a date string from the backend.
 * Handles various formats and edge cases that might cause "Invalid time value" errors.
 * 
 * @param input - The date string to parse (can be null/undefined)
 * @returns A valid Date object or null if parsing fails
 */
export function safeParseBackendDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  
  try {
    // First, try to normalize common backend date formats
    // Replace space with T for ISO compatibility (e.g., "2024-01-15 10:30:00" -> "2024-01-15T10:30:00")
    let normalized = input;
    if (typeof input === 'string') {
      // Handle dates with space separator instead of T
      normalized = input.replace(' ', 'T');
      
      // Handle timezone formats like +00 without the minutes
      if (/[+-]\d{2}$/.test(normalized)) {
        normalized = normalized + ':00';
      }
    }
    
    // Try parseISO first (handles most ISO formats)
    let date = parseISO(normalized);
    
    // If parseISO fails, try native Date constructor as fallback
    if (!isValid(date)) {
      date = new Date(normalized);
    }
    
    // If still invalid, try the original input with native Date
    if (!isValid(date)) {
      date = new Date(input);
    }
    
    // Final validation
    if (!isValid(date)) {
      return null;
    }
    
    return date;
  } catch {
    return null;
  }
}

/**
 * Safely format a backend date string.
 * Returns a formatted date string or a fallback value if parsing fails.
 * 
 * @param input - The date string to parse and format
 * @param formatStr - The date-fns format string (e.g., "d MMM yyyy")
 * @param options - Optional formatting options (e.g., { locale: es })
 * @param fallback - The fallback value if parsing fails (default: "-")
 * @returns Formatted date string or fallback
 */
export function safeFormatBackendDate(
  input: string | null | undefined,
  formatStr: string,
  options?: { locale?: typeof es },
  fallback: string = "-"
): string {
  const date = safeParseBackendDate(input);
  
  if (!date) {
    return fallback;
  }
  
  try {
    return format(date, formatStr, options);
  } catch {
    return fallback;
  }
}

/**
 * Safely format a date-only string (yyyy-MM-dd) from the backend.
 * Uses Spanish locale by default.
 * 
 * @param input - The date string to parse and format
 * @param formatStr - The date-fns format string (default: "d MMM")
 * @returns Formatted date string or "-"
 */
export function safeFormatDateOnly(
  input: string | null | undefined,
  formatStr: string = "d MMM"
): string {
  return safeFormatBackendDate(input, formatStr, { locale: es });
}

/**
 * Extract a date string from a day item that can be either a string or an object with a date property.
 * This handles backend data where days might be stored as:
 * - Simple strings: "2026-03-13"
 * - Objects: { date: "2026-03-13", assignmentType: "admin_assigned", halfDay: false }
 * 
 * @param day - The day item to extract the date from
 * @returns The date string or empty string if extraction fails
 */
export function extractDateFromDayItem(
  day: string | { date: string; [key: string]: any } | null | undefined
): string {
  if (!day) return '';
  if (typeof day === 'string') return day;
  if (typeof day === 'object' && 'date' in day && typeof day.date === 'string') {
    return day.date;
  }
  return '';
}
