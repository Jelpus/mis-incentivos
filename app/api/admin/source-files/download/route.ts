import { NextResponse } from "next/server";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { normalizePeriodMonthInput, normalizeSourceFileCode } from "@/lib/admin/incentive-rules/shared";
import { createAdminClient } from "@/lib/supabase/admin";

type SourceFileRow = {
  original_file_name: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  content_type: string | null;
};

function isAdminRole(role: string | null, isActive: boolean | null): boolean {
  return isActive !== false && (role === "admin" || role === "super_admin");
}

export async function GET(request: Request) {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const url = new URL(request.url);
  const periodMonth = normalizePeriodMonthInput(url.searchParams.get("period"));
  const fileCode = normalizeSourceFileCode(url.searchParams.get("fileCode"));

  if (!periodMonth || !fileCode) {
    return NextResponse.json({ error: "Faltan period y fileCode." }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Admin client no disponible." }, { status: 500 });
  }

  const metadataResult = await supabase
    .from("team_incentive_source_files")
    .select("original_file_name, storage_bucket, storage_path, content_type")
    .eq("period_month", periodMonth)
    .eq("file_code", fileCode)
    .maybeSingle<SourceFileRow>();

  if (metadataResult.error) {
    return NextResponse.json(
      { error: `No se pudo cargar metadata del archivo: ${metadataResult.error.message}` },
      { status: 400 },
    );
  }

  const metadata = metadataResult.data;
  const bucket = String(metadata?.storage_bucket ?? "").trim();
  const path = String(metadata?.storage_path ?? "").trim();
  if (!metadata || !bucket || !path) {
    return NextResponse.json({ error: "Archivo fuente no encontrado en Storage." }, { status: 404 });
  }

  const downloadResult = await supabase.storage.from(bucket).download(path);
  if (downloadResult.error || !downloadResult.data) {
    return NextResponse.json(
      { error: `No se pudo descargar archivo desde Storage: ${downloadResult.error?.message ?? "archivo no disponible"}` },
      { status: 400 },
    );
  }

  const fileName = String(metadata.original_file_name ?? `${fileCode}.xlsx`).replace(/"/g, "");
  return new Response(await downloadResult.data.arrayBuffer(), {
    status: 200,
    headers: {
      "Content-Type": metadata.content_type ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
