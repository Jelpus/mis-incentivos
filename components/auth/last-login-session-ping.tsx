"use client";

import { useEffect } from "react";

type Props = {
  userId: string;
};

export function LastLoginSessionPing({ userId }: Props) {
  useEffect(() => {
    if (!userId) return;

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
      try {
        const response = await fetch("/api/profile/last-login", {
          method: "POST",
          cache: "no-store",
        });

        if (!response.ok || cancelled) {
          return;
        }

        window.sessionStorage.setItem(storageKey, new Date().toISOString());
      } catch {
        // Ignore transient network/client errors and retry next navigation.
      }
    }

    void updateLastLogin();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return null;
}
