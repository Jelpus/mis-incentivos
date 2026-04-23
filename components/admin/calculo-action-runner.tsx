"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { updateCalculoStatusAction, type CalculoActionResult } from "@/app/admin/calculo/actions";

type Props = {
  periodMonth: string;
  actionKey: "calcular" | "ajustar" | "aprobar" | "publicar" | "despublicar";
  submitLabel: string;
  backHref?: string;
};

type PreviewRecipient = {
  key: string;
  email: string;
  displayName: string;
  teamId: string;
  territorio: string;
  empleado: string;
  estado: "activo" | "inactivo";
};

type PublishPreviewResponse = {
  periodMonth: string;
  periodLabel: string;
  payPeriodLabel: string;
  recipients: {
    svm: PreviewRecipient[];
    sva: PreviewRecipient[];
  };
  selectedType: "svm" | "sva";
  selectedRecipientKey: string | null;
  html: string;
  error?: string;
};

export function CalculoActionRunner({ periodMonth, actionKey, submitLabel, backHref = "/admin/calculo" }: Props) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<CalculoActionResult | null>(null);

  const [showPublishConfirmModal, setShowPublishConfirmModal] = useState(false);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [previewType, setPreviewType] = useState<"svm" | "sva">("svm");
  const [previewRecipientKey, setPreviewRecipientKey] = useState("");
  const [previewRecipients, setPreviewRecipients] = useState<{ svm: PreviewRecipient[]; sva: PreviewRecipient[] }>({
    svm: [],
    sva: [],
  });
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewPeriodLabel, setPreviewPeriodLabel] = useState("");
  const [previewPayPeriodLabel, setPreviewPayPeriodLabel] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const periodLabel = useMemo(() => periodMonth.slice(0, 7), [periodMonth]);
  const activeRecipients = previewType === "svm" ? previewRecipients.svm : previewRecipients.sva;

  useEffect(() => {
    if (!showPublishConfirmModal || !showEmailPreview || actionKey !== "publicar") return;

    let isActive = true;

    const run = async () => {
      setPreviewLoading(true);
      setPreviewError(null);

      try {
        const search = new URLSearchParams();
        search.set("periodo", periodMonth.slice(0, 7));
        search.set("tipo", previewType);
        if (previewRecipientKey) search.set("persona", previewRecipientKey);

        const response = await fetch(`/api/admin/calculo/publish-preview?${search.toString()}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as PublishPreviewResponse;

        if (!response.ok) {
          throw new Error(payload.error ?? "No se pudo cargar el preview.");
        }

        if (!isActive) return;

        setPreviewRecipients(payload.recipients);
        setPreviewPeriodLabel(payload.periodLabel);
        setPreviewPayPeriodLabel(payload.payPeriodLabel);
        setPreviewHtml(payload.html || "");
        setPreviewRecipientKey(payload.selectedRecipientKey ?? "");
      } catch (error) {
        if (!isActive) return;
        setPreviewError(error instanceof Error ? error.message : "No se pudo cargar el preview.");
      } finally {
        if (isActive) setPreviewLoading(false);
      }
    };

    void run();

    return () => {
      isActive = false;
    };
  }, [showPublishConfirmModal, showEmailPreview, actionKey, periodMonth, previewType, previewRecipientKey]);

  function runAction() {
    setResult(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append("period_month", periodMonth);
      formData.append("action", actionKey);
      const response = await updateCalculoStatusAction(null, formData);
      setResult(response);
    });
  }

  function handlePrimaryActionClick() {
    if (actionKey === "publicar") {
      setShowPublishConfirmModal(true);
      setShowEmailPreview(false);
      setPreviewType("svm");
      setPreviewRecipientKey("");
      setPreviewRecipients({ svm: [], sva: [] });
      setPreviewHtml("");
      setPreviewPeriodLabel("");
      setPreviewPayPeriodLabel("");
      setPreviewError(null);
      return;
    }
    runAction();
  }

  function confirmPublishAction() {
    setShowPublishConfirmModal(false);
    setShowEmailPreview(false);
    runAction();
  }

  return (
    <>
      <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-neutral-600">
          Periodo: <span className="font-semibold text-neutral-900">{periodLabel}</span>
        </p>

        {result ? (
          <p className={`mt-3 text-sm ${result.ok ? "text-emerald-700" : "text-red-700"}`}>
            {result.message}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handlePrimaryActionClick}
            disabled={isPending}
            className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {isPending ? "Procesando..." : submitLabel}
          </button>
          <Link
            href={backHref}
            className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
          >
            Volver a calculo
          </Link>
        </div>
      </section>

      {showPublishConfirmModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-5xl rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-neutral-900">Confirmar publicacion</h3>
            <p className="mt-2 text-sm text-neutral-700">
              Al dar clic se publicaran los resultados y se comunicara a la fuerza de ventas. Deseas continuar?
            </p>

            {showEmailPreview ? (
              <div className="mt-4 space-y-3">
                <div className="grid gap-3 lg:grid-cols-3">
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Periodo analizado</p>
                    <p className="mt-1 text-sm font-medium text-neutral-800">{previewPeriodLabel || "-"}</p>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Cuando sera pagado</p>
                    <p className="mt-1 text-sm font-medium text-neutral-800">{previewPayPeriodLabel || "-"}</p>
                  </div>

                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                    <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Tipo de preview</label>
                    <select
                      value={previewType}
                      onChange={(event) => {
                        const nextType = event.target.value === "sva" ? "sva" : "svm";
                        setPreviewType(nextType);
                        setPreviewRecipientKey("");
                      }}
                      className="mt-1 h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
                    >
                      <option value="svm">Manager (SVM)</option>
                      <option value="sva">Sales force (SVA)</option>
                    </select>
                  </div>

                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                    <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Persona</label>
                    <select
                      value={previewRecipientKey}
                      onChange={(event) => setPreviewRecipientKey(event.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
                    >
                      {activeRecipients.length === 0 ? (
                        <option value="">Sin destinatarios</option>
                      ) : (
                        activeRecipients.map((recipient) => (
                          <option key={recipient.key} value={recipient.key}>
                            {recipient.displayName} | {recipient.email} | {recipient.teamId}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  {previewLoading ? (
                    <p className="text-sm text-neutral-600">Cargando preview...</p>
                  ) : previewError ? (
                    <p className="text-sm text-red-700">{previewError}</p>
                  ) : previewHtml ? (
                    <iframe
                      title="Preview de correo"
                      srcDoc={previewHtml}
                      className="h-[460px] w-full rounded-lg border border-neutral-200 bg-white"
                    />
                  ) : (
                    <p className="text-sm text-neutral-600">No hay preview disponible.</p>
                  )}
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowEmailPreview((current) => !current)}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
              >
                Ver preview de correo
              </button>
              <button
                type="button"
                onClick={confirmPublishAction}
                disabled={isPending}
                className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPublishConfirmModal(false);
                  setShowEmailPreview(false);
                }}
                disabled={isPending}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-60"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
