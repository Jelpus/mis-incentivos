import { NextResponse } from "next/server";
import { isAllowedEmailDomain, normalizeEmail } from "@/lib/auth/email-domain";

type MagicLinkPayload = {
  email?: string;
};

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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "Configuracion de autenticacion incompleta." },
      { status: 500 },
    );
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/otp`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      create_user: false,
    }),
  });

  if (!response.ok) {
    return NextResponse.json(
      {
        error:
          "No fue posible enviar el magic link. Verifica que tu usuario este habilitado.",
      },
      { status: response.status },
    );
  }

  return NextResponse.json({
    success: true,
    message:
      "Te enviamos un magic link a tu correo. Revisa tu bandeja y continua desde ese enlace.",
  });
}
