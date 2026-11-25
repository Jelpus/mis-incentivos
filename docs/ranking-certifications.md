# Oficial Certificaciones

El bloque de `/admin/source-ranking` tiene un selector de año independiente de las fuentes mensuales. Cada carga `.xlsx` crea una versión completa e inmutable del año. El ranking utiliza la última versión de ese año; una nueva carga no elimina las anteriores ni sus archivos originales.

- **Certificación anual:** columna `% Acreditación`.
- **Conocimiento científico:** columna `Conocimiento científico`.
- Se interpreta `0.80` como `80 %`, `1` como `100 %` y `80%` como `80 %`. `N/A` y celdas vacías son notas pendientes. Cero es una nota válida.
- Se usa la hoja `Oficial`, si existe, y se detectan los encabezados en las primeras 30 filas.
- Se conserva la fila, empleado, territorio y nombre originales. `Sales Rep` identifica a la persona certificada; `NAME` puede describir al nuevo titular de la ruta. Los nombres nunca se usan para vincular.
- Se vincula por `NO.EMPLEADO` con el último Status activo del mismo año. Si falta el empleado, se usa `TERRITORIO`. Si el empleado proporcionado no existe, no se asigna automáticamente la nota a otra persona que ocupe esa ruta.
- Empleados/territorios duplicados y desacuerdos entre las dos claves se conservan como incidencias pendientes. El administrador puede corregir el Excel y cargar una nueva versión. No se utiliza `Filtro recategorización` para excluir filas: no forma parte de los dos criterios solicitados.

## Evaluación

El año se toma del periodo configurado del criterio (o del concurso). La nota anual se utiliza una sola vez, sin sumar meses ni aplicar las exclusiones de visitas por garantía. Se compara con el umbral configurado antes de redondear para pantalla. Para componentes de promedio del equipo, se promedian las notas individuales del equipo activo al corte; si falta alguna vinculación o nota, el criterio queda pendiente. Ninguna ausencia se convierte en aprobado automático.

La última versión anual se comparte dentro de cada petición de ranking para que todos los participantes y ambos criterios lean el mismo conjunto de notas. Una nueva petición ve las nuevas versiones.

## Instalación y pruebas

Aplicar `supabase/migrations/20261125151936_ranking_annual_certifications.sql` en el destino de despliegue. Esta migración crea dos tablas privadas con RLS y una RPC transaccional disponible únicamente para el cliente servidor con `service_role`; la RPC verifica al administrador activo y conserva el histórico. Los originales se almacenan en el bucket privado de Source Ranking.

```sh
npm run test:ranking-certifications
npm run test:ranking-certifications-db
```

La primera prueba incluye consultas paginadas con más de 1000 registros. La segunda crea y elimina su propio contenedor PostgreSQL aislado de la red, sin leer `.env` ni acceder a producción.
