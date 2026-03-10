import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { getImportBatchDetail } from "@/lib/admin/status/get-import-batch-detail";
import { getImportBatchPreview } from "@/lib/admin/status/get-import-batch-preview";
import { ImportMappingForm } from "@/components/admin/import-mapping-form";
import { ApplyImportBatchCard } from "@/components/admin/apply-import-batch-card";
import { ImportPreviewIssuesPanel } from "@/components/admin/import-preview-issues-panel";
import { ImportPreviewSummary } from "@/components/admin/import-preview-summary";
import { ImportPreviewTable } from "@/components/admin/import-preview-table";


type PageProps = {
    params: Promise<{
        batchId: string;
    }>;
    searchParams?: Promise<{
        next_batch_id?: string;
        flow_step?: string;
        flow_total?: string;
    }>;
};

export default async function StatusImportBatchPage({ params, searchParams }: PageProps) {
    const { user, role, isActive } = await getCurrentAuthContext();

    if (!user) {
        redirect("/login");
    }

    if (isActive === false) {
        redirect("/inactive");
    }

    const isSuperAdmin = role === "super_admin";
    const isAdmin = role === "admin" || isSuperAdmin;

    if (!isAdmin) {
        redirect("/");
    }

    const { batchId } = await params;
    const resolvedSearchParams = searchParams ? await searchParams : undefined;
    const nextBatchId = resolvedSearchParams?.next_batch_id?.trim() || null;
    const flowStepRaw = Number(resolvedSearchParams?.flow_step ?? "");
    const flowTotalRaw = Number(resolvedSearchParams?.flow_total ?? "");
    const flowStep =
        Number.isFinite(flowStepRaw) && flowStepRaw > 0
            ? Math.floor(flowStepRaw)
            : null;
    const flowTotal =
        Number.isFinite(flowTotalRaw) && flowTotalRaw > 0
            ? Math.floor(flowTotalRaw)
            : null;
    const {
        batch,
        requiredFields,
        optionalFields,
        detectedHeaders,
        fieldAssignments,
    } = await getImportBatchDetail(batchId);
    
    const showPreview =
        batch.status === "preview_ready" ||
        batch.status === "applied";

    const previewData = showPreview
        ? await getImportBatchPreview(batchId)
        : null;
    const issueRowsCount =
        previewData?.rows.filter(
            (row) => row.validation_errors.length > 0 || row.warnings.length > 0,
        ).length ?? 0;

    return (
        <main className="min-h-screen bg-neutral-50">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
                <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
                    <p className="text-sm font-medium text-neutral-500">
                        Admin / Status / Import batch
                    </p>

                    <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
                        Revisar importación
                    </h1>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
                            <p className="text-neutral-500">Archivo</p>
                            <p className="mt-1 font-medium text-neutral-900">
                                {batch.file_name ?? "—"}
                            </p>
                        </div>

                        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
                            <p className="text-neutral-500">Sheet</p>
                            <p className="mt-1 font-medium text-neutral-900">
                                {batch.sheet_name ?? "—"}
                            </p>
                        </div>

                        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
                            <p className="text-neutral-500">Fila de headers</p>
                            <p className="mt-1 font-medium text-neutral-900">
                                {batch.header_row ?? "—"}
                            </p>
                        </div>

                        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
                            <p className="text-neutral-500">Estado</p>
                            <p className="mt-1 font-medium text-neutral-900">
                                {batch.status}
                            </p>
                        </div>
                    </div>
                </header>

                {batch.status === "mapping_required" ? (
                    <ImportMappingForm
                        batchId={batch.id}
                        importTypeCode={batch.import_type.code}
                        requiredFields={requiredFields}
                        optionalFields={optionalFields}
                        detectedHeaders={detectedHeaders}
                        fieldAssignments={fieldAssignments}
                    />
                ) : null}

                {showPreview && previewData ? (
                    <section className="space-y-6">
                        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                                <div>
                                    <h2 className="text-lg font-semibold text-neutral-950">
                                        Resultado del preview
                                    </h2>
                                    <p className="mt-1 text-sm text-neutral-600">
                                        Revisa incidencias y confirma cambios antes de aplicar el batch.
                                    </p>
                                </div>

                                <div className="flex flex-wrap gap-2 text-xs font-medium">
                                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-700">
                                        {previewData.summary.total_rows} filas
                                    </span>
                                    <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">
                                        {previewData.summary.invalid_rows} inválidas
                                    </span>
                                    <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">
                                        {issueRowsCount} con incidencias
                                    </span>
                                </div>
                            </div>
                        </div>

                        <ImportPreviewSummary summary={previewData.summary} />
                        <ApplyImportBatchCard
                            batchId={batch.id}
                            importTypeCode={batch.import_type.code}
                            batchStatus={batch.status}
                            invalidRows={previewData.summary.invalid_rows}
                            insertRows={previewData.summary.insert_rows}
                            updateRows={previewData.summary.update_rows}
                            noopRows={previewData.summary.noop_rows}
                            nextBatchId={nextBatchId}
                            flowStep={flowStep}
                            flowTotal={flowTotal}
                        />

                        <ImportPreviewIssuesPanel
                            rows={previewData.rows}
                            issuesCount={issueRowsCount}
                            initialOpen={previewData.summary.invalid_rows > 0}
                        />

                        <ImportPreviewTable rows={previewData.rows} />
                    </section>
                ) : null}

                {!showPreview && batch.status !== "mapping_required" ? (
                    <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
                        <h2 className="text-lg font-semibold text-neutral-950">
                            Batch aún sin preview
                        </h2>
                        <p className="mt-1 text-sm text-neutral-600">
                            Este batch todavía no tiene un preview generado o no está listo para mostrarse.
                        </p>
                    </section>
                ) : null}
            </div>
        </main>
    );
}
