import { NextResponse } from "next/server";
import { isAllowedEmailDomain, normalizeEmail } from "@/lib/auth/email-domain";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type MagicLinkPayload = {
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
  let payload: MagicLinkPayload;

  try {
    payload = (await request.json()) as MagicLinkPayload;
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer la solicitud." },
      { status: 400 },
    );
  }

  const rawEmail = payload.email ?? "";
  const email = normalizeEmail(rawEmail);

  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { error: "Ingresa un correo valido." },
      { status: 400 },
    );
  }

  if (!isAllowedEmailDomain(email)) {
    return NextResponse.json(
      { error: "Solo se permiten cuentas @novartis.com y @jelpus.com." },
      { status: 403 },
    );
  }

  const supabase = await createClient();
  const adminClient = createAdminClient();
  const baseUrl = getBaseUrl();
  if (adminClient) {
    const profileLookup = await adminClient
      .from("profiles")
      .select("user_id, email, is_active")
      .eq("email", email)
      .maybeSingle<{ user_id: string | null; email: string | null; is_active: boolean | null }>();

    if (profileLookup.error) {
      return NextResponse.json(
        { error: `No fue posible validar el usuario en profiles: ${profileLookup.error.message}` },
        { status: 500 },
      );
    }

    if (profileLookup.data?.user_id && profileLookup.data.is_active === false) {
      return NextResponse.json(
        { error: "Tu usuario existe pero esta inactivo. Solicita habilitacion al administrador." },
        { status: 403 },
      );
    }
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${baseUrl}/auth/confirm?next=/`,
    },
  });

  if (error) {
    const rawMessage = String(error.message ?? "");
    const normalizedMessage = rawMessage.toLowerCase();
    const detailedMessage = normalizedMessage.includes("user not found")
      ? "Tu perfil existe en profiles pero no en Auth. Pide al administrador reenviar invitacion."
      : rawMessage;

    return NextResponse.json(
      {
        error: `No fue posible enviar el enlace de acceso: ${detailedMessage}`,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    message:
      "Te enviamos un enlace a tu correo. Revisa tu bandeja y continua desde ese enlace.",
  });
}
