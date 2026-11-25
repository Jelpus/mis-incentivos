"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { completeCertificationsUploadAction, downloadCertificationsVersionAction, prepareCertificationsUploadAction } from "@/app/admin/source-ranking/certifications-actions";
import type { AnnualCertificationsData } from "@/lib/admin/source-ranking/certifications-data";
import { formatDateTimeNoTimezoneShift } from "@/lib/date-time";
import { createClient } from "@/lib/supabase/client";

export function SourceRankingCertificationsCard({ data }: { data: AnnualCertificationsData }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [downloading, startDownload] = useTransition();
  const latest = data.versions[0];

  function changeYear(year: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("certYear", year);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function upload() {
    if (!file) return;
    startTransition(async () => {
      setMessage(null);
      try {
        const prepared = await prepareCertificationsUploadAction({ year: data.year, fileName: file.name, fileSize: file.size });
        if (!prepared.ok) { setMessage(prepared); return; }
        const uploaded = await createClient().storage.from(prepared.bucket).uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        if (uploaded.error) throw new Error(uploaded.error.message);
        const result = await completeCertificationsUploadAction({ year: data.year, path: prepared.path, fileName: file.name, fileSize: file.size });
        setMessage(result);
        if (result.ok) router.refresh();
      } catch (error) {
        setMessage({ ok: false, message: error instanceof Error ? error.message : "No se pudo completar la carga." });
      }
    });
  }

  function download(id: string) {
    startDownload(async () => {
      try {
        const result = await downloadCertificationsVersionAction(id);
        if (!result.ok) { setMessage(result); return; }
        // The signed response uses Content-Disposition: attachment. Navigating
        // to it starts a download without depending on asynchronous popups.
        window.location.assign(result.url);
      } catch {
        setMessage({ ok: false, message: "No se pudo descargar la versión." });
      }
    });
  }

  const score = (value: number | null) => value === null ? "Pendiente" : `${Number(value).toLocaleString("es-MX", { maximumFractionDigits: 2 })}%`;

  return (
    <section aria-labelledby="certifications-title" className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="certifications-title" className="text-xl font-semibold text-neutral-950">Oficial Certificaciones</h2>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">Calificaciones anuales para Certificación anual y Conocimiento científico. Se usa la última versión del año y se conservan las anteriores.</p>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
          Año de certificación
          <select value={data.year} disabled={pending} onChange={(event) => changeYear(event.target.value)} className="rounded-xl border border-neutral-300 bg-white px-3 py-2">
            {data.years.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
      </div>
      <p className="mt-3 text-sm text-neutral-600">Certificación anual: % Acreditación. Conocimiento científico: columna del mismo nombre. La vinculación prioriza NO.EMPLEADO y usa TERRITORIO cuando falta el empleado. N/A se conserva como pendiente.</p>
      {data.error ? <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{data.error}</p> : null}
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-col gap-2 text-sm font-medium text-neutral-700">
          Archivo oficial (.xlsx, máximo 10 MB)
          <input type="file" accept=".xlsx" disabled={pending || Boolean(data.error)} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setMessage(null); }} className="block max-w-full rounded-xl border border-neutral-300 p-2 text-sm" />
        </label>
        <button type="button" onClick={upload} disabled={!file || pending || Boolean(data.error)} className="rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Subiendo y validando..." : `Cargar versión ${data.year}`}</button>
      </div>
      <div aria-live="polite">
        {message ? <p role={message.ok ? "status" : "alert"} className={`mt-4 rounded-xl p-3 text-sm ${message.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{message.message}</p> : null}
      </div>
      {latest ? (
        <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
          <p className="font-semibold text-neutral-950">Versión vigente: {data.year} / v{latest.version_no}</p>
          <p className="mt-1">{latest.summary.matchedRows} de {latest.summary.sourceRows} filas vinculadas. {latest.summary.conflictRows} con conflicto, {latest.summary.unmatchedRows} sin vincular y {latest.summary.missingScoreRows} con alguna nota pendiente.</p>
          <p className="mt-1">Status utilizado: {latest.status_period_month.slice(0, 7)}. Las incidencias de identidad y las notas faltantes quedan pendientes en el ranking.</p>
        </div>
      ) : !data.error ? <p className="mt-5 text-sm text-amber-800">Todavía no hay una versión para {data.year}. Estos criterios quedarán pendientes hasta cargar las calificaciones.</p> : null}
      {data.versions.length > 0 ? (
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <caption className="pb-3 text-left font-semibold text-neutral-900">Historial anual</caption>
            <thead><tr className="border-b text-xs uppercase text-neutral-500"><th className="p-3">Versión</th><th className="p-3">Archivo</th><th className="p-3">Carga</th><th className="p-3">Acción</th></tr></thead>
            <tbody>{data.versions.map((version) => <tr key={version.id} className="border-b border-neutral-100"><td className="p-3">{version.version_no}{version.id === latest?.id ? " (vigente)" : ""}</td><td className="p-3">{version.original_file_name}</td><td className="p-3">{formatDateTimeNoTimezoneShift(version.created_at, "es-MX", "-")}</td><td className="p-3"><button type="button" onClick={() => download(version.id)} disabled={downloading || pending} className="font-semibold text-blue-800 disabled:opacity-50" aria-label={`Descargar versión ${version.version_no}`}>Descargar</button></td></tr>)}</tbody>
          </table>
        </div>
      ) : null}
      {data.rows.length > 0 ? (
        <details className="mt-5 border-t border-neutral-200 pt-4">
          <summary className="cursor-pointer text-sm font-semibold text-neutral-900">Ver calificaciones e incidencias ({data.rows.length} filas)</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">Calificaciones de la versión vigente</caption>
              <thead><tr className="border-b text-xs uppercase text-neutral-500"><th className="p-3">Fila</th><th className="p-3">Persona original</th><th className="p-3">Empleado / territorio original</th><th className="p-3">Vinculación en Status</th><th className="p-3">Conocimiento científico</th><th className="p-3">Certificación anual</th><th className="p-3">Incidencia</th></tr></thead>
              <tbody>{data.rows.map((row) => <tr key={row.source_row} className="border-b border-neutral-100"><td className="p-3">{row.source_row}</td><td className="p-3">{row.source_name}</td><td className="p-3">{row.source_employee ?? "Sin empleado"}<br />{row.source_territory ?? "Sin territorio"}</td><td className="p-3">{row.matched_name ?? "Pendiente"}<br />{row.matched_employee ?? ""} {row.matched_territory ?? ""}</td><td className="p-3">{score(row.scientific_knowledge_pct)}</td><td className="p-3">{score(row.annual_certification_pct)}</td><td className="p-3">{row.match_issue ?? (row.scientific_knowledge_pct === null || row.annual_certification_pct === null ? "Calificación pendiente" : "Sin incidencias")}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      ) : null}
    </section>
  );
}
