import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ProfileRole = "super_admin" | "admin" | "user";

type ProfileRow = {
  global_role: string | null;
  is_active: boolean;
};

function normalizeRole(value: string | null | undefined): ProfileRole | null {
  if (!value) return null;

  const normalized = value.trim().toLowerCase().replace("-", "_");

  if (normalized === "super_admin") return "super_admin";
  if (normalized === "admin") return "admin";
  if (normalized === "user") return "user";

  return null;
}

export async function getCurrentAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      user: null,
      role: null as ProfileRole | null,
      isActive: null as boolean | null,
    };
  }

  const adminClient = createAdminClient();

  const profileQuery = adminClient
    ? adminClient
        .from("profiles")
        .select("global_role, is_active")
        .eq("user_id", user.id)
        .maybeSingle<ProfileRow>()
    : supabase
        .from("profiles")
        .select("global_role, is_active")
        .eq("user_id", user.id)
        .maybeSingle<ProfileRow>();

  const { data: profile, error: profileError } = await profileQuery;

  if (profileError) {
    console.error("profiles lookup failed", {
      userId: user.id,
      message: profileError.message,
      code: profileError.code,
    });
  }

  const roleFromProfile = normalizeRole(profile?.global_role);
  const roleFromUserMeta = normalizeRole(
    (user.user_metadata?.global_role as string | undefined) ??
      (user.app_metadata?.global_role as string | undefined),
  );

  return {
    user,
    role: roleFromProfile ?? roleFromUserMeta,
    isActive: profile?.is_active ?? true,
  };
}
