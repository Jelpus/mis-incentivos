-- BigQuery: tabla de ajustes y vista consolidada por etapa
-- Ajusta `novartismdm.incentivos` si tu proyecto/dataset es otro.

CREATE TABLE IF NOT EXISTS `novartismdm.incentivos.resultados_v2_ajustes` (
  adjustment_id STRING NOT NULL,
  periodo STRING NOT NULL,
  ruta STRING NOT NULL,
  product_name STRING NOT NULL,
  stage STRING NOT NULL,
  kind STRING NOT NULL,
  delta_pagoresultado FLOAT64 NOT NULL,
  comment STRING,
  is_active BOOL NOT NULL,
  created_at TIMESTAMP NOT NULL,
  created_by STRING,
  updated_at TIMESTAMP NOT NULL,
  updated_by STRING
);

CREATE OR REPLACE VIEW `novartismdm.incentivos.resultados_v2_con_ajustes` AS
WITH base AS (
  SELECT
    team_id,
    plan_type_name,
    product_name,
    prod_weight,
    agrupador,
    garantia,
    elemento,
    ruta,
    representante,
    actual,
    resultado,
    objetivo,
    cobertura,
    pagovariable,
    coberturapago,
    nombre,
    linea,
    manager,
    empleado,
    pagoresultado,
    periodo
  FROM `novartismdm.incentivos.resultados_v2`
),
stage_options AS (
  SELECT DISTINCT stage
  FROM `novartismdm.incentivos.resultados_v2_ajustes`
  WHERE is_active = TRUE
  UNION ALL
  SELECT 'precalculo'
),
stages AS (
  SELECT DISTINCT stage FROM stage_options
),
active_adjustments AS (
  SELECT
    periodo,
    ruta,
    product_name,
    stage,
    SUM(IFNULL(delta_pagoresultado, 0)) AS delta_pagoresultado,
    STRING_AGG(COALESCE(comment, ''), ' | ' ORDER BY updated_at DESC) AS adjustment_comment
  FROM `novartismdm.incentivos.resultados_v2_ajustes`
  WHERE is_active = TRUE
  GROUP BY periodo, ruta, product_name, stage
)
SELECT
  b.team_id,
  b.plan_type_name,
  b.product_name,
  b.prod_weight,
  b.agrupador,
  b.garantia,
  b.elemento,
  b.ruta,
  b.representante,
  b.actual,
  b.resultado,
  b.objetivo,
  b.cobertura,
  b.pagovariable,
  b.coberturapago,
  b.nombre,
  b.linea,
  b.manager,
  b.empleado,
  IFNULL(b.pagoresultado, 0) + IFNULL(a.delta_pagoresultado, 0) AS pagoresultado,
  b.periodo,
  s.stage AS stage,
  IFNULL(a.delta_pagoresultado, 0) AS adjustment_delta,
  a.adjustment_comment AS comment
FROM base b
CROSS JOIN stages s
LEFT JOIN active_adjustments a
  ON a.periodo = b.periodo
  AND a.ruta = b.ruta
  AND a.product_name = b.product_name
  AND a.stage = s.stage;
