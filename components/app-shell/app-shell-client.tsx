"use client";

import Link from "next/link";
import Image from "next/image";
import { ReactNode, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ProfileRole } from "@/lib/auth/current-user";

type NavItem = {
  href: string;
  label: string;
  short: string;
};

type AppShellClientProps = {
  role: ProfileRole | null;
  userEmail?: string;
  children: ReactNode;
};

function getTitle(pathname: string) {
  if (pathname.startsWith("/admin/control-acceso")) return "Control de acceso";
  if (pathname.startsWith("/admin")) return "Panel de administracion";
  if (pathname.startsWith("/perfil")) return "Mi perfil";
  if (pathname.startsWith("/mi-cuenta")) return "Mi cuenta";
  return "Panel";
}

function getNavItems(role: ProfileRole | null): NavItem[] {
  if (role === "admin" || role === "super_admin") {
    return [
      { href: "/admin/control-acceso", label: "Control acceso", short: "CA" },
      { href: "/perfil", label: "Mi perfil", short: "MP" },
    ];
  }

  return [{ href: "/perfil", label: "Mi perfil", short: "MP" }];
}

export function AppShellClient({ role, userEmail, children }: AppShellClientProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItems = useMemo(() => getNavItems(role), [role]);
  const title = getTitle(pathname);

  return (
    <div className="min-h-dvh bg-[linear-gradient(180deg,#f5f8ff_0%,#f8fafc_100%)] text-[#0f172a]">
      <div className="flex min-h-dvh">
        <aside
          className={clsx(
            "fixed inset-y-0 left-0 z-40 hidden border-r border-[#d8e3f8] bg-white/95 backdrop-blur-md transition-[width] duration-300 md:flex md:flex-col",
            collapsed ? "w-[5.5rem]" : "w-[17rem]",
          )}
        >
          <div className="flex min-h-[5.25rem] items-center justify-between border-b border-[#e8eefb] px-4 py-3">
            <div className="flex flex-col items-start gap-1">
              <Image
                src="/simbol_color.svg"
                alt="Simbolo Novartis"
                width={24}
                height={24}
                className="h-6 w-6 shrink-0"
                priority
              />
              <div className={clsx("overflow-hidden transition-all", collapsed && "h-0 w-0")}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#445f95]">
                  Mis Incentivos 2.0
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCollapsed((prev) => !prev)}
              className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#d0d5dd] text-xs text-[#344054] transition hover:bg-[#f8faff]"
            >
              {collapsed ? ">>" : "<<"}
            </button>
          </div>

          <nav className="flex-1 space-y-2 px-3 py-4">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "focus-ring flex h-10 items-center gap-3 rounded-lg border px-3 text-sm font-medium transition",
                    active
                      ? "border-[#c8dcff] bg-[#eaf2ff] text-[#002b7f]"
                      : "border-transparent text-[#334155] hover:border-[#e2e8f0] hover:bg-[#f8fafc]",
                  )}
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#f1f5ff] text-[11px] font-semibold text-[#1d4ed8]">
                    {item.short}
                  </span>
                  <span className={clsx("truncate", collapsed && "hidden")}>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-[#e8eefb] px-3 py-4">
            <p className={clsx("mb-2 truncate text-xs text-[#64748b]", collapsed && "hidden")}>
              {userEmail ?? "Usuario"}
            </p>
            <SignOutButton compact className={clsx("w-full justify-center", !collapsed && "justify-start")} />
          </div>
        </aside>

        <div className={clsx("flex min-h-dvh w-full flex-col", collapsed ? "md:pl-[5.5rem]" : "md:pl-[17rem]")}>
          <header className="sticky top-0 z-30 border-b border-[#dbe6f9] bg-white/88 backdrop-blur-md">
            <div className="flex h-16 items-center justify-between px-4 sm:px-6">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMobileOpen(true)}
                  className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#d0d5dd] text-xs text-[#334155] md:hidden"
                >
                  menu
                </button>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-[#64748b]">Workspace</p>
                  <h1 className="text-sm font-semibold text-[#0f172a] sm:text-base">{title}</h1>
                </div>
              </div>
            </div>
          </header>

          <main className="p-4 sm:p-6">{children}</main>
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-[#0f172a]/40"
            aria-label="Cerrar menu"
          />
          <aside className="absolute left-0 top-0 h-full w-[18rem] border-r border-[#d8e3f8] bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Image
                  src="/simbol_color.svg"
                  alt="Simbolo Novartis"
                  width={24}
                  height={24}
                  className="h-6 w-6 shrink-0"
                  priority
                />
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#445f95]">
                  Mis Incentivos 2.0
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="focus-ring rounded-md border border-[#d0d5dd] px-2 py-1 text-xs text-[#334155]"
              >
                cerrar
              </button>
            </div>
            <nav className="space-y-2">
              {navItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={clsx(
                      "focus-ring flex h-10 items-center gap-3 rounded-lg border px-3 text-sm font-medium transition",
                      active
                        ? "border-[#c8dcff] bg-[#eaf2ff] text-[#002b7f]"
                        : "border-transparent text-[#334155] hover:border-[#e2e8f0] hover:bg-[#f8fafc]",
                    )}
                  >
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#f1f5ff] text-[11px] font-semibold text-[#1d4ed8]">
                      {item.short}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="mt-4 border-t border-[#e8eefb] pt-4">
              <p className="mb-2 truncate text-xs text-[#64748b]">{userEmail ?? "Usuario"}</p>
              <SignOutButton compact className="w-full justify-start" />
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
