#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const entriesPath = resolve(repoRoot, "docs/platform-change-log.entries.json");
const changeLogGitPath = "docs/platform-change-log.entries.json";
const relevantPrefixes = ["app/", "components/", "lib/"];
const relevantFiles = new Set(["package.json", "package-lock.json", "next.config.ts", "proxy.ts"]);
const routeHints = [
  { prefix: "components/performance/", route: "/perfil/performance-report" },
  { prefix: "lib/performance/", route: "/perfil/performance-report" },
  { prefix: "components/ranking/", route: "/perfil/ranking" },
  { prefix: "lib/profile/ranking-data", route: "/perfil/ranking" },
  { prefix: "lib/ranking-contests/", route: "/perfil/ranking" },
  { prefix: "components/results/", route: "/perfil/resultados" },
  { prefix: "lib/resultados", route: "/perfil/resultados" },
  { prefix: "components/admin/platform", route: "/admin/platform" },
  { prefix: "lib/admin/platform/", route: "/admin/platform" },
  { prefix: "components/admin/source-ranking", route: "/admin/source-ranking" },
  { prefix: "lib/admin/source-ranking/", route: "/admin/source-ranking" },
  { prefix: "components/admin/calculation-debugger", route: "/admin/calculation-debugger" },
  { prefix: "lib/admin/calculation-debugger/", route: "/admin/calculation-debugger" },
  { prefix: "components/admin/calculo", route: "/admin/calculo" },
  { prefix: "lib/admin/calculo/", route: "/admin/calculo" },
  { prefix: "components/admin/period-settings", route: "/admin/period-settings" },
  { prefix: "lib/admin/period-settings/", route: "/admin/period-settings" },
  { prefix: "components/admin/ranking-", route: "/admin/reglas-ranking" },
  { prefix: "lib/admin/reglas-ranking/", route: "/admin/reglas-ranking" },
  { prefix: "app/mi-cuenta/", route: "/mi-cuenta" },
  { prefix: "lib/import-engine/", route: "/admin/status" },
];

function printUsage() {
  console.log(`
Usage:
  npm run changelog:add -- "/ruta" "antes" "despues"
  npm run changelog:add -- --route "/ruta" --current "antes" --modified "despues" [--date YYYY-MM-DD] [--commit SHA]
  npm run changelog:sync
  npm run changelog:sync:dry-run
  npm run changelog:backfill:git:dry-run
  npm run changelog:backfill:git
  npm run changelog:pre-push

Environment:
  NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be available for sync.
`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      args._.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function slugify(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56) || "change";
}

function hashShort(value) {
  return createHash("sha1").update(value).digest("hex").slice(0, 10);
}

function runGit(args) {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

function currentCommitRef() {
  return runGit(["rev-parse", "--short=12", "HEAD"]) || null;
}

function gitLogCommits({ max = 30, since = "" } = {}) {
  const args = ["log", `--max-count=${max}`, "--format=%H"];
  if (since) args.splice(1, 0, `--since=${since}`);
  const output = runGit(args);
  return output.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function commitInfo(commit) {
  const output = runGit(["show", "-s", "--format=%H%x00%h%x00%ad%x00%s", "--date=short", commit]);
  const [fullSha, shortSha, date, subject] = output.split("\u0000");
  return {
    fullSha: normalizeText(fullSha),
    shortSha: normalizeText(shortSha),
    date: normalizeText(date),
    subject: normalizeText(subject),
  };
}

function loadEnvFile(fileName) {
  const filePath = resolve(repoRoot, fileName);
  if (!existsSync(filePath)) return;

  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const withoutExport = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const equalsIndex = withoutExport.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = withoutExport.slice(0, equalsIndex).trim();
    let value = withoutExport.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function loadEnv() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");
}

function readEntries() {
  if (!existsSync(entriesPath)) return [];
  const raw = readFileSync(entriesPath, "utf8").trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("docs/platform-change-log.entries.json debe contener un arreglo JSON.");
  }
  return parsed;
}

function writeEntries(entries) {
  mkdirSync(dirname(entriesPath), { recursive: true });
  writeFileSync(entriesPath, `${JSON.stringify(entries, null, 2)}\n`);
}

function normalizeEntry(entry, defaultCommitRef) {
  const sourceKey = normalizeText(entry.sourceKey ?? entry.source_key);
  const date = normalizeText(entry.date ?? entry.change_date);
  const route = normalizeText(entry.route);
  const currentState = normalizeText(entry.currentState ?? entry.current_state);
  const modifiedState = normalizeText(entry.modifiedState ?? entry.modified_state);
  const commitRef = normalizeText(entry.commitRef ?? entry.commit_ref) || defaultCommitRef;

  if (!sourceKey || !date || !route || !currentState || !modifiedState) {
    throw new Error(`Entrada invalida en ${changeLogGitPath}: sourceKey, date, route, currentState y modifiedState son requeridos.`);
  }

  return {
    source_key: sourceKey,
    change_date: date,
    route,
    current_state: currentState,
    modified_state: modifiedState,
    commit_ref: commitRef,
  };
}

async function syncEntries({ dryRun = false } = {}) {
  const entries = readEntries();
  const commitRef = currentCommitRef();
  const payload = entries.map((entry) => normalizeEntry(entry, commitRef));

  if (payload.length === 0) {
    console.log("No hay entradas de registro de cambios para sincronizar.");
    return;
  }

  if (dryRun) {
    console.log(`Dry-run: ${payload.length} entrada(s) listas para sincronizar.`);
    for (const row of payload) {
      console.log(`- ${row.change_date} ${row.route} ${row.commit_ref ?? "-"}`);
    }
    return;
  }

  loadEnv();
  const supabaseUrl = normalizeText(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
  const serviceRoleKey = normalizeText(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVIE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para sincronizar platform_change_log.");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/platform_change_log?on_conflict=source_key`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`No se pudo sincronizar platform_change_log (${response.status}): ${body}`);
  }

  console.log(`Registro de cambios sincronizado: ${payload.length} entrada(s).`);
}

function addEntry(args) {
  const date = normalizeText(args.date) || today();
  const route = normalizeText(args.route ?? args._[0]);
  const currentState = normalizeText(args.current ?? args._[1]);
  const modifiedState = normalizeText(args.modified ?? args._[2]);
  const commitRef = normalizeText(args.commit) || undefined;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("La fecha debe tener formato YYYY-MM-DD.");
  }
  if (!route || !currentState || !modifiedState) {
    throw new Error("route, current y modified son requeridos.");
  }

  const entries = readEntries();
  const sourceKey = normalizeText(args.sourceKey ?? args["source-key"]) ||
    `${date}-${slugify(route)}-${hashShort(`${date}|${route}|${currentState}|${modifiedState}`)}`;

  if (entries.some((entry) => normalizeText(entry.sourceKey ?? entry.source_key) === sourceKey)) {
    throw new Error(`Ya existe sourceKey ${sourceKey}.`);
  }

  entries.push({
    sourceKey,
    date,
    route,
    currentState,
    modifiedState,
    ...(commitRef ? { commitRef } : {}),
  });

  writeEntries(entries);
  console.log(`Entrada agregada a ${changeLogGitPath}: ${sourceKey}`);
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
  });
}

function isZeroSha(value) {
  return /^0+$/.test(normalizeText(value));
}

function commitsForPushLine(line) {
  const [localRef, localSha, , remoteSha] = line.trim().split(/\s+/);
  void localRef;
  if (!localSha || isZeroSha(localSha)) return [];

  const revListArgs = remoteSha && !isZeroSha(remoteSha)
    ? ["rev-list", "--reverse", `${remoteSha}..${localSha}`]
    : ["rev-list", "--reverse", localSha, "--not", "--remotes"];
  const output = runGit(revListArgs);
  if (output) return output.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  return [localSha];
}

function changedFilesForCommit(commit) {
  const output = runGit(["show", "--name-only", "--format=", "--diff-filter=ACMRT", commit]);
  return output.split(/\r?\n/).map((item) => item.trim().replace(/\\/g, "/")).filter(Boolean);
}

function routeFromAppPath(filePath) {
  if (!filePath.startsWith("app/")) return null;
  const parts = filePath.split("/");
  if (parts.length < 3) return null;

  const stopNames = new Set([
    "page.tsx",
    "layout.tsx",
    "route.ts",
    "actions.ts",
    "loading.tsx",
    "error.tsx",
    "not-found.tsx",
  ]);
  const routeParts = [];
  for (const part of parts.slice(1)) {
    if (stopNames.has(part)) break;
    if (part.startsWith("(") && part.endsWith(")")) continue;
    routeParts.push(part);
  }

  return routeParts.length > 0 ? `/${routeParts.join("/")}` : null;
}

function routeFromPath(filePath) {
  const appRoute = routeFromAppPath(filePath);
  if (appRoute) return appRoute;

  const hint = routeHints.find((item) => filePath.startsWith(item.prefix));
  if (hint) return hint.route;

  if (filePath.startsWith("app/api/")) {
    return routeFromAppPath(filePath);
  }

  return null;
}

function groupFilesByRoute(files) {
  const grouped = new Map();
  for (const filePath of files) {
    const route = routeFromPath(filePath);
    if (!route) continue;
    const current = grouped.get(route) ?? [];
    current.push(filePath);
    grouped.set(route, current);
  }
  return grouped;
}

function buildGitBackfillEntries({ commits, existingEntries }) {
  const existingKeys = new Set(existingEntries.map((entry) => normalizeText(entry.sourceKey ?? entry.source_key)));
  const output = [];

  for (const commit of commits) {
    const info = commitInfo(commit);
    if (!info.shortSha || !info.date) continue;

    const files = changedFilesForCommit(commit);
    const grouped = groupFilesByRoute(files);
    for (const [route, routeFiles] of grouped.entries()) {
      const sourceKey = `git-${info.shortSha}-${slugify(route)}`;
      if (existingKeys.has(sourceKey)) continue;

      output.push({
        sourceKey,
        date: info.date,
        route,
        currentState: `Cambio historico inferido desde Git antes del commit ${info.shortSha}. El estado previo exacto debe validarse si se requiere auditoria fina.`,
        modifiedState: `${info.subject || "Cambio registrado en Git"}. Archivos principales: ${routeFiles.slice(0, 5).join(", ")}.`,
        commitRef: info.shortSha,
      });
      existingKeys.add(sourceKey);
    }
  }

  return output;
}

function backfillFromGit(args) {
  const max = Number(args.max ?? 30);
  const safeMax = Number.isFinite(max) && max > 0 ? Math.min(Math.floor(max), 250) : 30;
  const since = normalizeText(args.since);
  const dryRun = Boolean(args["dry-run"]);
  const entries = readEntries();
  const commits = gitLogCommits({ max: safeMax, since });
  const generatedEntries = buildGitBackfillEntries({ commits, existingEntries: entries });

  if (generatedEntries.length === 0) {
    console.log("No se encontraron entradas nuevas inferidas desde Git.");
    return;
  }

  if (dryRun) {
    console.log(`Dry-run Git backfill: ${generatedEntries.length} entrada(s) nuevas.`);
    for (const entry of generatedEntries) {
      console.log(`- ${entry.date} ${entry.route} ${entry.commitRef}: ${entry.modifiedState}`);
    }
    return;
  }

  writeEntries([...entries, ...generatedEntries]);
  console.log(`Git backfill agregado a ${changeLogGitPath}: ${generatedEntries.length} entrada(s).`);
}

async function analyzePrePush() {
  const stdin = await readStdin();
  const lines = stdin.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return { changedFiles: [], hasPushContext: false };
  }

  const commits = Array.from(new Set(lines.flatMap(commitsForPushLine)));
  const changedFiles = Array.from(new Set(commits.flatMap(changedFilesForCommit)));
  return { changedFiles, hasPushContext: true };
}

function isRelevantCodePath(filePath) {
  return relevantPrefixes.some((prefix) => filePath.startsWith(prefix)) || relevantFiles.has(filePath);
}

async function syncFromPrePush({ dryRun = false } = {}) {
  const { changedFiles, hasPushContext } = await analyzePrePush();
  if (!hasPushContext) {
    console.log("No hay contexto de pre-push. Usa npm run changelog:sync para sincronizar manualmente.");
    return;
  }

  const hasChangeLogChange = changedFiles.includes(changeLogGitPath);
  const hasRelevantCodeChange = changedFiles.some(isRelevantCodePath);

  if (hasRelevantCodeChange && !hasChangeLogChange) {
    console.warn("Aviso: hay cambios de aplicacion sin entrada nueva en docs/platform-change-log.entries.json.");
    console.warn("El push continuara. Para trazabilidad completa, agrega una entrada o pide a Codex que prepare el push.");
    return;
  }

  if (!hasChangeLogChange) {
    console.log("No hubo cambios en platform-change-log.entries.json para este push. Se omite sincronizacion.");
    return;
  }

  await syncEntries({ dryRun });
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (!command || command === "help" || args.help) {
    printUsage();
    return;
  }

  if (command === "add") {
    addEntry(args);
    return;
  }

  if (command === "sync") {
    if (args["pre-push"]) {
      await syncFromPrePush({ dryRun: Boolean(args["dry-run"]) });
      return;
    }
    await syncEntries({ dryRun: Boolean(args["dry-run"]) });
    return;
  }

  if (command === "backfill-git") {
    backfillFromGit(args);
    return;
  }

  throw new Error(`Comando no soportado: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
