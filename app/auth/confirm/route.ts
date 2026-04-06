import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") ?? "email";
  const next = searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") ? next : "/";

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(`${origin}/?error=invalid_or_expired_link`);
    }

    return NextResponse.redirect(`${origin}${safeNext}`);
  }

  if (token_hash) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as "email",
    });

    if (error) {
      return NextResponse.redirect(`${origin}/?error=invalid_or_expired_link`);
    }

    return NextResponse.redirect(`${origin}${safeNext}`);
  }

  return NextResponse.redirect(`${origin}/?error=missing_token`);
}