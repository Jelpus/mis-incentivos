export type PayCurvePoint = {
  cobertura: number;
  pago: number;
};

export type PayCurveCatalogItem = {
  id: string;
  nombre: string;
  descripcion: string;
  isActive: boolean;
  isHidden: boolean;
  updatedAt: string;
  points: PayCurvePoint[];
};

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function buildBaseCurvePoints(): PayCurvePoint[] {
  const points: PayCurvePoint[] = [];

  for (let coverage = 0; coverage <= 1.8 + 1e-9; coverage += 0.01) {
    const normalizedCoverage = round(coverage, 2);
    const paymentFactor =
      normalizedCoverage <= 1
        ? normalizedCoverage
        : normalizedCoverage <= 1.1
          ? 1 + (normalizedCoverage - 1) * 5
          : 1.5;

    points.push({
      cobertura: normalizedCoverage,
      pago: round(paymentFactor, 4),
    });
  }

  return points;
}

const BASE_CURVE_POINTS = buildBaseCurvePoints();

const PAY_CURVE_CATALOG: PayCurveCatalogItem[] = [
  {
    id: "curva_base_cobertura",
    nombre: "Curva Base Cobertura",
    descripcion:
      "Curva estandar para cobertura mensual. Lineal hasta 1.00, aceleracion controlada hasta 1.10 y tope en 1.50.",
    isActive: true,
    isHidden: false,
    updatedAt: "2026-03-17T00:00:00.000Z",
    points: BASE_CURVE_POINTS,
  },
];

export function listPayCurves(): PayCurveCatalogItem[] {
  return PAY_CURVE_CATALOG;
}

export function findPayCurveById(curveId: string): PayCurveCatalogItem | null {
  return PAY_CURVE_CATALOG.find((curve) => curve.id === curveId) ?? null;
}

export function getBaseCurveTemplatePoints(): PayCurvePoint[] {
  return BASE_CURVE_POINTS.map((point) => ({ ...point }));
}
