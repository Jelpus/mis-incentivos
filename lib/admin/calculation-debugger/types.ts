export type CalculationDebuggerPeriodOption = {
  value: string;
  label: string;
};

export type CalculationDebuggerRepresentativeOption = {
  period: string;
  value: string;
  label: string;
  territory: string | null;
  representativeName: string | null;
  teamId: string | null;
};

export type CalculationDebuggerProductOption = {
  period: string;
  representativeValue: string;
  teamId: string;
  value: string;
  label: string;
};

export type CalculationDebuggerPageData = {
  periods: CalculationDebuggerPeriodOption[];
  representatives: CalculationDebuggerRepresentativeOption[];
  products: CalculationDebuggerProductOption[];
};

export type CalculationDebuggerTraceData = {
  input: {
    period: string;
    representativeName: string;
    product: string;
    metric: string | null;
    expectedValue: number;
    actualValue: number;
    difference: number;
    description: string;
  };
  representative: Record<string, unknown> | null;
  ruleVersion: Record<string, unknown> | null;
  ruleItems: Array<Record<string, unknown>>;
  ruleSources: Array<Record<string, unknown>>;
  sourceFiles: Array<Record<string, unknown>>;
  objectiveSource: Record<string, unknown> | null;
  payCurves: Array<Record<string, unknown>>;
  guarantees: Array<Record<string, unknown>>;
  objectives: Array<Record<string, unknown>>;
  calculationPreview: {
    summary: Record<string, unknown>;
    matchingAssignments: Array<Record<string, unknown>>;
    includedSourceRows: Array<Record<string, unknown>>;
    relatedAssignments: Array<Record<string, unknown>>;
    finalRows: Array<Record<string, unknown>>;
    groupingDetails: Array<Record<string, unknown>>;
  };
  overrides: {
    rows: Array<Record<string, unknown>>;
    message: string | null;
  };
  checks: Array<{
    step: string;
    status: "ok" | "warning" | "error";
    message: string;
    evidence?: Record<string, unknown>;
  }>;
};

export type CalculationDiagnosis = {
  diagnosisSummary: string;
  suspectedCause: string;
  recommendedFix: string;
  confidenceScore: number;
  difference: number;
  evidence: string[];
  traceData: CalculationDebuggerTraceData;
};
