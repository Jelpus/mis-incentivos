"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin/platform/usuarios", label: "Usuarios" },
  { href: "/admin/platform/changes-control", label: "Control de cambios" },
];

export function PlatformSectionNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Secciones de plataforma">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              isActive
                ? "inline-flex h-10 items-center rounded-lg bg-[#0f172a] px-4 text-sm font-semibold text-white"
                : "inline-flex h-10 items-center rounded-lg border border-[#d0d5dd] bg-white px-4 text-sm font-semibold text-[#334155] transition hover:border-[#93c5fd] hover:bg-[#eff6ff] hover:text-[#1d4ed8]"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
