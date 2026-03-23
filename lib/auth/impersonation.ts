export const ADMIN_IMPERSONATION_COOKIE = "mi_debug_impersonate_user_id";

export function isAdminRole(role: string | null, isActive: boolean | null): boolean {
  return isActive !== false && (role === "admin" || role === "super_admin");
}
