"use client";

import Link from "next/link";
import Image from "next/image";
import { ReactNode, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ProfileRole } from "@/lib/auth/current-user";

// ---------------------------------------------------------------------------
// Icon library – inline SVG so there are zero extra dependencies
// ---------------------------------------------------------------------------
function IconUser(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

function IconTrendingUp(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

function IconBarChart(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="12" width="4" height="9" rx="1" />
      <rect x="10" y="7" width="4" height="14" rx="1" />
      <rect x="17" y="3" width="4" height="18" rx="1" />
    </svg>
  );
}

function IconDatabase(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v5c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
      <path d="M3 10v5c0 1.66 4.03 3 9 3s9-1.34 9-3v-5" />
      <path d="M3 15v4c0 1.66 4.03 3 9 3s9-1.34 9-3v-4" />
    </svg>
  );
}

function IconTarget(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function IconCurve(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 17c3-4 5-8 9-8s6 4 9 8" />
      <path d="M3 7h18" />
    </svg>
  );
}

function IconShield(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z" />
    </svg>
  );
}

function IconStar(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function IconListCheck(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  );
}

function IconSettings(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

function IconUsers(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function IconActivity(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function IconPuzzle(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 01-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 10-3.214 3.214c.446.166.855.497.925.968a.979.979 0 01-.276.837l-1.61 1.61a2.404 2.404 0 01-1.705.707 2.402 2.402 0 01-1.704-.706l-1.568-1.568a1.026 1.026 0 00-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 11-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 00-.289-.877l-1.568-1.568A2.402 2.402 0 011.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 103.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0112 2c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 113.237 3.237c-.464.18-.894.527-.967 1.02z" />
    </svg>
  );
}

function IconChevronLeft(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function IconChevronRight(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconMenu(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function IconX(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type NavItem = {
  href: string;
  label: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
};

type NavGroup = {
  title: string;
  items: NavItem[];
  subBlocks?: Array<{
    title: string;
    items: NavItem[];
  }>;
};

type AppShellClientProps = {
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

// ---------------------------------------------------------------------------
// Page title helper
// ---------------------------------------------------------------------------
function getTitle(pathname: string) {
  if (pathname.startsWith("/admin/platform")) return "Platform";
  if (pathname.startsWith("/admin/control-acceso")) return "Control de acceso";
  if (pathname.startsWith("/admin/curvas-de-pago")) return "Curvas de pago";
  if (pathname.startsWith("/admin/incentive-rules")) return "Reglas de incentivos";
  if (pathname.startsWith("/admin/reglas-ranking")) return "Reglas de Ranking";
  if (pathname.startsWith("/admin/teams-admin")) return "Teams Admin";
  if (pathname.startsWith("/admin/data-sources")) return "Fuentes de datos";
  if (pathname.startsWith("/admin/source-ranking")) return "Data Source Ranking";
  if (pathname.startsWith("/admin")) return "Panel de administracion";
  if (pathname.startsWith("/perfil")) return "Mi perfil";
  if (pathname.startsWith("/mi-cuenta")) return "Mi cuenta";
  return "Panel";
}

// ---------------------------------------------------------------------------
// Navigation groups – now with icons instead of short codes
// ---------------------------------------------------------------------------
function getNavGroups(role: ProfileRole | null): NavGroup[] {
  if (role === "admin" || role === "super_admin") {
    return [
      {
        title: "Cuenta",
        items: [{ href: "/perfil", label: "Mi perfil", icon: IconUser }],
      },
      {
        title: "Calcular Incentivos",
        items: [
          { href: "/admin/status", label: "Sales Force Status", icon: IconActivity },
          { href: "/admin/incentive-rules", label: "Pay Components TeamID", icon: IconPuzzle },
          { href: "/admin/data-sources", label: "Data Sources", icon: IconDatabase },
          { href: "/admin/calculo", label: "Calculo Incentivos", icon: IconBarChart },
        ],
        subBlocks: [
          {
            title: "Configuraciones",
            items: [
              { href: "/admin/objetivos", label: "Gestión Objetivos", icon: IconTarget },
              { href: "/admin/curvas-de-pago", label: "Curvas de Pago", icon: IconCurve },
              { href: "/admin/garantias", label: "Gestión Garantias", icon: IconShield },
            ],
          },
        ],
      },
      {
        title: "Incentivos",
        items: [
          { href: "/perfil/resultados", label: "Resultados Incentivos", icon: IconTrendingUp },
          { href: "/perfil/performance-report", label: "Performance Report", icon: IconBarChart },
        ],
      },
      {
        title: "Ranking",
        items: [
          { href: "/admin/reglas-ranking", label: "Reglas de Ranking", icon: IconListCheck },
          { href: "/admin/source-ranking", label: "Data Source Ranking", icon: IconDatabase },
          { href: "/perfil/ranking", label: "Dashboard Ranking", icon: IconStar },
        ],
      },
      {
        title: "Configuracion",
        items: [
          { href: "/admin/control-acceso", label: "Control de Acceso", icon: IconUsers },
          { href: "/admin/teams-admin", label: "Teams Admin", icon: IconUsers },
          { href: "/admin/platform", label: "Platform", icon: IconSettings },
        ],
      },
    ];
  }

  return [
    {
      title: "Cuenta",
      items: [{ href: "/perfil", label: "Mi perfil", icon: IconUser }],
    },
    {
      title: "Incentivos",
      items: [
        { href: "/perfil/resultados", label: "Resultados Incentivos", icon: IconTrendingUp },
      ],
    },
    {
      title: "Ranking",
      items: [
        { href: "/perfil/ranking", label: "Dashboard Ranking", icon: IconStar },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Reusable nav link
// ---------------------------------------------------------------------------
function NavLink({
  item,
  active,
  collapsed,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  collapsed?: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={clsx(
        "group relative flex h-10 items-center gap-3 rounded-xl px-3 text-xs font-medium transition-all duration-150",
        active
          ? "bg-[#1d4ed8] text-white shadow-sm shadow-[#1d4ed8]/30"
          : "text-[#475569] hover:bg-[#f1f5f9] hover:text-[#0f172a]",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon
        className={clsx(
          "h-[18px] w-[18px] shrink-0 transition-colors",
          active ? "text-white" : "text-[#64748b] group-hover:text-[#1d4ed8]",
        )}
      />
      {!collapsed && <span className="truncate">{item.label}</span>}

      {/* Tooltip when collapsed */}
      {collapsed && (
        <span className="pointer-events-none absolute left-full ml-3 z-50 whitespace-nowrap rounded-lg bg-[#0f172a] px-3 py-1.5 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
          {item.label}
        </span>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AppShellClient({ role, userEmail, impersonation, children }: AppShellClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [impersonationStopping, setImpersonationStopping] = useState(false);
  const navGroups = useMemo(() => getNavGroups(role), [role]);
  const title = getTitle(pathname);

  async function stopImpersonation() {
    setImpersonationStopping(true);
    try {
      await fetch("/api/admin/debug/impersonation", { method: "DELETE" });
      router.push("/admin/control-acceso");
      router.refresh();
    } finally {
      setImpersonationStopping(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[#f8fafc] text-[#0f172a]">
      <div className="flex min-h-dvh">

        {/* ---------------------------------------------------------------- */}
        {/* Desktop sidebar                                                   */}
        {/* ---------------------------------------------------------------- */}
        <aside
          className={clsx(
            "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-[#e2e8f0] bg-white transition-[width] duration-300 md:flex",
            collapsed ? "w-[4.5rem]" : "w-[16rem]",
          )}
        >
          {/* Logo / header */}
          <div
            className={clsx(
              "flex min-h-[4.5rem] items-center border-b border-[#f1f5f9] px-4",
              collapsed ? "justify-center" : "justify-between",
            )}
          >
            {!collapsed && (
              <div className="flex items-center gap-2.5">
                <Image
                  src="/simbol_color.svg"
                  alt="Simbolo Novartis"
                  width={26}
                  height={26}
                  className="h-[26px] w-[26px] shrink-0"
                  priority
                />
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#1d4ed8]">
                    Mis Incentivos
                  </p>
                  <p className="text-[10px] text-[#94a3b8]">v2.0</p>
                </div>
              </div>
            )}

            {collapsed && (
              <Image
                src="/simbol_color.svg"
                alt="Simbolo Novartis"
                width={26}
                height={26}
                className="h-[26px] w-[26px] shrink-0"
                priority
              />
            )}

            <button
              type="button"
              onClick={() => setCollapsed((prev) => !prev)}
              className={clsx(
                "inline-flex h-7 w-7 items-center justify-center rounded-lg text-[#94a3b8] transition hover:bg-[#f1f5f9] hover:text-[#475569]",
                collapsed && "mt-0",
              )}
              aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
            >
              {collapsed ? (
                <IconChevronRight className="h-4 w-4" />
              ) : (
                <IconChevronLeft className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
            <div className="space-y-5">
              {navGroups.map((group) => (
                <section key={group.title}>
                  {/* Group label */}
                  {!collapsed && (
                    <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">
                      {group.title}
                    </p>
                  )}
                  {collapsed && (
                    <div className="mb-1.5 flex justify-center">
                      <div className="h-px w-6 bg-[#e2e8f0]" />
                    </div>
                  )}

                  {/* Items */}
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                      return (
                        <NavLink key={item.href} item={item} active={active} collapsed={collapsed} />
                      );
                    })}
                  </div>

                  {/* Sub-blocks */}
                  {group.subBlocks?.map((subBlock) => (
                    <div key={`${group.title}-${subBlock.title}`} className="mt-2">
                      {!collapsed && (
                        <p className="mb-1.5 mt-3 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#cbd5e1]">
                          {subBlock.title}
                        </p>
                      )}
                      <div
                        className={clsx(
                          "space-y-0.5",
                          !collapsed && "ml-2 border-l-2 border-[#f1f5f9] pl-2",
                        )}
                      >
                        {subBlock.items.map((item) => {
                          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                          return (
                            <NavLink key={item.href} item={item} active={active} collapsed={collapsed} />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          </nav>

          {/* Footer */}
          <div
            className={clsx(
              "border-t border-[#f1f5f9] px-3 py-3",
              collapsed ? "flex flex-col items-center gap-2" : "space-y-2",
            )}
          >
            {!collapsed && (
              <div className="flex items-center gap-2 rounded-xl bg-[#f8fafc] px-3 py-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#dbeafe] text-[#1d4ed8]">
                  <IconUser className="h-4 w-4" />
                </div>
                <p className="truncate text-[11px] font-medium text-[#475569]">
                  {userEmail ?? "Usuario"}
                </p>
              </div>
            )}
            {collapsed && (
              <div
                className="group relative flex h-9 w-9 items-center justify-center rounded-xl bg-[#f8fafc]"
                title={userEmail ?? "Usuario"}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#dbeafe] text-[#1d4ed8]">
                  <IconUser className="h-4 w-4" />
                </div>
                <span className="pointer-events-none absolute left-full ml-3 z-50 whitespace-nowrap rounded-lg bg-[#0f172a] px-3 py-1.5 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                  {userEmail ?? "Usuario"}
                </span>
              </div>
            )}
            <SignOutButton
              compact
              className={clsx("w-full", collapsed ? "justify-center" : "justify-start")}
            />
          </div>
        </aside>

        {/* ---------------------------------------------------------------- */}
        {/* Main content area                                                 */}
        {/* ---------------------------------------------------------------- */}
        <div
          className={clsx(
            "flex min-h-dvh w-full flex-col transition-[padding] duration-300",
            collapsed ? "md:pl-[4.5rem]" : "md:pl-[16rem]",
          )}
        >
          {/* Impersonation banner */}
          {impersonation ? (
            <div className="border-b border-[#fedf89] bg-[#fffaeb] px-4 py-3 text-[#7a2e0e] sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-medium sm:text-sm">
                  Debug activo como{" "}
                  <span className="font-semibold">
                    {impersonation.email ?? impersonation.userId}
                  </span>{" "}
                  (rol {impersonation.globalRole ?? "sin-definir"}).
                </p>
                <button
                  type="button"
                  onClick={stopImpersonation}
                  disabled={impersonationStopping}
                  className="inline-flex h-9 items-center rounded-lg border border-[#fdb022] bg-white px-3 text-xs font-semibold text-[#7a2e0e] transition hover:bg-[#fff7e5] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {impersonationStopping ? "Saliendo..." : "Salir debug"}
                </button>
              </div>
            </div>
          ) : null}

          {/* Top header */}
          <header className="sticky top-0 z-30 border-b border-[#e2e8f0] bg-white/90 backdrop-blur-md">
            <div className="flex h-14 items-center justify-between px-4 sm:px-6">
              <div className="flex items-center gap-3">
                {/* Mobile menu trigger */}
                <button
                  type="button"
                  onClick={() => setMobileOpen(true)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#e2e8f0] text-[#64748b] transition hover:bg-[#f8fafc] md:hidden"
                  aria-label="Abrir menú"
                >
                  <IconMenu className="h-4 w-4" />
                </button>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#94a3b8]">
                    Workspace
                  </p>
                  <h1 className="text-sm font-semibold text-[#0f172a] sm:text-base">{title}</h1>
                </div>
              </div>
            </div>
          </header>

          <main className="p-4 sm:p-6">{children}</main>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Mobile drawer                                                        */}
      {/* ------------------------------------------------------------------ */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-[#0f172a]/50 backdrop-blur-sm"
            aria-label="Cerrar menú"
          />

          {/* Drawer */}
          <aside className="absolute left-0 top-0 flex h-full w-[17rem] flex-col border-r border-[#e2e8f0] bg-white">
            {/* Drawer header */}
            <div className="flex min-h-[4.5rem] items-center justify-between border-b border-[#f1f5f9] px-4">
              <div className="flex items-center gap-2.5">
                <Image
                  src="/simbol_color.svg"
                  alt="Simbolo Novartis"
                  width={26}
                  height={26}
                  className="h-[26px] w-[26px] shrink-0"
                  priority
                />
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#1d4ed8]">
                    Mis Incentivos
                  </p>
                  <p className="text-[10px] text-[#94a3b8]">v2.0</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#94a3b8] transition hover:bg-[#f1f5f9] hover:text-[#475569]"
                aria-label="Cerrar menú"
              >
                <IconX className="h-4 w-4" />
              </button>
            </div>

            {/* Drawer nav */}
            <nav className="flex-1 overflow-y-auto px-3 py-4">
              <div className="space-y-5">
                {navGroups.map((group) => (
                  <section key={group.title}>
                    <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">
                      {group.title}
                    </p>
                    <div className="space-y-0.5">
                      {group.items.map((item) => {
                        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                        return (
                          <NavLink
                            key={item.href}
                            item={item}
                            active={active}
                            onClick={() => setMobileOpen(false)}
                          />
                        );
                      })}
                    </div>
                    {group.subBlocks?.map((subBlock) => (
                      <div key={`${group.title}-${subBlock.title}`} className="mt-2">
                        <p className="mb-1.5 mt-3 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#cbd5e1]">
                          {subBlock.title}
                        </p>
                        <div className="ml-2 space-y-0.5 border-l-2 border-[#f1f5f9] pl-2">
                          {subBlock.items.map((item) => {
                            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                            return (
                              <NavLink
                                key={item.href}
                                item={item}
                                active={active}
                                onClick={() => setMobileOpen(false)}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            </nav>

            {/* Drawer footer */}
            <div className="border-t border-[#f1f5f9] px-3 py-3 space-y-2">
              <div className="flex items-center gap-2 rounded-xl bg-[#f8fafc] px-3 py-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#dbeafe] text-[#1d4ed8]">
                  <IconUser className="h-4 w-4" />
                </div>
                <p className="truncate text-[11px] font-medium text-[#475569]">
                  {userEmail ?? "Usuario"}
                </p>
              </div>
              <SignOutButton compact className="w-full justify-start" />
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
