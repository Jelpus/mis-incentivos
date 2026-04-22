import { NextResponse } from "next/server";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAllowedEmailDomain, normalizeEmail } from "@/lib/auth/email-domain";

type InvitePayload = {
  email?: string;
};

function getBaseUrl() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    "http://localhost:3000";
  return siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
}

export async function POST(request: Request) {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user || isActive === false) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json(
      { error: "No tienes permisos para enviar invitaciones." },
      { status: 403 },
    );
  }

  let payload: InvitePayload;
  try {
    payload = (await request.json()) as InvitePayload;
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer la solicitud." },
      { status: 400 },
    );
  }

  const email = normalizeEmail(payload.email ?? "");
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Ingresa un correo valido." }, { status: 400 });
  }

  if (!isAllowedEmailDomain(email)) {
    return NextResponse.json(
      { error: "Solo se permiten correos @novartis.com y @jelpus.com." },
      { status: 400 },
    );
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." },
      { status: 500 },
    );
  }

  const relationResult = await adminClient
    .from("profile_relations")
    .select("id")
    .eq("is_current", true)
    .ilike("profile_email", email)
    .limit(1)
    .maybeSingle();

  if (relationResult.error) {
    return NextResponse.json(
      { error: "No se pudo validar si el usuario ya esta registrado." },
      { status: 400 },
    );
  }

  if (relationResult.data) {
    return NextResponse.json({
      message: `El usuario ${email} ya aparece registrado en profile_relations.`,
    });
  }

  const inviteResult = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${getBaseUrl()}/auth/confirm?next=/mi-cuenta`,
  });

  if (inviteResult.error) {
    const message = inviteResult.error.message?.toLowerCase() ?? "";
    if (message.includes("already") || message.includes("registered")) {
      return NextResponse.json({
        message: `El usuario ${email} ya existe en autenticacion. No se envio invitacion nueva.`,
      });
    }
    return NextResponse.json(
      { error: inviteResult.error.message || "No se pudo enviar la invitacion." },
      { status: 400 },
    );
  }

  if (inviteResult.data.user?.id) {
    const upsertResult = await adminClient.from("profiles").upsert(
      {
        user_id: inviteResult.data.user.id,
        email,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (upsertResult.error) {
      return NextResponse.json(
        {
          error: "Invitacion enviada, pero no se pudo actualizar el perfil.",
        },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({
    message: `Invitacion enviada a ${email}.`,
  });
}
