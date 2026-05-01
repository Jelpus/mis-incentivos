export type CoverageStatus = "met" | "near" | "miss";

export function getCoverageStatus(coverage: number, threshold: number): CoverageStatus {
  if (coverage >= threshold) return "met";
  if (coverage >= threshold * 0.85) return "near";
  return "miss";
}

export function getCoverageBadgeClass(coverage: number, threshold: number): string {
  const status = getCoverageStatus(coverage, threshold);
  if (status === "met") return "bg-emerald-100 text-emerald-700";
  if (status === "near") return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-700";
}

export function formatCoveragePercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
