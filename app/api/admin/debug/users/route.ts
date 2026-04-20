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
};

function sanitizeSearchTerm(value: string) {
  return value.replace(/[,%()]/g, " ").trim().slice(0, 80);
}

function sanitizeRelationType(value: string | null): "all" | "sales_force" | "manager" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "sales_force" || normalized === "manager") return normalized;
  return "all";
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

  const { searchParams } = new URL(request.url);
  const search = sanitizeSearchTerm(searchParams.get("q") ?? "");
  const relationType = sanitizeRelationType(searchParams.get("relation_type"));

  let relationsQuery = adminClient
    .from("profile_relations")
    .select("user_id, relation_type, profile_email")
    .eq("is_current", true)
    .order("updated_at", { ascending: false })
    .limit(300);

  if (search) {
    const like = `%${search}%`;
    relationsQuery = relationsQuery.or(`profile_email.ilike.${like},territorio.ilike.${like}`);
  }

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

  const userIds = Array.from(relationByUserId.keys()).slice(0, 120);
  if (userIds.length === 0) {
    return NextResponse.json({ profiles: [] as ProfileListRow[] });
  }

  const { data: profilesData, error: profilesError } = await adminClient
    .from("profiles")
    .select("user_id, email, first_name, last_name, global_role, is_active")
    .in("user_id", userIds);

  if (profilesError) {
    return NextResponse.json(
      { error: "No se pudo cargar perfiles para las relaciones actuales." },
      { status: 400 },
    );
  }

  const normalizedSearch = search.toLowerCase();
  const merged = ((profilesData ?? []) as Omit<ProfileListRow, "relation_type">[])
    .map((profile) => {
      const relation = relationByUserId.get(profile.user_id);
      return {
        ...profile,
        relation_type: relation?.relation_type ?? null,
        email: profile.email ?? relation?.profile_email ?? null,
      } satisfies ProfileListRow;
    })
    .filter((profile) => {
      if (!search) return true;
      const fields = [
        profile.email ?? "",
        profile.first_name ?? "",
        profile.last_name ?? "",
        profile.global_role ?? "",
        profile.relation_type ?? "",
      ];
      return fields.some((value) => value.toLowerCase().includes(normalizedSearch));
    })
    .sort((a, b) => {
      const aName = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || a.email || a.user_id;
      const bName = `${b.first_name ?? ""} ${b.last_name ?? ""}`.trim() || b.email || b.user_id;
      return aName.localeCompare(bName);
    })
    .slice(0, 50);

  return NextResponse.json({
    profiles: merged,
  });
}
