import assert from "node:assert/strict";
import test from "node:test";

import { fetchAllSupabaseRows } from "../lib/supabase/paginated-query.ts";

test("recupera todas las filas cuando la fuente supera el limite de 1000", async () => {
  const sourceRows = Array.from({ length: 1_058 }, (_, index) => ({ id: index + 1 }));
  const requestedRanges = [];

  const rows = await fetchAllSupabaseRows({
    context: "objetivos de prueba",
    countQuery: async () => ({ count: sourceRows.length, error: null }),
    pageQuery: async (from, to) => {
      requestedRanges.push([from, to]);
      return { data: sourceRows.slice(from, to + 1), error: null };
    },
  });

  assert.equal(rows.length, 1_058);
  assert.deepEqual(rows[0], { id: 1 });
  assert.deepEqual(rows.at(-1), { id: 1_058 });
  assert.deepEqual(requestedRanges, [[0, 999], [1_000, 1_057]]);
});

test("conserva el codigo de Supabase al fallar una pagina", async () => {
  await assert.rejects(
    fetchAllSupabaseRows({
      context: "objetivos de prueba",
      countQuery: async () => ({ count: 1_058, error: null }),
      pageQuery: async () => ({
        data: null,
        error: { code: "42P01", message: "relation does not exist" },
      }),
    }),
    (error) => {
      assert.equal(error.code, "42P01");
      assert.match(error.message, /objetivos de prueba/);
      return true;
    },
  );
});

test("pagina hasta recibir una pagina incompleta cuando no se solicita conteo", async () => {
  const sourceRows = Array.from({ length: 2_000 }, (_, index) => ({ id: index + 1 }));
  const requestedRanges = [];

  const rows = await fetchAllSupabaseRows({
    context: "coleccion sin conteo",
    pageQuery: async (from, to) => {
      requestedRanges.push([from, to]);
      return { data: sourceRows.slice(from, to + 1), error: null };
    },
  });

  assert.equal(rows.length, 2_000);
  assert.deepEqual(requestedRanges, [
    [0, 999],
    [1_000, 1_999],
    [2_000, 2_999],
  ]);
});

test("rechaza tamanos de pagina invalidos", async () => {
  await assert.rejects(
    fetchAllSupabaseRows({
      context: "coleccion invalida",
      pageSize: 0,
      pageQuery: async () => ({ data: [], error: null }),
    }),
    /pageSize debe ser un entero entre 1 y 1000/,
  );

  await assert.rejects(
    fetchAllSupabaseRows({
      context: "coleccion invalida",
      pageSize: 1_001,
      pageQuery: async () => ({ data: [], error: null }),
    }),
    /pageSize debe ser un entero entre 1 y 1000/,
  );
});
