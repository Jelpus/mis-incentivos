import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { AppShell } from "@/components/app-shell/app-shell";

export default async function PerfilLayout({ children }: { children: ReactNode }) {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user || isActive === false) {
    redirect("/");
  }

  return (
    <AppShell role={role} userEmail={user.email}>
      {children}
    </AppShell>
  );
}
