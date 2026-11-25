"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCertificationStatus, validCertificationYear } from "@/lib/admin/source-ranking/certifications-data";
import { normalizeCertifications } from "@/lib/admin/source-ranking/normalize-certifications";

const MAX_BYTES = 10 * 1024 * 1024;
const bucketName = () => process.env.SUPABASE_SOURCE_RANKING_BUCKET ?? process.env.NEXT_PUBLIC_SUPABASE_SOURCE_RANKING_BUCKET ?? "source-ranking-files";
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "No se pudo procesar Oficial Certificaciones.";

async function adminContext() {
  const auth = await getCurrentAuthContext();
  if (!auth.user || auth.isActive === false || !["admin", "super_admin"].includes(auth.role ?? "")) throw new Error("No autorizado.");
  const supabase = createAdminClient();
  if (!supabase) throw new Error("Admin client no disponible.");
  return { supabase, userId: auth.user.id };
}

function validateFile(year: number, fileName: string, fileSize: number) {
  if (!validCertificationYear(year)) throw new Error("Selecciona un año válido de certificaciones.");
  if (!/\.xlsx$/i.test(fileName)) throw new Error("Selecciona un archivo Excel .xlsx.");
  if (!Number.isInteger(fileSize) || fileSize <= 0 || fileSize > MAX_BYTES) throw new Error("El archivo debe ocupar entre 1 byte y 10 MB.");
  const years = fileName.match(/\b20\d{2}\b|(?<=_)20\d{2}(?=_)/g);
  if (years?.some((fileYear) => Number(fileYear) !== year)) throw new Error("El año del nombre del archivo no coincide con el año seleccionado.");
}

export async function prepareCertificationsUploadAction(params: { year: number; fileName: string; fileSize: number }) {
  try {
    const { supabase, userId } = await adminContext();
    validateFile(params.year, params.fileName, params.fileSize);
    const schema = await supabase.from("ranking_certification_versions").select("id", { head: true, count: "exact" }).eq("certification_year", params.year);
    if (schema.error) throw new Error("No se pudo consultar Oficial Certificaciones. Comprueba que se aplicó la migración de certificaciones anuales.");
    const bucket = bucketName();
    const existing = await supabase.storage.getBucket(bucket);
    if (existing.error) {
      if (!/not found|does not exist/i.test(existing.error.message)) throw new Error(existing.error.message);
      const created = await supabase.storage.createBucket(bucket, { public: false, fileSizeLimit: "50MB" });
      if (created.error) throw new Error(created.error.message);
    } else if (existing.data.public) throw new Error("El bucket de fuentes debe ser privado para almacenar las calificaciones.");
    const safeName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/\.{2,}/g, "-");
    const path = `certifications/${params.year}/${userId}/${randomUUID()}-${safeName}`;
    const signed = await supabase.storage.from(bucket).createSignedUploadUrl(path);
    if (signed.error || !signed.data) throw new Error(signed.error?.message ?? "No se pudo preparar la carga.");
    return { ok: true as const, bucket, path, token: signed.data.token };
  } catch (error) {
    return { ok: false as const, message: errorMessage(error) };
  }
}

export async function completeCertificationsUploadAction(params: { year: number; path: string; fileName: string; fileSize: number }) {
  try {
    const { supabase, userId } = await adminContext();
    validateFile(params.year, params.fileName, params.fileSize);
    if (!params.path.startsWith(`certifications/${params.year}/${userId}/`) || params.path.includes("..")) throw new Error("Ruta de archivo inválida.");
    const downloaded = await supabase.storage.from(bucketName()).download(params.path);
    if (downloaded.error || !downloaded.data) throw new Error(downloaded.error?.message ?? "Archivo no disponible.");
    validateFile(params.year, params.fileName, downloaded.data.size);
    if (downloaded.data.size !== params.fileSize) throw new Error("El tamaño del archivo no coincide con la carga preparada.");
    const buffer = Buffer.from(await downloaded.data.arrayBuffer());
    const status = await loadCertificationStatus(supabase, params.year);
    const { rows, summary } = normalizeCertifications({ fileBuffer: buffer, statusRows: status.rows });
    if (rows.length > 10000) throw new Error("El archivo excede las 10000 calificaciones permitidas.");
    const result = await supabase.rpc("save_ranking_certification_version", {
      p_year: params.year, p_file_name: params.fileName, p_bucket: bucketName(), p_path: params.path,
      p_sha256: createHash("sha256").update(buffer).digest("hex"), p_status_period: status.period,
      p_summary: summary, p_rows: rows, p_actor: userId,
    });
    if (result.error) throw new Error(`No se pudo guardar la versión completa: ${result.error.message}`);
    revalidatePath("/admin/source-ranking");
    revalidatePath("/perfil/ranking");
    revalidatePath("/mi-cuenta");
    return {
      ok: true as const,
      message: `Año ${params.year}, versión ${result.data.version_no}: ${summary.sourceRows} filas, ${summary.matchedRows} vinculadas, ${summary.conflictRows} con conflicto, ${summary.unmatchedRows} sin vincular y ${summary.missingScoreRows} con notas pendientes.`,
    };
  } catch (error) {
    return { ok: false as const, message: errorMessage(error) };
  }
}

export async function downloadCertificationsVersionAction(versionId: string) {
  try {
    const { supabase } = await adminContext();
    const version = await supabase.from("ranking_certification_versions")
      .select("storage_bucket, storage_path, original_file_name").eq("id", versionId).maybeSingle();
    if (version.error || !version.data) throw new Error(version.error?.message ?? "Versión no encontrada.");
    const signed = await supabase.storage.from(version.data.storage_bucket).createSignedUrl(version.data.storage_path, 600, { download: version.data.original_file_name });
    if (signed.error || !signed.data) throw new Error(signed.error?.message ?? "No se pudo descargar el archivo.");
    return { ok: true as const, url: signed.data.signedUrl };
  } catch (error) {
    return { ok: false as const, message: errorMessage(error) };
  }
}
