import { ReactNode } from "react";
import { ProfileRole } from "@/lib/auth/current-user";
import { AppShellClient } from "@/components/app-shell/app-shell-client";

type AppShellProps = {
  role: ProfileRole | null;
  userEmail?: string;
  impersonation?: {
    userId: string;
    email: string | null;
    globalRole: ProfileRole | null;
    isActive: boolean;
  } | null;
  children: ReactNode;
};

export function AppShell({ role, userEmail, impersonation, children }: AppShellProps) {
  return (
    <AppShellClient role={role} userEmail={userEmail} impersonation={impersonation}>
      {children}
    </AppShellClient>
  );
}
