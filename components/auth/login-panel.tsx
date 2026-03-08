"use client";

import Image from "next/image";
import Link from "next/link";
import { MagicLinkForm } from "@/components/auth/magic-link-form";

type LoginPanelProps = {
  showBackLink?: boolean;
  onBack?: () => void;
};

export function LoginPanel({ showBackLink = false, onBack }: LoginPanelProps) {
  return (
    <section className="flex h-dvh bg-[#fcfcfc] px-6 py-8 sm:px-10 lg:px-12">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-between enter-fade-up">
        <div>
          {showBackLink ? (
            <button
              type="button"
              onClick={onBack}
              className="mb-5 inline-flex items-center gap-2 text-sm text-[#445f95] transition hover:text-[#002068]"
            >
              <span aria-hidden="true">&lt;-</span>
              Volver
            </button>
          ) : null}

          <div className="mb-8 flex items-center gap-3">
            <Image
              src="/simbol_color.svg"
              alt="Simbolo Novartis"
              width={24}
              height={24}
              className="h-6 w-auto"
              priority
            />
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#002068]">
              Mis Incentivos 2.0
            </p>
          </div>

          <div className="grid gap-2">
            <h2 className="text-[2rem] leading-tight text-[#161616]">Bienvenido</h2>
            <p className="text-sm text-[#667085]">Inicia sesion para continuar</p>
          </div>

          <div className="mt-7">
            <MagicLinkForm />
          </div>
        </div>

        <footer className="mt-8 border-t border-[#e4e7ec] pt-4 text-xs text-[#667085]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span>&copy; {new Date().getFullYear()} Novartis</span>
            <a href="#" className="transition hover:text-[#101828]">
              Privacidad
            </a>
            <a href="#" className="transition hover:text-[#101828]">
              Soporte tecnico
            </a>
          </div>

          <div className="mt-3 flex items-center gap-2 text-[11px]">
            <span>Desarrollado por</span>
            <Link
              href="https://www.jelpus.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center"
            >
              <Image
                src="/jelpus.svg"
                alt="Jelpus"
                width={76}
                height={25}
                className="h-25 w-auto"
              />
            </Link>
          </div>
        </footer>
      </div>
    </section>
  );
}

