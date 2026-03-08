"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";

type SignOutButtonProps = {
  compact?: boolean;
  className?: string;
};

export function SignOutButton({ compact = false, className }: SignOutButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: signOutError } = await supabase.auth.signOut();

      if (signOutError) {
        setError("No se pudo cerrar sesion. Intenta de nuevo.");
        setLoading(false);
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("No se pudo cerrar sesion. Intenta de nuevo.");
      setLoading(false);
    }
  }

  return (
    <div className={clsx("flex items-center gap-2", compact ? "flex-col items-start" : "gap-3")}>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={loading}
        className={clsx(
          "focus-ring inline-flex items-center gap-2 rounded-lg border border-[#d0d5dd] bg-white font-medium text-[#344054] transition hover:bg-[#f9fafb] disabled:cursor-not-allowed disabled:opacity-70",
          compact ? "h-9 px-3 text-xs" : "h-10 px-4 text-sm",
          className,
        )}
      >
        <span aria-hidden="true">x</span>
        {loading ? "Cerrando..." : "Cerrar sesion"}
      </button>
      {error ? <p className="text-xs text-[#b42318]">{error}</p> : null}
    </div>
  );
}
