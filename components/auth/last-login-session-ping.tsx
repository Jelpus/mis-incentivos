"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type Props = {
  userId: string;
};

export function LastLoginSessionPing({ userId }: Props) {
  const pathname = usePathname();

  useEffect(() => {
    if (!userId) return;
    if (pathname?.startsWith("/admin")) return;

    const storageKey = `last-login-updated:${userId}`;

    try {
      if (window.sessionStorage.getItem(storageKey)) {
        return;
      }
    } catch {
      return;
    }

    let cancelled = false;

    async function updateLastLogin() {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch("/api/profile/last-login", {
          method: "POST",
          cache: "no-store",
          keepalive: true,
          signal: controller.signal,
        });

        if (!response.ok || cancelled) {
          return;
        }

        window.sessionStorage.setItem(storageKey, new Date().toISOString());
      } catch {
        // Ignore transient network/client errors and retry next navigation.
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    void updateLastLogin();

    return () => {
      cancelled = true;
    };
  }, [pathname, userId]);

  return null;
}
