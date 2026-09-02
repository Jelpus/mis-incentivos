import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeProductColumnDiscrepancies,
  normalizeProductIdentity,
} from "../lib/admin/data-sources/product-column-discrepancies.ts";

test("normaliza sufijos operativos sin confundir la identidad del producto", () => {
  assert.equal(normalizeProductIdentity("BONSPRI_PRIVATE"), "BONSPRI");
  assert.equal(normalizeProductIdentity("Scemblix_PRIV&GOB"), "SCEMBLIX");
  assert.equal(normalizeProductIdentity("TRILEPTAL"), "TRILEPTAL");
});

test("no alerta cuando Producto y Product name representan el mismo producto", () => {
  const result = analyzeProductColumnDiscrepancies([
    { Producto: "Bonspri", "Product name": "BONSPRI_PRIVATE", ruta: "RUTA01" },
  ]);

  assert.deepEqual(result, { count: 0, examples: [] });
});

test("alerta sin bloquear y conserva fila, ruta y valores discrepantes", () => {
  const result = analyzeProductColumnDiscrepancies([
    { Producto: "Bonspri", "Product name": "BONSPRI_PRIVATE", ruta: "RUTA01" },
    { Producto: "Bonspri", "Product name": "TRILEPTAL_PRIVATE", ruta: "RUTA02" },
  ]);

  assert.deepEqual(result, {
    count: 1,
    examples: [
      {
        rowNumber: 3,
        route: "RUTA02",
        producto: "Bonspri",
        productName: "TRILEPTAL_PRIVATE",
      },
    ],
  });
});

test("omite el contraste si el archivo no contiene ambas columnas", () => {
  const result = analyzeProductColumnDiscrepancies([
    { Producto: "Bonspri", ruta: "RUTA01" },
    { product_name: "TRILEPTAL_PRIVATE", ruta: "RUTA02" },
  ]);

  assert.deepEqual(result, { count: 0, examples: [] });
});
