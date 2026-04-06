const DEFAULT_BUSINESS_TIME_ZONE = "America/Mexico_City";

function getDatePartsInTimeZone(timeZone: string): { year: number; month: number } | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
    });
    const parts = formatter.formatToParts(new Date());
    const year = Number(parts.find((part) => part.type === "year")?.value ?? "");
    const month = Number(parts.find((part) => part.type === "month")?.value ?? "");
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return null;
    }
    return { year, month };
  } catch {
    return null;
  }
}

export function getCurrentBusinessPeriodCode(): string {
  const configuredTimeZone = process.env.BUSINESS_PERIOD_TIME_ZONE?.trim() || DEFAULT_BUSINESS_TIME_ZONE;
  const parts = getDatePartsInTimeZone(configuredTimeZone);
  if (!parts) {
    const now = new Date();
    return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return `${parts.year}${String(parts.month).padStart(2, "0")}`;
}

export function filterPeriodsUpToBusinessCurrent(periodCodes: string[]): string[] {
  const current = getCurrentBusinessPeriodCode();
  const valid = periodCodes.filter((period) => /^\d{6}$/.test(period));
  const filtered = valid.filter((period) => period <= current);
  return filtered.length > 0 ? filtered : valid;
}

