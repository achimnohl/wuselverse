/**
 * Settlement period utilities for billing
 */

/**
 * Get current settlement period in YYYY-MM format
 */
export function getCurrentSettlementPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Get settlement period for a specific date
 */
export function getSettlementPeriod(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Parse settlement period into year and month
 */
export function parseSettlementPeriod(period: string): { year: number; month: number } {
  const [year, month] = period.split('-').map(Number);
  return { year, month };
}

/**
 * Get the start and end dates for a settlement period
 */
export function getSettlementPeriodRange(period: string): { start: Date; end: Date } {
  const { year, month } = parseSettlementPeriod(period);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

/**
 * Get previous settlement period
 */
export function getPreviousSettlementPeriod(period: string): string {
  const { year, month } = parseSettlementPeriod(period);
  const prevDate = new Date(year, month - 2, 1); // month - 2 because month is 1-indexed
  return getSettlementPeriod(prevDate);
}

/**
 * Get next settlement period
 */
export function getNextSettlementPeriod(period: string): string {
  const { year, month } = parseSettlementPeriod(period);
  const nextDate = new Date(year, month, 1); // month is already correct for next month
  return getSettlementPeriod(nextDate);
}

/**
 * Check if a date falls within a settlement period
 */
export function isInSettlementPeriod(date: Date, period: string): boolean {
  const { start, end } = getSettlementPeriodRange(period);
  return date >= start && date <= end;
}
