import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { PlatformSectionNav } from "@/components/admin/platform-section-nav";

export default async function AdminPlatformLayout({ children }: { children: ReactNode }) {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user) {
    redirect("/login");
  }

  if (isActive === false) {
    redirect("/inactive");
  }

  if (role !== "admin" && role !== "super_admin") {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-neutral-500">Admin / Platform</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            Administracion de plataforma
          </h1>
          <p className="mt-2 max-w-4xl text-sm text-neutral-600">
            Gestiona usuarios operativos y el control de cambios funcionales de la plataforma.
          </p>
          <div className="mt-5">
            <PlatformSectionNav />
          </div>
        </header>

        {children}
      </div>
    </main>
  );
}
