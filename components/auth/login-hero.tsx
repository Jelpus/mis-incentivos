"use client";

import Image from "next/image";

type LoginHeroProps = {
  mobileMode?: boolean;
  onAccess?: () => void;
};

const keyMessages = [
  {
    icon: "clarity",
    title: "Transparencia total",
    text: "Entiende cada variable de tu calculo y maximiza tu potencial.",
  },
  {
    icon: "empowerment",
    title: "Empoderamiento",
    text: "Toma el control de tu rendimiento con datos claros y accionables.",
  },
  {
    icon: "security",
    title: "Seguridad y rapidez",
    text: "Una experiencia mas segura, intuitiva y enfocada en resultados.",
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
  return (
    <section
      className={`relative flex items-start overflow-hidden bg-white ${
        mobileMode
          ? "min-h-dvh border-b border-[#dfdfdf] px-6 pb-10 pt-8 sm:px-10 sm:pt-12"
          : "min-h-dvh border-r border-[#dfdfdf] px-14 pb-16 pt-14"
      }`}
    >
      <div className="pointer-events-none absolute -right-56 bottom-[-28%] hidden h-[68rem] w-[68rem] rounded-full bg-[#ff9f1c] float-slow sm:block" />
      <div className="pointer-events-none absolute -right-36 bottom-[-30%] hidden h-[44rem] w-[44rem] rounded-full bg-[#ff5661] float-slower sm:block" />
      <div className="pointer-events-none absolute -right-20 bottom-[-8%] hidden h-[30rem] w-[20rem] rounded-[44%_56%_34%_66%/40%_40%_60%_60%] bg-[#002068] float-slow sm:block" />
      <div className="pointer-events-none absolute right-[17rem] bottom-[-24rem] hidden h-[35rem] w-[30rem] rounded-[58%_42%_65%_35%/62%_62%_38%_38%] bg-[#ff8d35] float-slower sm:block" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_18%,rgba(0,32,104,0.06),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_45%_75%,rgba(231,74,34,0.05),transparent_34%)]" />

      <div className="relative z-10 grid w-full max-w-[108ch] gap-8 enter-fade-up sm:gap-10">
        <div className="flex items-center pb-15">
          <Image
            src="/novartis_color.svg"
            alt="Novartis"
            width={290}
            height={56}
            className="h-10 w-auto sm:h-12"
            priority
          />
        </div>

        <div className="grid gap-5 sm:gap-7">
          <h1 className="text-balance max-w-[10ch] text-[#002b7f]">
            Tu impacto,
            <br />
            mas claro
            <br />
            <span className="bg-[linear-gradient(90deg,#ff4f67_0%,#ff5c37_48%,#ff6f00_100%)] bg-clip-text text-transparent">
              que nunca.
            </span>
          </h1>
          <p className="max-w-[49ch] text-sm leading-6 text-[#2b3f6e] sm:text-base sm:leading-7">
            La nueva plataforma de incentivos de Novartis. Mas rapida, segura e
            intuitiva. Disenada para darte transparencia total sobre tu desempeno.
          </p>
          <p className="max-w-[45ch] text-sm leading-6 text-[#445f95]">
            Tu exito impulsa nuestra mision. Juntos, reimaginamos la medicina.
          </p>

          {mobileMode ? (
            <div className="pt-2">
              <button
                type="button"
                onClick={onAccess}
                className="focus-ring inline-flex items-center gap-2 rounded-md bg-[#002068] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#14347d]"
              >
                Acceder
                <span aria-hidden="true">→</span>
              </button>
            </div>
          ) : null}
        </div>

        <div
          className={`gap-5 md:grid md:grid-cols-2 lg:grid-cols-2 2xl:grid-cols-3 ${
            mobileMode ? "hidden lg:grid" : "hidden md:grid"
          }`}
        >
          {keyMessages.map((item) => (
            <article
              key={item.title}
              className="group relative overflow-hidden rounded-[1.45rem] border border-[#d8e3f8] bg-white/80 p-6 shadow-[0_12px_30px_rgba(0,32,104,0.08)] backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(0,32,104,0.12)]"
            >
              <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-[#eef3ff] opacity-95 transition group-hover:scale-110" />

              <div className="relative z-10">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[#d5e1ff] bg-white text-[#002b7f] shadow-[0_6px_16px_rgba(0,43,127,0.1)]">
                  <MessageIcon type={item.icon} />
                </div>
                <p className="text-lg font-semibold leading-tight text-[#002b7f]">
                  {item.title}
                </p>
                <p className="mt-2.5 text-base leading-7 text-[#3b507d]">{item.text}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
