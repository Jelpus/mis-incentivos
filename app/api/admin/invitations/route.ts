import { NextResponse } from "next/server";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail } from "@/lib/auth/email-domain";

type InvitePayload = {
  email?: string;
  confirmRoleChange?: boolean;
};

function logInviteEvent(level: "info" | "warn" | "error", stage: string, details: Record<string, unknown>) {
  const payload = {
    area: "admin-invitations",
    stage,
    ...details,
  };
  if (level === "info") console.info(payload);
  if (level === "warn") console.warn(payload);
  if (level === "error") console.error(payload);
}

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
      { error: "No tienes permisos para invitar administradores." },
      { status: 403 },
    );
  }

  let payload: InvitePayload;
  try {
    payload = (await request.json()) as InvitePayload;
  } catch {
    logInviteEvent("warn", "invalid-json", { actorUserId: user.id });
    return NextResponse.json(
      { error: "No se pudo leer la solicitud." },
      { status: 400 },
    );
  }

  const email = normalizeEmail(payload.email ?? "");
  const confirmRoleChange = Boolean(payload.confirmRoleChange);
  logInviteEvent("info", "request-received", {
    actorUserId: user.id,
    email,
    confirmRoleChange,
  });
  if (!email || !email.includes("@")) {
    logInviteEvent("warn", "invalid-email", { actorUserId: user.id, email });
    return NextResponse.json(
      { error: "Ingresa un correo valido." },
      { status: 400 },
    );
  }

  const isAllowedAdminDomain =
    email.endsWith("@novartis.com") || email.endsWith("@jelpus.com");

  if (!isAllowedAdminDomain) {
    logInviteEvent("warn", "blocked-domain", { actorUserId: user.id, email });
    return NextResponse.json(
      { error: "Solo se permiten correos @novartis.com y @jelpus.com para admin." },
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

  const baseUrl = getBaseUrl();

  const { data: existingProfile, error: profileLookupError } = await adminClient
    .from("profiles")
    .select("user_id, email, global_role")
    .eq("email", email)
    .maybeSingle();

  if (profileLookupError) {
    logInviteEvent("error", "profile-lookup-failed", {
      actorUserId: user.id,
      email,
      error: profileLookupError.message,
    });
    return NextResponse.json(
      { error: "No se pudo validar el perfil existente." },
      { status: 400 },
    );
  }

  if (existingProfile) {
    const currentRole = (existingProfile.global_role ?? "").toString().toLowerCase();

    if (currentRole === "admin" || currentRole === "super_admin") {
      logInviteEvent("info", "already-admin", {
        actorUserId: user.id,
        email,
        currentRole,
      });
      return NextResponse.json({
        message: `El usuario ${email} ya tiene rol ${currentRole}.`,
      });
    }

    if (!confirmRoleChange) {
      logInviteEvent("warn", "role-change-confirm-required", {
        actorUserId: user.id,
        email,
        currentRole: currentRole || "user",
      });
      return NextResponse.json(
        {
          code: "ROLE_CHANGE_CONFIRM_REQUIRED",
          message: `El usuario ${email} existe con rol ${currentRole || "user"}. Confirma si deseas cambiarlo a admin.`,
        },
        { status: 409 },
      );
    }

    const { error: updateRoleError } = await adminClient
      .from("profiles")
      .update({
        global_role: "admin",
        is_active: true,
      })
      .eq("user_id", existingProfile.user_id);

    if (updateRoleError) {
      logInviteEvent("error", "role-update-failed", {
        actorUserId: user.id,
        email,
        existingUserId: existingProfile.user_id,
        error: updateRoleError.message,
      });
      return NextResponse.json(
        { error: "No se pudo actualizar el rol del usuario existente." },
        { status: 400 },
      );
    }

    logInviteEvent("info", "role-updated", {
      actorUserId: user.id,
      email,
      existingUserId: existingProfile.user_id,
    });
    return NextResponse.json({
      message: `Rol actualizado a admin para ${email}.`,
    });
  }

  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${baseUrl}/auth/confirm?next=/admin/control-acceso`,
    data: {
      global_role: "admin",
    },
  });

  if (error) {
    logInviteEvent("error", "invite-user-failed", {
      actorUserId: user.id,
      email,
      error: error.message,
    });
    return NextResponse.json(
      { error: error.message || "No se pudo enviar la invitacion." },
      { status: 400 },
    );
  }

  if (data.user?.id) {
    const { error: profileError } = await adminClient.from("profiles").upsert(
      {
        user_id: data.user.id,
        email,
        global_role: "admin",
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (profileError) {
      logInviteEvent("error", "profile-upsert-failed", {
        actorUserId: user.id,
        email,
        invitedUserId: data.user.id,
        error: profileError.message,
      });
      return NextResponse.json(
        {
          error:
            "Invitacion enviada, pero no se pudo actualizar el perfil admin.",
        },
        { status: 400 },
      );
    }
  }

  logInviteEvent("info", "invite-sent", {
    actorUserId: user.id,
    email,
    invitedUserId: data.user?.id ?? null,
  });
  return NextResponse.json({
    message: `Invitacion enviada a ${email}.`,
  });
}
