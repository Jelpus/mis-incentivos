const ISO_DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

type ParsedDateValue = {
  date: Date;
  isDateOnly: boolean;
};

export function parseDatePreservingCalendar(value: string): ParsedDateValue | null {
  const input = value.trim();
  if (!input) return null;

  const dateOnlyMatch = input.match(ISO_DATE_ONLY_REGEX);
  if (dateOnlyMatch) {
    const [, yearRaw, monthRaw, dayRaw] = dateOnlyMatch;
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const day = Number(dayRaw);

    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      return null;
    }

    return {
      date: new Date(Date.UTC(year, month - 1, day)),
      isDateOnly: true,
    };
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return {
    date: parsed,
    isDateOnly: false,
  };
}

export function formatDateTimeNoTimezoneShift(
  value: string | null | undefined,
  locale = "es-MX",
  fallback = "-",
): string {
  if (!value) return fallback;

  const parsed = parseDatePreservingCalendar(value);
  if (!parsed) return fallback;

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    ...(parsed.isDateOnly ? { timeZone: "UTC" } : {}),
  }).format(parsed.date);
}

