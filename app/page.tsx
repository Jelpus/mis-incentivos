import { MobileAuthFlow } from "@/components/auth/mobile-auth-flow";
import { LoginHero } from "@/components/auth/login-hero";
import { LoginPanel } from "@/components/auth/login-panel";

export default function Home() {
  return (
    <main className="w-full">
      <MobileAuthFlow />

      <div className="hidden min-h-dvh w-full lg:grid lg:grid-cols-[minmax(0,1.35fr)_minmax(380px,0.65fr)]">
        <LoginHero />
        <LoginPanel />
      </div>
    </main>
  );
}
