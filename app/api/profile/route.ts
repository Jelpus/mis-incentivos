import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type ProfileUpdatePayload = {
  firstName?: string;
  lastName?: string;
  pictureUrl?: string;
};

function sanitizeText(value: unknown, maxLength = 80) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function sanitizePictureUrl(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function GET() {
  const supabase = await createClient();
  const adminClient = createAdminClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const profileReader = adminClient ?? supabase;

  const { data: profile, error } = await profileReader
    .from("profiles")
    .select("email, first_name, last_name, picture_url, global_role, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "No se pudo cargar el perfil." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    profile: {
      email: profile?.email ?? user.email ?? "",
      firstName: profile?.first_name ?? "",
      lastName: profile?.last_name ?? "",
      pictureUrl: profile?.picture_url ?? "",
      globalRole: profile?.global_role ?? null,
      isActive: profile?.is_active ?? true,
    },
  });
}

export async function PATCH(request: Request) {
  let payload: ProfileUpdatePayload;

  try {
    payload = (await request.json()) as ProfileUpdatePayload;
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer la solicitud." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const adminClient = createAdminClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const firstName = sanitizeText(payload.firstName, 80);
  const lastName = sanitizeText(payload.lastName, 80);
  const pictureUrl = sanitizePictureUrl(payload.pictureUrl);

  if (pictureUrl === null) {
    return NextResponse.json(
      { error: "La foto debe ser una URL valida http(s)." },
      { status: 400 },
    );
  }

  const profileWriter = adminClient ?? supabase;

  const { error } = await profileWriter.from("profiles").upsert(
    {
      user_id: user.id,
      email: user.email ?? null,
      first_name: firstName || null,
      last_name: lastName || null,
      picture_url: pictureUrl || null,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return NextResponse.json(
      { error: "No se pudo actualizar el perfil." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    message: "Perfil actualizado correctamente.",
  });
}
