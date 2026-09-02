type RankingResultIdentity = {
  empleado?: unknown;
  representante?: unknown;
  manager?: unknown;
};

type RankingParticipantIdentity = {
  scope: "rep" | "manager";
  employeeNumber?: unknown;
  territory?: unknown;
};

function normalizeIdentityKey(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeEmployeeKey(value: unknown): string {
  const key = normalizeIdentityKey(value);
  return key === "0" ? "" : key;
}

/**
 * Relates ranking rows to people without assigning a territory's historical
 * results to its current occupant.
 */
export function matchesRankingParticipantIdentity(
  result: RankingResultIdentity,
  participant: RankingParticipantIdentity,
): boolean {
  if (participant.scope === "rep") {
    const participantEmployee = normalizeEmployeeKey(participant.employeeNumber);
    const resultEmployee = normalizeEmployeeKey(result.empleado);

    if (participantEmployee) {
      return Boolean(resultEmployee && resultEmployee === participantEmployee);
    }

    // A territory is only a safe fallback when neither side has a person ID.
    if (resultEmployee) return false;

    const territory = normalizeIdentityKey(participant.territory);
    return Boolean(territory && normalizeIdentityKey(result.representante) === territory);
  }

  const territory = normalizeIdentityKey(participant.territory);
  return Boolean(territory && normalizeIdentityKey(result.manager) === territory);
}
