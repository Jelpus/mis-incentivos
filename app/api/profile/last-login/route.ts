import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const supabase = await createClient();
  const adminClient = createAdminClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const profileWriter = adminClient ?? supabase;

  const { error } = await profileWriter.from("profiles").upsert(
    {
      user_id: user.id,
      email: user.email ?? null,
      last_login: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return NextResponse.json(
      { error: "No se pudo actualizar last_login." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
