import { NextResponse } from "next/server";
import { isAllowedEmailDomain, normalizeEmail } from "@/lib/auth/email-domain";
import { createClient } from "@/lib/supabase/server";

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
      { error: "Ingresa un correo válido." },
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
  const baseUrl = getBaseUrl();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${baseUrl}/auth/confirm?next=/`,
    },
  });

  if (error) {
    return NextResponse.json(
      {
        error:
          "No fue posible enviar el enlace de acceso. Verifica que tu usuario esté habilitado.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    message:
      "Te enviamos un enlace a tu correo. Revisa tu bandeja y continúa desde ese enlace.",
  });
}
