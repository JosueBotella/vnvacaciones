/**
 * Control de Incidencias - Dashboards Module
 * 
 * Dashboard data aggregation and statistics.
 * Pre-calculated analytics via incidencias-analytics-cron.
 * 
 * Tables:
 * - incidencias_worker_stats: per-worker risk scores and counts
 * - incidencias_department_stats: per-department aggregates
 * - incidencias_daily_metrics: daily time series snapshots
 * 
 * All data accessed via incidencias-operations edge function actions:
 * - getWorkerStats
 * - getDepartmentStats
 * - getDailyMetrics
 * - getTopReincidentes
 * - getRiskRanking
 * - getAIWorkerPrediction
 * - getAIAdminSummary
 */

export const ANALYTICS_ACTIONS = [
  'getWorkerStats',
  'getDepartmentStats', 
  'getDailyMetrics',
  'getTopReincidentes',
  'getRiskRanking',
  'getAIWorkerPrediction',
  'getAIAdminSummary',
] as const;

export type AnalyticsAction = typeof ANALYTICS_ACTIONS[number];

export const RISK_THRESHOLDS = {
  LOW: 40,
  HIGH: 70,
} as const;

export function getRiskLevel(score: number): 'low' | 'medium' | 'high' {
  if (score >= RISK_THRESHOLDS.HIGH) return 'high';
  if (score >= RISK_THRESHOLDS.LOW) return 'medium';
  return 'low';
}
