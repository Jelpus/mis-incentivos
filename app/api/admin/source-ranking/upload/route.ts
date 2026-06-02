import { NextResponse } from "next/server";
import { uploadSourceRankingFileAction } from "@/app/admin/source-ranking/actions";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const result = await uploadSourceRankingFileAction(null, formData);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? `Error inesperado en la carga: ${error.message}`
            : "Error inesperado en la carga.",
      },
      { status: 500 },
    );
  }
}
