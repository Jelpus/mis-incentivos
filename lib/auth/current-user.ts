import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { cache } from "react";
import { ADMIN_IMPERSONATION_COOKIE, isAdminRole } from "@/lib/auth/impersonation";
import type { User } from "@supabase/supabase-js";


export type ProfileRole =
  | "super_admin"
  | "admin"
  | "manager"
  | "user"
  | "viewer";

type ProfileRow = {
  user_id?: string;
  email?: string | null;
  global_role: string | null;
  is_active: boolean;
};

export type AuthContext = {
  user: User | null;
  role: ProfileRole | null;
  isActive: boolean | null;
  actorRole: ProfileRole | null;
  actorIsActive: boolean | null;
  effectiveUserId: string | null;
  effectiveEmail: string | null;
  isImpersonating: boolean;
  impersonation: {
    userId: string;
    email: string | null;
    globalRole: ProfileRole | null;
    isActive: boolean;
  } | null;
};

function normalizeRole(value: string | null | undefined): ProfileRole | null {
  if (!value) return null;

  const normalized = value.trim().toLowerCase().replace("-", "_");

  if (normalized === "super_admin") return "super_admin";
  if (normalized === "admin") return "admin";
  if (normalized === "manager") return "manager";
  if (normalized === "user") return "user";
  if (normalized === "viewer") return "viewer";

  return null;
}

const getCurrentAuthContextCached = cache(async (): Promise<AuthContext> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      user: null as User | null,
      role: null as ProfileRole | null,
      isActive: null as boolean | null,
      actorRole: null as ProfileRole | null,
      actorIsActive: null as boolean | null,
      effectiveUserId: null as string | null,
      effectiveEmail: null as string | null,
      isImpersonating: false,
      impersonation: null,
    };
  }

  const adminClient = createAdminClient();

  const profileQuery = adminClient
    ? adminClient
      .from("profiles")
      .select("user_id, email, global_role, is_active")
      .eq("user_id", user.id)
      .maybeSingle<ProfileRow>()
    : supabase
      .from("profiles")
      .select("user_id, email, global_role, is_active")
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

  const actorRole = roleFromProfile ?? roleFromUserMeta;
  const actorIsActive = profile?.is_active ?? true;
  const actorEmail = profile?.email ?? user.email ?? null;

  let role = actorRole;
  let isActive = actorIsActive;
  let effectiveUserId = user.id;
  let effectiveEmail = actorEmail;
  let impersonation:
    | { userId: string; email: string | null; globalRole: ProfileRole | null; isActive: boolean }
    | null = null;

  const requestCookies = await cookies();
  const impersonatedUserId = requestCookies.get(ADMIN_IMPERSONATION_COOKIE)?.value?.trim();

  if (
    impersonatedUserId &&
    impersonatedUserId !== user.id &&
    isAdminRole(actorRole, actorIsActive) &&
    adminClient
  ) {
    const { data: impersonatedProfile, error: impersonatedProfileError } = await adminClient
      .from("profiles")
      .select("user_id, email, global_role, is_active")
      .eq("user_id", impersonatedUserId)
      .maybeSingle<ProfileRow>();

    if (!impersonatedProfileError && impersonatedProfile?.user_id) {
      role = normalizeRole(impersonatedProfile.global_role);
      isActive = impersonatedProfile.is_active;
      effectiveUserId = impersonatedProfile.user_id;
      effectiveEmail = impersonatedProfile.email ?? null;
      impersonation = {
        userId: impersonatedProfile.user_id,
        email: impersonatedProfile.email ?? null,
        globalRole: role,
        isActive: impersonatedProfile.is_active,
      };
    }
  }

  return {
    user: user as User | null,
    role: role as ProfileRole | null,
    isActive: isActive as boolean | null,
    actorRole: actorRole as ProfileRole | null,
    actorIsActive: actorIsActive as boolean | null,
    effectiveUserId: effectiveUserId as string | null,
    effectiveEmail: effectiveEmail as string | null,
    isImpersonating: impersonation !== null,
    impersonation: impersonation as typeof impersonation | null,
  };
});

export async function getCurrentAuthContext() {
  return getCurrentAuthContextCached();
}
