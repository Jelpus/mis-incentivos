export const ADMIN_STATUS_PERIODS_CACHE_TAG = "admin-status-periods";

export const ADMIN_STATUS_DEPENDENT_CACHE_TAGS = [
  ADMIN_STATUS_PERIODS_CACHE_TAG,
  "admin-calculo",
  "admin-incentive-rules",
  "admin-objetivos",
] as const;

export const ADMIN_STATUS_DEPENDENT_PATHS = [
  "/admin/status",
  "/admin/calculo",
  "/admin/incentive-rules",
  "/admin/objetivos",
  "/admin/data-sources",
  "/admin/period-settings",
  "/admin/reglas-ranking",
  "/admin/garantias",
] as const;
