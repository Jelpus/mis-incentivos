import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { AppShell } from "@/components/app-shell/app-shell";

export default async function PerfilLayout({ children }: { children: ReactNode }) {
  const auth = await getCurrentAuthContext();
  const { user, role, isActive, effectiveEmail, impersonation } = auth;

  if (!user || isActive === false) {
    redirect("/");
  }

  return (
    <AppShell role={role} userEmail={effectiveEmail ?? user.email} impersonation={impersonation}>
      {children}
    </AppShell>
  );
}
