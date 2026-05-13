import { parseISO, isValid, differenceInDays } from "date-fns";

export interface TrialPeriodInfo {
  daysSinceContract: number;
  daysRemaining: number;
  isInTrialPeriod: boolean;
  isCritical: boolean;
}

/**
 * Calculate trial period information from a worker's start contract date.
 * Trial period is 30 days from the contract start date.
 * 
 * @param startContractDate - The date string (ISO format) of contract start
 * @returns TrialPeriodInfo object or null if no valid date provided
 */
export function calculateTrialPeriod(
  startContractDate: string | null | undefined
): TrialPeriodInfo | null {
  if (!startContractDate) return null;

  const start = parseISO(startContractDate);
  if (!isValid(start)) return null;

  const today = new Date();
  const daysSince = differenceInDays(today, start);
  const remaining = 30 - daysSince;

  return {
    daysSinceContract: daysSince,
    daysRemaining: remaining,
    isInTrialPeriod: remaining > 0,
    isCritical: remaining > 0 && remaining <= 5,
  };
}

/**
 * Format the trial period display text
 * @param trialPeriod - TrialPeriodInfo object
 * @returns Formatted string for display
 */
export function formatTrialPeriodDisplay(
  trialPeriod: TrialPeriodInfo | null
): string {
  if (!trialPeriod) return "";
  if (!trialPeriod.isInTrialPeriod) return "";
  return `Quedan ${trialPeriod.daysRemaining} día${trialPeriod.daysRemaining !== 1 ? "s" : ""}`;
}
