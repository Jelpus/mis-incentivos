# Data Sources -> BigQuery

Flujo implementado en `admin/data-sources` al subir un archivo por `archivo logico`:

1. Seleccionar archivo y sheet.
2. Convertir sheet a JSON.
3. Normalizar filas a la estructura estandar.
4. Upsert en BigQuery:
   - `DELETE` por combinacion `periodo + archivo`.
   - `INSERT` de filas normalizadas en `incentivos.filesNormalizados`.

## Variables de entorno requeridas

- `GCP_PROJECT_ID`
- `GCP_SERVICE_ACCOUNT_EMAIL`
- `GCP_SERVICE_ACCOUNT_PRIVATE_KEY` (con `\n`) o `GCP_SERVICE_ACCOUNT_PRIVATE_KEY_BASE64`
- `BQ_DATASET_ID` (opcional, default: `incentivos`)
- `BQ_TABLE_FILES_NORMALIZADOS` (opcional, default: `filesNormalizados`)

## Estructura usada para insert

Campos legacy:
- `archivo`
- `cedula`
- `medico`
- `cp`
- `estado`
- `brick`
- `molecula_producto`
- `valor`
- `trimestre`
- `trimestre_anterior`
- `semestre`
- `metric`
- `fuente`
- `periodo` (`YYYY-MM`)

Nuevo para historial mensual:
- `meses` (objeto `{ "YYYY-MM": number }`)

## Recomendacion de schema en BigQuery

Agregar la columna `meses` para no perder los meses extra:

```sql
ALTER TABLE `TU_PROYECTO.incentivos.filesNormalizados`
ADD COLUMN IF NOT EXISTS meses JSON;
```

