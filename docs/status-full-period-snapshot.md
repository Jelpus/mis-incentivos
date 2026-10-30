# Status: sustitución del período completo

Los Excel de Status contienen el período completo, según la regla confirmada el 30 de octubre de 2026. SVA y SVM conservan sus pasos de revisión independientes.

La vista previa y el RPC identifican cada registro por `period_month` + territorio. El número de empleado identifica al ocupante y puede cambiar de ruta en una recarga. No se usa para elegir el registro de destino.

Al aplicar cada carga:

- Se conservan los identificadores de las rutas existentes y los campos opcionales con conservación explícita, como `puesto` cuando no está mapeado.
- Se crean las rutas nuevas. Las ausentes quedan retiradas mediante `is_deleted`, con historial; no se borran físicamente.
- Se validan filas, territorios y empleados duplicados antes de sustituir el período. Un archivo vacío o una carga incompleta no puede retirar un período.
- Las actualizaciones, altas, bajas, vínculos y estado del lote se guardan en una sola transacción por carga. Los intercambios de empleados liberan las claves únicas dentro de esa transacción.
- El RPC recalcula los destinos bajo bloqueo. No confía en identificadores antiguos del preview.
- Se limpian los vínculos del ocupante anterior, se sincronizan relaciones con registros activos y no retirados, y se actualizan los vínculos SVA–SVM al aplicar managers.
- El mismo lote aplicado puede reintentarse sin repetir cambios. Los demás períodos se conservan.

## Publicación

Primero debe aplicarse `supabase/migrations/20261030165709_status_full_period_snapshot.sql` al proyecto verificado `jwjxwrxhzadowekuvmfm`; después se publica la aplicación. La aplicación no vuelve al RPC anterior si falta esta actualización: muestra un aviso al administrador.

La migración crea `apply_import_batch_status_snapshot(uuid, uuid)`, con `SECURITY INVOKER`, disponible únicamente para `service_role` y con validación del administrador actor. También actualiza la sincronización existente de relaciones para excluir Status retirados o inactivos. No aplica lotes ni modifica automáticamente el contenido de agosto.

Para probar la versión publicada, regenerar la vista previa del lote y revisar el conteo de rutas que se retirarán antes de aplicar. Después comprobar el contenido del período y los vínculos de las personas reasignadas. SVA y SVM se aplican en sus respectivos pasos, no como una transacción conjunta de ambas hojas.

## Verificación local

`npm run test:status-snapshot` verifica la vista previa y la paginación con más de 1.000 registros. `npm run test:status-snapshot-db` reproduce restricciones y triggers reales con datos sintéticos en PostgreSQL aislado.

El segundo comando exige un contenedor propio cuyo nombre comience con `mis-incentivos-status-test-` y con `--network none`. Usa por defecto `mis-incentivos-status-test-20261030`; puede indicarse otro mediante `STATUS_SNAPSHOT_TEST_CONTAINER`. Crea y elimina únicamente su base de pruebas temporal. El fixture contiene definiciones del catálogo, sin datos de producción.
