export function isHiredAfterPeriod(hireDate: string | null | undefined, periodMonth: string): boolean {
  const hireMonth = /^\d{4}-(?:0[1-9]|1[0-2])-\d{2}/.exec(String(hireDate ?? "").trim())?.[0]?.slice(0, 7);
  const calculationMonth = /^\d{4}-(?:0[1-9]|1[0-2])/.exec(periodMonth)?.[0];
  return Boolean(hireMonth && calculationMonth && hireMonth > calculationMonth);
}
