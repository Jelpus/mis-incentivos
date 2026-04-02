"use server";

import { getCurrentAuthContext } from "@/lib/auth/current-user";

export type ManagerApprovalRequestResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

function isAdminRole(role: string | null, isActive: boolean | null): boolean {
  return isActive !== false && (role === "admin" || role === "super_admin");
}

export async function requestManagersApprovalAction(
  _prevState: ManagerApprovalRequestResult | null,
  _formData: FormData,
): Promise<ManagerApprovalRequestResult> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  return {
    ok: true,
    message: "Flujo de solicitud a managers pendiente de definir.",
  };
}
