# Platform change log workflow

## Flujo recomendado

Cuando el cambio lo prepare Codex, pedir:

```text
haz push
```

Codex debe:

1. Revisar `git status` y `git diff`.
2. Identificar rutas funcionales afectadas.
3. Crear o ajustar entradas en `docs/platform-change-log.entries.json`.
4. Ejecutar `npm run changelog:sync:dry-run`.
5. Ejecutar validaciones relevantes.
6. Hacer commit y `git push`.

El hook `pre-push` sincroniza el registro si el archivo de entradas viaja en el push.
Si hay cambios de aplicacion sin entrada nueva, solo emite aviso y permite continuar.

## Uso manual opcional

Agregar entrada:

```bash
npm run changelog:add -- "/ruta" "estado anterior" "estado nuevo"
```

Revisar lo que se sincronizaria:

```bash
npm run changelog:sync:dry-run
```

Sincronizar manualmente:

```bash
npm run changelog:sync
```

Inferir historia desde Git para revision:

```bash
npm run changelog:backfill:git:dry-run
```

Generar esas entradas inferidas en el archivo versionado:

```bash
npm run changelog:backfill:git
```
