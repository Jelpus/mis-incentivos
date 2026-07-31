# Data Sources -> BigQuery

Flujo implementado en `admin/data-sources` al subir un archivo por `archivo logico`:

1. Seleccionar archivo y sheet.
2. Convertir sheet a JSON.
3. Normalizar filas a la estructura estandar.
4. Reemplazo atomico en BigQuery:
   - Crear una tabla temporal con el mismo schema de `incentivos.filesNormalizados`.
   - Cargar las filas normalizadas mediante un load job batch.
   - En una transaccion, ejecutar el `DELETE` por `periodo + archivo` y copiar las
     filas nuevas desde la tabla temporal.
   - Eliminar la tabla temporal. Ademas, expira automaticamente en un dia como
     proteccion si el proceso se interrumpe antes del cleanup.

El flujo no usa `tabledata.insertAll` para estas cargas. Esto evita dejar las filas
en el streaming buffer de BigQuery, que impide ejecutar un `DELETE` durante un
periodo variable. Los datos anteriores permanecen intactos hasta que la carga batch
de la nueva version haya terminado correctamente.

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
- `meses` (JSON `{ "YYYY-MM": number }`, recomendado)
- `month01` ... `month12` (`FLOAT64`, opcional)

Nota de carga: la normalizacion interna produce `meses` serializado, pero antes del
load job la app lo convierte de nuevo a un objeto JSON para guardarlo en el campo
`JSON` de BigQuery.

Convencion de columnas calendario:
- `month01` = enero del anio del periodo de carga.
- `month02` = febrero del anio del periodo de carga.
- `month03` = marzo del anio del periodo de carga.
- Asi sucesivamente hasta `month12` = diciembre del anio del periodo de carga.

Si el archivo trae headers absolutos (`2026-04`, `abr-2026`, etc.), tambien se guardan en `meses`. Si trae `month01`, `month02`, etc., se interpretan usando el anio del `periodo` cargado.

## Recomendacion de schema en BigQuery

Agregar `meses` para no perder los meses extra:

```sql
ALTER TABLE `TU_PROYECTO.incentivos.filesNormalizados`
ADD COLUMN IF NOT EXISTS meses JSON;
```

Opcionalmente, si tambien quieres consultar meses como columnas planas:

```sql
ALTER TABLE `TU_PROYECTO.incentivos.filesNormalizados`
ADD COLUMN IF NOT EXISTS month01 FLOAT64;
ALTER TABLE `TU_PROYECTO.incentivos.filesNormalizados`
ADD COLUMN IF NOT EXISTS month02 FLOAT64;
ALTER TABLE `TU_PROYECTO.incentivos.filesNormalizados`
ADD COLUMN IF NOT EXISTS month03 FLOAT64;
ALTER TABLE `TU_PROYECTO.incentivos.filesNormalizados`
ADD COLUMN IF NOT EXISTS month04 FLOAT64;
ALTER TABLE `TU_PROYECTO.incentivos.filesNormalizados`
ADD COLUMN IF NOT EXISTS month05 FLOAT64;
ALTER TABLE `TU_PROYECTO.incentivos.filesNormalizados`
ADD COLUMN IF NOT EXISTS month06 FLOAT64;
ALTER TABLE `TU_PROYECTO.incentivos.filesNormalizados`
ADD COLUMN IF NOT EXISTS month07 FLOAT64;
ALTER TABLE `TU_PROYECTO.incentivos.filesNormalizados`
ADD COLUMN IF NOT EXISTS month08 FLOAT64;
ALTER TABLE `TU_PROYECTO.incentivos.filesNormalizados`
ADD COLUMN IF NOT EXISTS month09 FLOAT64;
ALTER TABLE `TU_PROYECTO.incentivos.filesNormalizados`
ADD COLUMN IF NOT EXISTS month10 FLOAT64;
ALTER TABLE `TU_PROYECTO.incentivos.filesNormalizados`
ADD COLUMN IF NOT EXISTS month11 FLOAT64;
ALTER TABLE `TU_PROYECTO.incentivos.filesNormalizados`
ADD COLUMN IF NOT EXISTS month12 FLOAT64;
```
