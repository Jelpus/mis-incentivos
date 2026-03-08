import { NextResponse } from "next/server";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

type RoleUpdatePayload = {
  userId?: string;
};

function canManageRole(actorRole: string, targetRole: string) {
  if (actorRole === "super_admin") return true;
  if (actorRole === "admin") return targetRole === "admin";
  return false;
}

export async function GET() {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user || isActive === false) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json(
      { error: "No tienes permisos para listar administradores." },
      { status: 403 },
    );
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." },
      { status: 500 },
    );
  }

  const { data, error } = await adminClient
    .from("profiles")
    .select("user_id, email, first_name, last_name, global_role, is_active")
    .in("global_role", ["admin", "super_admin"])
    .order("global_role", { ascending: false })
    .order("email", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "No se pudo cargar la lista de administradores." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    currentUserId: user.id,
    currentRole: role,
    admins: data ?? [],
  });
}

export async function PATCH(request: Request) {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user || isActive === false) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json(
      { error: "No tienes permisos para cambiar roles." },
      { status: 403 },
    );
  }

  let payload: RoleUpdatePayload;
  try {
    payload = (await request.json()) as RoleUpdatePayload;
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer la solicitud." },
      { status: 400 },
    );
  }

  const userId = (payload.userId ?? "").trim();
  if (!userId) {
    return NextResponse.json({ error: "Falta userId." }, { status: 400 });
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." },
      { status: 500 },
    );
  }

  const { data: targetProfile, error: targetError } = await adminClient
    .from("profiles")
    .select("user_id, email, global_role")
    .eq("user_id", userId)
    .maybeSingle();

  if (targetError || !targetProfile) {
    return NextResponse.json(
      { error: "No se encontro el usuario objetivo." },
      { status: 404 },
    );
  }

  const targetRole = (targetProfile.global_role ?? "").toString().toLowerCase();

  if (targetRole !== "admin" && targetRole !== "super_admin") {
    return NextResponse.json(
      { error: "El usuario ya no tiene rol administrativo." },
      { status: 400 },
    );
  }

  if (!canManageRole(role, targetRole)) {
    return NextResponse.json(
      { error: "No puedes degradar este rol." },
      { status: 403 },
    );
  }

  const { error: updateError } = await adminClient
    .from("profiles")
    .update({ global_role: "user" })
    .eq("user_id", targetProfile.user_id);

  if (updateError) {
    return NextResponse.json(
      { error: "No se pudo degradar el rol del usuario." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    message: `Rol actualizado a user para ${targetProfile.email ?? targetProfile.user_id}.`,
  });
}
