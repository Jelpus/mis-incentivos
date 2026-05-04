"use client";

import Link from "next/link";
import type { ContestRankingRow } from "@/lib/ranking-contests/types";

const statusClass: Record<ContestRankingRow["qualificationStatus"], string> = {
  qualified: "bg-emerald-100 text-emerald-700",
  disqualified: "bg-red-100 text-red-700",
  pending: "bg-amber-100 text-amber-800",
  no_components: "bg-neutral-100 text-neutral-600",
};

function formatPoints(value: number) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 }).format(value);
}

export function ContestRankingTable({ rows }: { rows: ContestRankingRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#d8e3f8] bg-[#f8fbff] p-6 text-sm text-[#667085]">
        No hay filas de ranking para el concurso seleccionado.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[#e3ebfa]">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-[#d8e3f8] bg-[#f8fbff] text-left text-xs uppercase tracking-[0.08em] text-[#475467]">
            <th className="px-4 py-3">Rank</th>
            <th className="px-4 py-3">Nombre</th>
            <th className="px-4 py-3">Territorio</th>
            <th className="px-4 py-3">Ranking Group</th>
            <th className="px-4 py-3">Estado</th>
            <th className="px-4 py-3">Calificadores</th>
            <th className="px-4 py-3 text-right">Puntos</th>
            <th className="px-4 py-3 text-right">Detalle</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf2fb] bg-white">
          {rows.map((row) => (
            <tr key={`${row.contestId}-${row.participantId}`} className="hover:bg-[#f8fbff]">
              <td className="px-4 py-3 font-semibold text-[#1e3a8a]">{row.rank ?? "-"}</td>
              <td className="px-4 py-3">
                <p className="font-semibold text-[#1e3a8a]">{row.participantName}</p>
                {row.employeeNumber ? <p className="text-xs text-[#667085]">Empleado {row.employeeNumber}</p> : null}
              </td>
              <td className="px-4 py-3 text-[#334155]">{row.territory || "-"}</td>
              <td className="px-4 py-3 text-[#334155]">{row.rankingGroup || "-"}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[row.qualificationStatus]}`}>
                  {row.qualificationLabel}
                </span>
              </td>
              <td className="px-4 py-3 text-[#334155]">
                {row.componentsTotal > 0 ? `${row.componentsPassed}/${row.componentsTotal}` : "Sin componentes"}
              </td>
              <td className="px-4 py-3 text-right font-semibold text-[#002b7f]">{formatPoints(row.totalPoints)}</td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/perfil/ranking/detalle?contestId=${encodeURIComponent(row.contestId)}&participantId=${encodeURIComponent(row.participantId)}`}
                  className="rounded-lg border border-[#c8d7f2] bg-white px-2.5 py-1 text-xs font-semibold text-[#1e3a8a] hover:bg-[#eef5ff]"
                >
                  Ver
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

