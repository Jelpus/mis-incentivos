import { NextResponse } from "next/server";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_IMPERSONATION_COOKIE, isAdminRole } from "@/lib/auth/impersonation";

type ImpersonationPayload = {
  userId?: string;
};

function getCookieConfig() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

export async function POST(request: Request) {
  const { user, actorRole, actorIsActive } = await getCurrentAuthContext();

  if (!user || actorIsActive === false) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  if (!isAdminRole(actorRole, actorIsActive)) {
    return NextResponse.json(
      { error: "No tienes permisos para usar impersonacion debug." },
      { status: 403 },
    );
  }

  let payload: ImpersonationPayload;

  try {
    payload = (await request.json()) as ImpersonationPayload;
  } catch {
    return NextResponse.json({ error: "Solicitud invalida." }, { status: 400 });
  }

  const userId = String(payload.userId ?? "").trim();
  if (!userId) {
    return NextResponse.json({ error: "Falta userId." }, { status: 400 });
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: "Admin client no disponible." }, { status: 500 });
  }

  const { data: targetProfile, error: targetError } = await adminClient
    .from("profiles")
    .select("user_id, email, global_role")
    .eq("user_id", userId)
    .maybeSingle();

  if (targetError || !targetProfile?.user_id) {
    return NextResponse.json({ error: "Usuario objetivo no encontrado." }, { status: 404 });
  }

  const response = NextResponse.json({
    message: `Modo debug activo para ${targetProfile.email ?? targetProfile.user_id}.`,
  });

  response.cookies.set(ADMIN_IMPERSONATION_COOKIE, targetProfile.user_id, getCookieConfig());

  return response;
}

export async function DELETE() {
  const { user, actorRole, actorIsActive } = await getCurrentAuthContext();

  if (!user || actorIsActive === false) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  if (!isAdminRole(actorRole, actorIsActive)) {
    return NextResponse.json(
      { error: "No tienes permisos para cerrar impersonacion debug." },
      { status: 403 },
    );
  }

  const response = NextResponse.json({
    message: "Modo debug desactivado.",
  });

  response.cookies.set(ADMIN_IMPERSONATION_COOKIE, "", {
    ...getCookieConfig(),
    maxAge: 0,
  });

  return response;
}
