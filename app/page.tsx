import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { MobileAuthFlow } from "@/components/auth/mobile-auth-flow";
import { LoginHero } from "@/components/auth/login-hero";
import { LoginPanel } from "@/components/auth/login-panel";
import { getCurrentAuthContext } from "@/lib/auth/current-user";

export default async function Home() {
  const requestCookies = await cookies();
  const hasSupabaseAuthCookie = requestCookies
    .getAll()
    .some((cookie) => cookie.name.includes("-auth-token"));

  if (hasSupabaseAuthCookie) {
    const { user, role, isActive } = await getCurrentAuthContext();

    if (user && isActive === false) {
      redirect("/inactive");
    }

    if (user && (role === "super_admin" || role === "admin")) {
      redirect("/admin");
    }

    if (user) {
      redirect("/mi-cuenta");
    }
  }

  return (
    <main className="w-full">
      <MobileAuthFlow />

      <div className="hidden h-dvh w-full lg:grid lg:grid-cols-[minmax(0,1.35fr)_minmax(380px,0.65fr)]">
        <LoginHero />
        <LoginPanel />
      </div>
    </main>
  );
}
