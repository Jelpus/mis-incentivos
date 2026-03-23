# Team Incentive Rules Reference

Fuente usada como base inicial:
- `C:\Users\Integradora Jelpus\Downloads\Reglas_Team_ID.xlsx`
- Sheets: `NOV25ORIGINAL`, `SEP25`

Resumen observado:
- `NOV25ORIGINAL`: 166 filas, 22 columnas, 38 team_id unicos.
- `SEP25`: 156 filas, 24 columnas, 34 team_id unicos.

Campos principales identificados:
- `team_id`
- `plan_type_name`
- `product_name`
- `ranking` (en SEP25)
- `candado`
- `cobertura_candado`
- `distribucion no asignada`
- `prod_weight`
- `puntos_ranking_LVU` (en SEP25)
- `agrupador`
- `curva_pago`
- `elemento`
- `file1`, `fuente1`, `molecula_producto1`, `metric1`
- `file2`, `fuente2`, `molecula_producto2`, `metric2`
- `file3`, `fuente3`, `molecula_producto3`, `metric3`

Catalogo inicial de valores categoricos:
- `plan_type_name`: `MARKET SHARE`, `SALES VS. TARGET PLAN`
- `agrupador`: `MS`, `GOVERNMENT`, `PRIVATE`
- `curva_pago`: `Publico`, `OG`, `Launch`, `Privado`
- `elemento`: `MS`, `INTERNAL SALES`, `DDD`, `B2B`
- `fuente`: `DESPLAZAMIENTO`, `ORDENES`, `DF`, `DDD`, `B2B`
- `metric`: `UNIDADES`, `UNITS`
- `candado`: `BONSPRI_GOV`

Este catalogo ya se refleja en:
- `lib/admin/incentive-rules/rule-catalog.ts`
- vista detalle `/admin/incentive-rules/[teamId]`
