import assert from "node:assert/strict";

import { matchesRankingParticipantIdentity } from "../lib/ranking-contests/participantIdentity.ts";

const leticia = {
  scope: "rep",
  employeeNumber: 32100607,
  territory: "MXPCRM0204R1",
};

assert.equal(
  matchesRankingParticipantIdentity(
    {
      empleado: 32100607,
      representante: "MXPCRM2102M2",
    },
    leticia,
  ),
  true,
  "Los resultados propios deben seguir al representante aunque cambie de territorio",
);

assert.equal(
  matchesRankingParticipantIdentity(
    {
      empleado: 32098815,
      representante: "MXPCRM0204R1",
    },
    leticia,
  ),
  false,
  "La ruta actual no debe transferir resultados del ocupante anterior",
);

assert.equal(
  matchesRankingParticipantIdentity(
    {
      empleado: null,
      representante: "MXPCRM0204R1",
    },
    leticia,
  ),
  false,
  "No se debe ignorar un numero de empleado disponible para empatar solo por territorio",
);

assert.equal(
  matchesRankingParticipantIdentity(
    {
      empleado: null,
      representante: "MXVACANTE001",
    },
    {
      scope: "rep",
      employeeNumber: null,
      territory: "mxvacante001",
    },
  ),
  true,
  "El territorio sigue disponible como respaldo cuando ambos lados carecen de empleado",
);

assert.equal(
  matchesRankingParticipantIdentity(
    {
      empleado: 12345,
      representante: "MXVACANTE001",
    },
    {
      scope: "rep",
      employeeNumber: null,
      territory: "MXVACANTE001",
    },
  ),
  false,
  "Una fila identificada con otra persona no debe asignarse por territorio",
);

assert.equal(
  matchesRankingParticipantIdentity(
    {
      manager: "MXMANAGER001",
    },
    {
      scope: "manager",
      territory: "mxmanager001",
    },
  ),
  true,
  "El ranking de managers conserva su relacion por territorio manager",
);

console.log("Ranking participant identity regression tests passed.");
