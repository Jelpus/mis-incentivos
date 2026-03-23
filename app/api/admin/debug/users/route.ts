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
};

function sanitizeSearchTerm(value: string) {
  return value.replace(/[,%()]/g, " ").trim().slice(0, 80);
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

  let query = adminClient
    .from("profiles")
    .select("user_id, email, first_name, last_name, global_role, is_active")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (search) {
    const like = `%${search}%`;
    query = query.or(`email.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: "No se pudo cargar la lista de perfiles." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    profiles: (data ?? []) as ProfileListRow[],
  });
}
