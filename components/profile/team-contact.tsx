
"use client";

import Image from "next/image";
import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type TeamContactData = {
  name: string;
  teamId: string;
  email?: string | null;
  pictureUrl?: string | null;
};

type TeamContactProps = {
  accountRole: string | null;
  teamContact: TeamContactData | null | undefined;
  contactMailto?: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Avatar: photo or initials fallback */
function ContactAvatar({
  name,
  pictureUrl,
}: {
  name: string;
  pictureUrl?: string | null;
}) {
  if (pictureUrl) {
    return (
      <Image
        src={pictureUrl}
        alt={name}
        width={48}
        height={48}
        className="h-12 w-12 rounded-full object-cover ring-2 ring-white"
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700 ring-2 ring-white"
    >
      {getInitials(name)}
    </div>
  );
}

/** Animated disclosure for secondary contact details */
function ContactDetails({
  contact,
}: {
  contact: TeamContactData;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={[
          "flex items-center gap-1.5 text-xs font-medium transition-colors duration-150",
          "text-blue-500 hover:text-blue-700",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 rounded",
        ].join(" ")}
      >
        <ChevronIcon open={open} />
        {open ? "Ocultar detalles" : "Ver detalles"}
      </button>

      {/* Animated panel */}
      <div
        className={[
          "grid transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        ].join(" ")}
      >
        <div className="overflow-hidden">
          <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2.5 border-t border-blue-50 pt-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Nombre
              </dt>
              <dd className="mt-0.5 font-medium text-gray-800">{contact.name}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Team ID
              </dt>
              <dd className="mt-0.5 font-mono text-xs text-gray-600">{contact.teamId}</dd>
            </div>
            {contact.email && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Correo
                </dt>
                <dd className="mt-0.5 font-medium text-gray-800 break-all">{contact.email}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}

/** Animated chevron icon */
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`transition-transform duration-300 ${open ? "rotate-180" : "rotate-0"}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** Mail icon */
function MailIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TeamContact({
  accountRole,
  teamContact,
  contactMailto,
}: TeamContactProps) {
  const isAllowed = accountRole === "user" || accountRole === "manager";
  if (!isAllowed) return null;

  return (
    <section
      aria-labelledby="team-contact-heading"
      className="overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-b from-blue-50/60 to-white"
    >
      {/* ── Section header ─────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
        <h3
          id="team-contact-heading"
          className="text-xs font-semibold uppercase tracking-widest text-blue-400"
        >
          Contacto asignado
        </h3>
      </div>

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {!teamContact ? (
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <p className="text-sm text-gray-400">
            No hay un contacto asignado para el equipo actual.
          </p>
        </div>
      ) : (
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          {/* ── Contact card ─────────────────────────────────────────── */}
          <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
            {/* Top row: avatar + name + CTA */}
            <div className="flex items-center gap-3 sm:gap-4">
              <ContactAvatar
                name={teamContact.name}
                pictureUrl={teamContact.pictureUrl}
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {teamContact.name}
                </p>
                <p className="mt-0.5 truncate text-xs text-gray-400">
                  {teamContact.email ?? "Sin correo registrado"}
                </p>
              </div>

              {/* CTA: send email */}
              {contactMailto ? (
                <a
                  href={contactMailto}
                  className={[
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full",
                    "bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white",
                    "shadow-sm transition-all duration-150",
                    "hover:bg-blue-700 active:scale-95",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                  ].join(" ")}
                >
                  <MailIcon />
                  <span className="hidden sm:inline">Enviar correo</span>
                  <span className="sm:hidden">Correo</span>
                </a>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-500">
                  Sin correo
                </span>
              )}
            </div>

            {/* Divider */}
            <div className="my-3 h-px bg-gray-100" aria-hidden="true" />

            {/* Expandable details */}
            <ContactDetails contact={teamContact} />
          </div>

          {/* Helper text */}
          <p className="mt-2.5 px-1 text-xs text-gray-400">
            Contacta a tu experto asignado si tienes dudas respecto al pago.
          </p>
        </div>
      )}
    </section>
  );
}
