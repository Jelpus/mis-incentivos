import { ReactNode } from "react";
import { ProfileRole } from "@/lib/auth/current-user";
import { AppShellClient } from "@/components/app-shell/app-shell-client";

type AppShellProps = {
  role: ProfileRole | null;
  userEmail?: string;
  children: ReactNode;
};

export function AppShell({ role, userEmail, children }: AppShellProps) {
  return (
    <AppShellClient role={role} userEmail={userEmail}>
      {children}
    </AppShellClient>
  );
}
