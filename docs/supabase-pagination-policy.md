# Política de paginación de Supabase

## Regla general

Toda consulta que espera recuperar una colección completa debe paginar. El límite de respuesta configurado por Supabase (actualmente 1,000 filas) nunca debe interpretarse como el total de registros.

Las únicas excepciones son consultas explícitamente acotadas por la necesidad funcional:

- `single()` o `maybeSingle()`;
- conteos con `{ count: "exact", head: true }`;
- límites deliberados y visibles, por ejemplo los 10 registros más recientes;
- búsquedas cuya respuesta contractual sea una sola fila.

`limit(1000)` no es una forma válida de solicitar todos los registros.

## Implementación

Usar `fetchAllSupabaseRows` de `lib/supabase/paginated-query.ts`. Cada página debe tener un orden determinista y terminar en una columna única, normalmente `id`, para evitar duplicados u omisiones si varias filas comparten el primer criterio de orden.

```ts
const rows = await fetchAllSupabaseRows<Row>({
  context: "No se pudieron leer los registros",
  pageQuery: async (from, to) => {
    const result = await supabase
      .from("table_name")
      .select("id, value")
      .eq("period_month", periodMonth)
      .order("id", { ascending: true })
      .range(from, to);

    return { data: (result.data ?? []) as Row[], error: result.error };
  },
});
```

El conteo previo es opcional. Sin conteo, el helper solicita páginas hasta recibir una página incompleta; si la última contiene exactamente 1,000 filas, realiza una última petición vacía para confirmar el final.

## Validación

- Probar el helper con conjuntos mayores a 1,000 filas y con múltiplos exactos de 1,000.
- Comprobar que los errores de Supabase conserven su `code` para que continúen funcionando los fallbacks por tablas o columnas opcionales.
- En revisiones de código, buscar nuevos `select` de colecciones sin `range` ni el helper común.

## Rutas migradas inicialmente

- carga de objetivos del cálculo y su diagnóstico;
- referencia de KPI Local YTD usada al normalizar ICVA;
- previsualización y procesamiento de filas importadas;
- fuerza de ventas usada durante la previsualización de importaciones;
- destinatarios de correos de publicación;
- lecturas globales del ranking del perfil.
