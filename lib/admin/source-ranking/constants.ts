export type RankingRequiredFile = {
  fileCode: string;
  displayName: string;
  description: string;
};

export const RANKING_REQUIRED_FILES: RankingRequiredFile[] = [
  {
    fileCode: "kpi_local_ytd",
    displayName: "KPI Local YTD",
    description: "Base operativa KPI acumulada YTD para ranking.",
  },
  {
    fileCode: "icva_48hrs",
    displayName: "ICVA + 48 hrs",
    description: "Base ICVA con ventana de 48 horas para ranking.",
  },
];

