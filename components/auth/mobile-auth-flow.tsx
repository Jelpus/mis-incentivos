"use client";

import { useState } from "react";
import { LoginHero } from "@/components/auth/login-hero";
import { LoginPanel } from "@/components/auth/login-panel";

type Step = "marketing" | "login";

export function MobileAuthFlow() {
  const [step, setStep] = useState<Step>("marketing");

  return (
    <section className="lg:hidden">
      <div className="h-dvh w-full overflow-hidden">
        <div
          className={`flex h-full w-[200%] transition-transform duration-500 ease-out ${
            step === "login" ? "-translate-x-1/2" : "translate-x-0"
          }`}
        >
          <div className="w-1/2 shrink-0">
            <LoginHero mobileMode onAccess={() => setStep("login")} />
          </div>
          <div className="w-1/2 shrink-0">
            <LoginPanel showBackLink onBack={() => setStep("marketing")} />
          </div>
        </div>
      </div>
    </section>
  );
}
