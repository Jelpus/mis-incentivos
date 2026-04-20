import { NextResponse } from "next/server";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

type ObjectiveVersionRow = {
  source_file_name: string | null;
  summary: Record<string, unknown> | null;
};

function resolveDownloadSource(
  value: string | null | undefined,
): "private" | "drilldown" | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "private") return "private";
  if (normalized === "drilldown") return "drilldown";
  return null;
}

function isAdminRole(role: string | null, isActive: boolean | null): boolean {
  return isActive !== false && (role === "admin" || role === "super_admin");
}

function readStoredSourceMetadata(
  summary: Record<string, unknown> | null,
  source: "private" | "drilldown",
): {
  originalFileName: string;
  storageBucket: string;
  storagePath: string;
  contentType: string | null;
} | null {
  if (!summary || typeof summary !== "object") return null;
  const sourceFiles = summary.sourceFiles;
  if (!sourceFiles || typeof sourceFiles !== "object") return null;
  const sourceMetadata = (sourceFiles as Record<string, unknown>)[source];
  if (!sourceMetadata || typeof sourceMetadata !== "object") return null;

  const bucket = String((sourceMetadata as Record<string, unknown>).storageBucket ?? "").trim();
  const path = String((sourceMetadata as Record<string, unknown>).storagePath ?? "").trim();
  if (!bucket || !path) return null;

  return {
    originalFileName: String(
      (sourceMetadata as Record<string, unknown>).originalFileName ??
      `${source}.xlsx`,
    ).trim() || `${source}.xlsx`,
    storageBucket: bucket,
    storagePath: path,
    contentType: String((sourceMetadata as Record<string, unknown>).contentType ?? "").trim() || null,
  };
}

function buildFallbackFileName(sourceFileName: string | null, source: "private" | "drilldown"): string {
  const suffix = source === "private" ? "privados" : "drilldown";
  const base = String(sourceFileName ?? "").trim();
  if (!base) return `objetivos-${suffix}.xlsx`;
  return `${base}-${suffix}.xlsx`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const versionId = String((await params).versionId ?? "").trim();
  if (!versionId) {
    return NextResponse.json({ error: "Falta versionId." }, { status: 400 });
  }

  const url = new URL(request.url);
  const source = resolveDownloadSource(url.searchParams.get("source"));
  if (!source) {
    return NextResponse.json(
      { error: "Parametro source invalido. Usa private o drilldown." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Admin client no disponible." },
      { status: 500 },
    );
  }

  const versionResult = await supabase
    .from("team_objective_target_versions")
    .select("source_file_name, summary")
    .eq("id", versionId)
    .maybeSingle<ObjectiveVersionRow>();

  if (versionResult.error) {
    return NextResponse.json(
      { error: `No se pudo cargar metadata de la version: ${versionResult.error.message}` },
      { status: 400 },
    );
  }
  if (!versionResult.data) {
    return NextResponse.json({ error: "Version no encontrada." }, { status: 404 });
  }

  const sourceMetadata = readStoredSourceMetadata(versionResult.data.summary, source);
  if (!sourceMetadata) {
    return NextResponse.json(
      {
        error:
          "Esta version no tiene archivo almacenado para descarga. Aplica en versiones nuevas guardadas con storage habilitado.",
      },
      { status: 404 },
    );
  }

  const downloadResult = await supabase
    .storage
    .from(sourceMetadata.storageBucket)
    .download(sourceMetadata.storagePath);

  if (downloadResult.error || !downloadResult.data) {
    return NextResponse.json(
      { error: `No se pudo descargar archivo desde storage: ${downloadResult.error?.message ?? "archivo no disponible"}` },
      { status: 400 },
    );
  }

  const fileName = sourceMetadata.originalFileName || buildFallbackFileName(versionResult.data.source_file_name, source);
  const arrayBuffer = await downloadResult.data.arrayBuffer();

  return new Response(arrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": sourceMetadata.contentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${fileName.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}

