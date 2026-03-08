"use client";

import Image from "next/image";

type LoginHeroProps = {
  mobileMode?: boolean;
  onAccess?: () => void;
};

const keyMessages = [
  {
    icon: "clarity",
    title: "Transparencia",
    text: "Visualiza tu incentivo con claridad.",
    tone: "bg-[#002b7f]",
  },
  {
    icon: "empowerment",
    title: "Control",
    text: "Sigue tu avance en tiempo real.",
    tone: "bg-[#ff5c37]",
  },
  {
    icon: "security",
    title: "Seguridad",
    text: "Acceso rapido y protegido.",
    tone: "bg-[#ff8d35]",
  },
];

function MessageIcon({ type }: { type: string }) {
  if (type === "clarity") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "empowerment") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
        <path
          d="M6 15.5 10.2 11l3.1 3.2L18 9.7"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M18 14V9h-5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <path
        d="M12 3.8 5.5 6.7v4.4c0 4.1 2.6 7.8 6.5 9.1 3.9-1.3 6.5-5 6.5-9.1V6.7L12 3.8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="m9.3 12 1.8 1.8 3.6-3.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LoginHero({ mobileMode = false, onAccess }: LoginHeroProps) {
  const sectionClasses = mobileMode
    ? "min-h-dvh border-b border-[#dfdfdf] px-6 py-8 sm:px-10 sm:py-12"
    : "h-dvh border-r border-[#dfdfdf] px-10 py-10 xl:px-14 xl:py-12";

  const contentClasses = mobileMode
    ? "relative z-10 flex w-full max-w-[108ch] flex-col gap-5 enter-fade-up sm:gap-7"
    : "relative z-10 flex h-full w-full max-w-[108ch] flex-col justify-center gap-7 enter-fade-up";

  const cardsClasses = mobileMode
    ? "hidden gap-3 px-1 lg:grid md:grid-cols-3 xl:gap-4 xl:px-2"
    : "hidden gap-3 px-1 md:grid md:grid-cols-3 xl:gap-4 xl:px-2";

  return (
    <section className={`relative flex items-center overflow-hidden bg-white ${sectionClasses}`}>
      <div className="pointer-events-none absolute right-[-22%] bottom-[-30%] hidden aspect-square w-[clamp(40rem,46vw,44rem)] rounded-full bg-[#ff9f1c]/55 float-slow sm:block" />
      <div className="pointer-events-none absolute right-[-15%] bottom-[-26%] hidden aspect-square w-[clamp(15rem,30vw,28rem)] rounded-full bg-[#ff5661]/80 float-slower sm:block" />
      <div className="pointer-events-none absolute right-[-10%] bottom-[10%] hidden h-[clamp(13rem,26vw,23rem)] w-[clamp(9rem,16vw,16rem)] rounded-[44%_56%_34%_66%/40%_40%_60%_60%] bg-[#002068]/60 float-slow sm:block" />
      <div className="pointer-events-none absolute right-[20%] bottom-[-38%] hidden h-[clamp(14rem,30vw,24rem)] w-[clamp(11rem,24vw,20rem)] rounded-[58%_42%_65%_35%/62%_62%_38%_38%] bg-[#ff8d35]/40 float-slower sm:block" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_18%,rgba(0,32,104,0.06),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_45%_75%,rgba(231,74,34,0.05),transparent_34%)]" />

      <div className={contentClasses}>
        <div className="flex items-center pb-2 sm:pb-3">
          <Image
            src="/novartis_color.svg"
            alt="Novartis"
            width={290}
            height={56}
            className="h-10 w-auto sm:h-12"
            priority
          />
        </div>

        <div className="grid max-w-[64ch] gap-4 sm:gap-6">
          <h1 className="text-balance max-w-[10ch] text-[clamp(1.95rem,3vw+1.2vh,4.2rem)] font-semibold leading-[0.95] tracking-[-0.02em] text-[#002b7f]">
            Tu impacto,
            <br />
            más claro
            <br />
            <span className="bg-[linear-gradient(90deg,#ff4f67_0%,#ff5c37_48%,#ff6f00_100%)] bg-clip-text text-transparent">
              que nunca.
            </span>
          </h1>
          <p className="max-w-[49ch] text-[clamp(0.92rem,0.45vw+0.55rem,1.02rem)] leading-[1.55] text-[#2b3f6e]">
            La nueva plataforma de incentivos de Novartis. Más clara, rápida, segura e intuitiva.
            Diseñada para darte transparencia total sobre tu desempeño.
          </p>
          <p className="max-w-[45ch] text-[clamp(0.88rem,0.35vw+0.52rem,0.96rem)] leading-[1.5] text-[#445f95]">
            <strong>Tu éxito </strong> es nuestra prioridad. Impulsa nuestra misión. Juntos, reimaginamos la medicina.
          </p>

          {mobileMode ? (
            <div className="pt-2">
              <button
                type="button"
                onClick={onAccess}
                className="focus-ring inline-flex items-center gap-2 rounded-md bg-[#002068] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#14347d]"
              >
                Acceder
                <span aria-hidden="true">-&gt;</span>
              </button>
            </div>
          ) : null}
        </div>

        <div className={cardsClasses}>
          {keyMessages.map((item) => (
            <article
              key={item.title}
              className="group relative overflow-hidden rounded-[1.2rem] border border-[#d8e3f8] bg-white/80 p-3.5 xl:p-4 shadow-[0_10px_24px_rgba(0,32,104,0.08)] backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(0,32,104,0.12)]"
            >
              <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-[#eef3ff] opacity-95 transition group-hover:scale-110" />

              <div className="relative z-10">
                <div className="mb-2.5 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#d5e1ff] bg-white text-[#002b7f] shadow-[0_5px_12px_rgba(0,43,127,0.1)]">
                  <span
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-white ${item.tone}`}
                  >
                    <MessageIcon type={item.icon} />
                  </span>
                </div>
                <p className="text-[0.9rem] font-semibold leading-tight text-[#002b7f] xl:text-[0.96rem]">
                  {item.title}
                </p>
                <p className="mt-1 text-[0.78rem] leading-5 text-[#3b507d] xl:text-[0.82rem]">
                  {item.text}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
