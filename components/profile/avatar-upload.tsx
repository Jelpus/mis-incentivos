"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AvatarUploadProps = {
  value: string;
  onChange: (url: string) => void;
};

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase();
}

export function AvatarUpload({ value, onChange }: AvatarUploadProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_AVATARS_BUCKET ?? "avatars";

  const helper = useMemo(
    () => `Archivo JPG/PNG/WebP (max 4MB)`,
    [bucket],
  );

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Formato no permitido. Usa JPG, PNG o WebP.");
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      setError("La imagen supera 4MB.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Sesion no valida para subir imagen.");
        setLoading(false);
        return;
      }

      const fileName = sanitizeFileName(file.name);
      const path = `profiles/${user.id}/${Date.now()}-${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        setError("No se pudo subir la imagen.");
        setLoading(false);
        return;
      }

      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      onChange(data.publicUrl);
    } catch {
      setError("Error de conexion al subir la imagen.");
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  }

  return (
    <div className="grid gap-2">
      <label htmlFor="avatarFile" className="text-sm font-medium text-[#1e293b]">
        Subir foto desde tu equipo
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <label className="focus-ring inline-flex h-10 cursor-pointer items-center rounded-lg border border-[#c8d6f5] bg-[#f2f7ff] px-4 text-sm font-medium text-[#1d4ed8] transition hover:bg-[#eaf2ff]">
          {loading ? "Subiendo..." : "Seleccionar imagen"}
          <input
            id="avatarFile"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            disabled={loading}
            className="sr-only"
          />
        </label>
        <p className="text-xs text-[#64748b]">{helper}</p>
      </div>
      {value ? (
        <p className="text-xs font-medium text-[#047857]">Imagen cargada.</p>
      ) : null}
      {error ? <p className="text-xs text-[#b42318]">{error}</p> : null}
    </div>
  );
}
