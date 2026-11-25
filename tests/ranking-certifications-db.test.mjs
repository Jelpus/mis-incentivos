import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";

// This suite creates its own network-isolated PostgreSQL. It never reads .env
// or connects to the remote project.
const container = `mis-incentivos-certifications-test-${Date.now()}-${process.pid}`;
const actor = "00000000-0000-0000-0000-000000000001";
const unauthorized = "00000000-0000-0000-0000-000000000002";
let started = false;
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${q(JSON.stringify(value))}::jsonb`;
const sql = (query) => execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"], { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const row = (overrides = {}) => ({ source_row: 2, source_employee: 1, source_territory: "MX01", source_name: "Prueba", matched_employee: 1, matched_territory: "MX01", matched_name: "Prueba", matched_by: "employee", match_issue: null, scientific_knowledge_pct: 95, annual_certification_pct: 80, ...overrides });
function save({ year = 2026, path = `certifications/2026/${actor}/${randomUUID()}.xlsx`, rows = [row()], user = actor, asRole = "service_role" } = {}) {
  return JSON.parse(sql(`set role ${asRole}; select public.save_ranking_certification_version(${year}, 'oficial.xlsx', 'source-ranking-files', ${q(path)}, ${q("a".repeat(64))}, ${q(`${year}-09-01`)}::date, ${json({ sourceRows: rows.length })}, ${json(rows)}, ${q(user)}::uuid);`));
}

before(() => {
  execFileSync("docker", ["run", "--rm", "--network", "none", "--name", container, "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "-d", "postgres:17-alpine"], { stdio: "pipe" });
  started = true;
  assert.equal(execFileSync("docker", ["inspect", "--format", "{{.HostConfig.NetworkMode}}", container], { encoding: "utf8" }).trim(), "none");
  execFileSync("docker", ["exec", container, "sh", "-c", "for i in $(seq 1 40); do pg_isready -U postgres >/dev/null 2>&1 && exit 0; sleep 0.25; done; exit 1"], { stdio: "pipe" });
  sql(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.profiles(user_id uuid primary key, is_active boolean not null default true, global_role text not null);
    grant usage on schema public to service_role; grant select on public.profiles to service_role;
    insert into profiles values (${q(actor)},true,'admin'),(${q(unauthorized)},true,'rep');`);
  sql(readFileSync(new URL("../supabase/migrations/20261125151936_ranking_annual_certifications.sql", import.meta.url), "utf8"));
});
after(() => {
  if (started) {
    assert.match(container, /^mis-incentivos-certifications-test-/);
    execFileSync("docker", ["rm", "-f", container], { stdio: "pipe" });
  }
});

test("guarda versiones anuales completas y conserva el histórico", () => {
  const first = save();
  const second = save({ rows: [row({ annual_certification_pct: 90 })] });
  assert.equal(first.version_no, 1); assert.equal(second.version_no, 2);
  assert.equal(sql("select count(*) from ranking_certification_rows;"), "2");
  assert.equal(sql(`select annual_certification_pct::float from ranking_certification_rows where version_id=${q(first.id)};`), "80");
  const otherYear = save({ year: 2027, path: `certifications/2027/${actor}/otro.xlsx` });
  assert.equal(otherYear.version_no, 1);
});

test("reintentar la misma carga es idempotente y no duplica filas", () => {
  const path = `certifications/2026/${actor}/reintento.xlsx`;
  const a = save({ path });
  const b = save({ path });
  assert.equal(b.id, a.id); assert.equal(b.duplicate, true);
  assert.equal(sql(`select count(*) from ranking_certification_rows where version_id=${q(a.id)};`), "1");
});

test("un error de calificación revierte la versión completa y mantiene vigente la anterior", () => {
  const before = sql("select max(version_no) from ranking_certification_versions where certification_year=2026;");
  assert.throws(() => save({ rows: [row(), row({ source_row: 3, annual_certification_pct: 120 })] }));
  assert.equal(sql("select max(version_no) from ranking_certification_versions where certification_year=2026;"), before);
  assert.throws(() => save({ rows: [row(), row()] }));
  assert.equal(sql("select max(version_no) from ranking_certification_versions where certification_year=2026;"), before);
});

test("no permite publicaciones vacías, usuarios sin rol admin ni rutas de otro usuario", () => {
  assert.throws(() => save({ rows: [] }));
  assert.throws(() => save({ user: unauthorized }));
  assert.throws(() => save({ path: `certifications/2026/${unauthorized}/otro.xlsx` }));
});

test("authenticated y anon no pueden leer las notas ni ejecutar la publicación", () => {
  for (const role of ["authenticated", "anon"]) {
    assert.throws(() => sql(`set role ${role}; select * from ranking_certification_rows;`));
    assert.throws(() => sql(`set role ${role}; select * from ranking_certification_versions;`));
    assert.throws(() => save({ asRole: role }));
  }
  assert.equal(sql("select count(*) from pg_class where relname in ('ranking_certification_versions','ranking_certification_rows') and relrowsecurity;"), "2");
});
