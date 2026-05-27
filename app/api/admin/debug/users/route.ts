import { NextResponse } from "next/server";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRole } from "@/lib/auth/impersonation";

type ProfileListRow = {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  global_role: string | null;
  is_active: boolean;
  relation_type: "sales_force" | "manager" | null;
};

type ProfileRelationsRow = {
  user_id: string;
  relation_type: "sales_force" | "manager";
  profile_email: string | null;
  territorio: string | null;
};

type ProfileRow = Omit<ProfileListRow, "relation_type">;

function sanitizeSearchTerm(value: string) {
  return value.replace(/[,%()]/g, " ").trim().slice(0, 80);
}

function sanitizeRelationType(value: string | null): "all" | "sales_force" | "manager" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "sales_force" || normalized === "manager") return normalized;
  return "all";
}

function sanitizeLimit(value: string | null) {
  const parsed = Number(value ?? 100);
  if (!Number.isInteger(parsed)) return 100;
  return Math.min(Math.max(parsed, 25), 200);
}

function includesSearch(value: unknown, search: string) {
  return String(value ?? "").toLowerCase().includes(search);
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function GET(request: Request) {
  const { user, actorRole, actorIsActive } = await getCurrentAuthContext();

  if (!user || actorIsActive === false) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  if (!isAdminRole(actorRole, actorIsActive)) {
    return NextResponse.json(
      { error: "No tienes permisos para usar debug de usuarios." },
      { status: 403 },
    );
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: "Admin client no disponible." }, { status: 500 });
  }
  const supabase = adminClient;

  const { searchParams } = new URL(request.url);
  const search = sanitizeSearchTerm(searchParams.get("q") ?? "");
  const normalizedSearch = search.toLowerCase();
  const relationType = sanitizeRelationType(searchParams.get("relation_type"));
  const limit = sanitizeLimit(searchParams.get("limit"));

  let relationsQuery = supabase
    .from("profile_relations")
    .select("user_id, relation_type, profile_email, territorio")
    .eq("is_current", true)
    .order("updated_at", { ascending: false })
    .range(0, 4999);

  if (relationType !== "all") {
    relationsQuery = relationsQuery.eq("relation_type", relationType);
  }

  const { data: relationRows, error: relationError } = await relationsQuery;

  if (relationError) {
    return NextResponse.json(
      { error: "No se pudo cargar la lista de relaciones." },
      { status: 400 },
    );
  }

  const relationByUserId = new Map<string, ProfileRelationsRow>();
  for (const row of (relationRows ?? []) as ProfileRelationsRow[]) {
    if (!row.user_id || relationByUserId.has(row.user_id)) continue;
    relationByUserId.set(row.user_id, row);
  }

  const relationUserIds = new Set(relationByUserId.keys());
  const relationSearchUserIds = new Set<string>();
  if (normalizedSearch) {
    for (const row of relationByUserId.values()) {
      if (
        includesSearch(row.profile_email, normalizedSearch) ||
        includesSearch(row.territorio, normalizedSearch) ||
        includesSearch(row.relation_type, normalizedSearch)
      ) {
        relationSearchUserIds.add(row.user_id);
      }
    }
  }

  const profilesByUserId = new Map<string, ProfileRow>();
  async function mergeProfilesByIds(userIds: string[]) {
    for (const group of chunk(userIds, 500)) {
      if (group.length === 0) continue;
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, email, first_name, last_name, global_role, is_active")
        .in("user_id", group);

      if (error) throw new Error(error.message);
      for (const profile of (data ?? []) as ProfileRow[]) {
        profilesByUserId.set(profile.user_id, profile);
      }
    }
  }

  try {
    if (relationType !== "all") {
      await mergeProfilesByIds(Array.from(relationUserIds));
    } else {
      const profileQuery = supabase
        .from("profiles")
        .select("user_id, email, first_name, last_name, global_role, is_active")
        .order("email", { ascending: true })
        .range(0, 1999);

      const { data, error } = await profileQuery;
      if (error) throw new Error(error.message);
      for (const profile of (data ?? []) as ProfileRow[]) {
        profilesByUserId.set(profile.user_id, profile);
      }
    }

    if (relationSearchUserIds.size > 0) {
      await mergeProfilesByIds(Array.from(relationSearchUserIds));
    }
  } catch {
    return NextResponse.json(
      { error: "No se pudo cargar perfiles para debug." },
      { status: 400 },
    );
  }

  const merged = Array.from(profilesByUserId.values())
    .map((profile) => {
      const relation = relationByUserId.get(profile.user_id);
      return {
        ...profile,
        relation_type: relation?.relation_type ?? null,
        email: profile.email ?? relation?.profile_email ?? null,
      } satisfies ProfileListRow;
    })
    .filter((profile) => {
      if (relationType !== "all" && profile.relation_type !== relationType) return false;
      if (!normalizedSearch) return true;
      const relation = relationByUserId.get(profile.user_id);
      const fields = [
        profile.email ?? "",
        profile.first_name ?? "",
        profile.last_name ?? "",
        profile.global_role ?? "",
        profile.relation_type ?? "",
        relation?.territorio ?? "",
        relation?.profile_email ?? "",
      ];
      return fields.some((value) => includesSearch(value, normalizedSearch));
    })
    .sort((a, b) => {
      const aName = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || a.email || a.user_id;
      const bName = `${b.first_name ?? ""} ${b.last_name ?? ""}`.trim() || b.email || b.user_id;
      return aName.localeCompare(bName, "es");
    });

  const sliced = merged.slice(0, limit);

  return NextResponse.json({
    profiles: sliced,
    total: merged.length,
    returned: sliced.length,
    truncated: merged.length > sliced.length,
  });
}
