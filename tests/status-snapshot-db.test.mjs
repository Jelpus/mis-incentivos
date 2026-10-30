import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

// Only an isolated, explicitly named test container can be used. No remote URL.
const container = process.env.STATUS_SNAPSHOT_TEST_CONTAINER ?? "mis-incentivos-status-test-20261030";
assert.match(container, /^mis-incentivos-status-test-/);
const database = `status_snapshot_${randomUUID().replaceAll("-", "")}`;
const admin = "00000000-0000-0000-0000-000000000001";
const userA = "00000000-0000-0000-0000-000000000002";
const userB = "00000000-0000-0000-0000-000000000003";
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${quote(JSON.stringify(value))}::jsonb`;
const sql = (query) => execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-Atq"], { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const result = (query) => JSON.parse(sql(query));
const apply = (batchId) => result(`select public.apply_import_batch_status_snapshot(${quote(batchId)},${quote(admin)});`);

before(() => {
  const network = execFileSync("docker", ["inspect", "--format", "{{.HostConfig.NetworkMode}}", container], { encoding: "utf8" }).trim();
  assert.equal(network, "none", "El contenedor de pruebas debe estar aislado de la red");
  execFileSync("docker", ["exec", container, "createdb", "-U", "postgres", database]);
  sql(readFileSync(new URL("./fixtures/status-snapshot-schema.sql", import.meta.url), "utf8"));
  sql(readFileSync(new URL("../supabase/migrations/20261030165709_status_full_period_snapshot.sql", import.meta.url), "utf8"));
  sql(`insert into profiles(user_id,email,global_role,metadata) values
    (${quote(admin)},'admin@example.test','admin','{}'),
    (${quote(userA)},'ana@example.test','user','{}'),
    (${quote(userB)},'bea@example.test','user','{}');
    insert into import_types(code,name,target_table) values ('sales_force_status','SVA','sales_force_status'),('manager_status','SVM','manager_status');`);
});
after(() => execFileSync("docker", ["exec", container, "dropdb", "-U", "postgres", "--if-exists", database]));

function batch(type, period, rows, overrides = {}) {
  const id = randomUUID();
  sql(`insert into import_batches(id,import_type_id,period_month,status,total_rows,mapping_snapshot,preview_summary,metadata)
    values (${quote(id)},(select id from import_types where code=${quote(type)}),${quote(period)},'preview_ready',${rows.length},'{}',${json({ apply_mode: "full_period", ...overrides })},'{}');`);
  for (const [index, data] of rows.entries()) {
    sql(`insert into import_rows(batch_id,row_number,raw_data,cleaned_data,mapped_data,validation_errors,warnings,action_type,action_details)
      values (${quote(id)},${index + 2},'{}',${json(data)},'{}','[]','[]','insert','{}');`);
  }
  return id;
}
function sales(territory, employee, email, name = "Persona") {
  return { linea_principal: "LINEA", parrilla: "PARRILLA", nombre_completo: name,
    no_empleado: employee, territorio_padre: "GER-1", territorio_individual: territory,
    puesto: null, correo_electronico: email, ciudad: null, fecha_ingreso: null,
    team_id: "TEAM", base_incentivos: 100, is_active: true, is_vacant: employee === null,
    valid_since_period: "2026-01-01" };
}
function seedSales(period, data) {
  const id = randomUUID();
  sql(`insert into sales_force_status(id,period_month,linea_principal,parrilla,nombre_completo,no_empleado,territorio_padre,territorio_individual,correo_electronico,team_id,base_incentivos,is_vacant,puesto,valid_since_period)
    values (${quote(id)},${quote(period)},'LINEA','PARRILLA',${quote(data.nombre_completo)},${data.no_empleado ?? "null"},'GER-1',${quote(data.territorio_individual)},${quote(data.correo_electronico)},'TEAM',100,${data.is_vacant},'Puesto conservado','2026-01-01');`);
  return id;
}

test("reaplica una vacante como persona y deja vacante su ruta anterior sin colisiones", () => {
  const oldId = seedSales("2026-08-01", sales("ANTERIOR", 123, "ana@example.test", "Ana"));
  const vacantId = seedSales("2026-08-01", sales("NUEVA", null, "na", "Vacante"));
  const id = batch("sales_force_status", "2026-08-01", [sales("ANTERIOR", null, "na", "Vacante"), sales("NUEVA", 123, "ana@example.test", "Ana")]);
  // Reproduce a stale employee-first preview: both rows point to the same ID.
  sql(`update import_rows set target_record_id=${quote(oldId)},action_type='update' where batch_id=${quote(id)};`);
  const applied = apply(id);
  assert.equal(applied.results.updated_count, 2);
  const records = result("select jsonb_agg(to_jsonb(s) order by territorio_individual) from sales_force_status s where period_month='2026-08-01' and not is_deleted;");
  assert.equal(records[0].id, oldId);
  assert.equal(records[0].is_vacant, true);
  assert.equal(records[0].user_id, null, "La vacante no hereda la identidad anterior");
  assert.equal(records[1].id, vacantId);
  assert.equal(records[1].no_empleado, 123);
  assert.equal(records[1].user_id, userA);
  assert.equal(records[1].puesto, "Puesto conservado");
  assert.equal(sql(`select sales_force_status_id from profile_relations where user_id=${quote(userA)} and period_month='2026-08-01';`), vacantId);
  assert.deepEqual(apply(id), applied, "Reintentar el mismo lote es idempotente");
});

test("permite intercambiar empleados entre dos territorios independientemente del orden", () => {
  const a = seedSales("2026-09-01", sales("A", 123, "ana@example.test", "Ana"));
  const b = seedSales("2026-09-01", sales("B", 456, "bea@example.test", "Bea"));
  apply(batch("sales_force_status", "2026-09-01", [sales("A", 456, "bea@example.test", "Bea"), sales("B", 123, "ana@example.test", "Ana")]));
  assert.equal(sql(`select no_empleado from sales_force_status where id=${quote(a)};`), "456");
  assert.equal(sql(`select no_empleado from sales_force_status where id=${quote(b)};`), "123");
  assert.equal(sql(`select sales_force_status_id from profile_relations where user_id=${quote(userA)} and period_month='2026-09-01';`), b);
});

test("retira las rutas ausentes con historial, conserva otros meses y corrige los vínculos", () => {
  const removed = seedSales("2026-10-01", sales("RETIRAR", 789, "bea@example.test", "Bea"));
  const unchanged = seedSales("2026-10-01", sales("QUEDA", 123, "ana@example.test", "Ana"));
  const historyBefore = sql(`select count(*) from sales_force_status_history where sales_force_status_id=${quote(unchanged)};`);
  const applied = apply(batch("sales_force_status", "2026-10-01", [sales("QUEDA", 123, "ana@example.test", "Ana")]));
  assert.equal(applied.results.retired_count, 1);
  assert.equal(applied.results.noop_count, 1);
  assert.equal(sql(`select is_deleted from sales_force_status where id=${quote(removed)};`), "t");
  assert.equal(sql(`select count(*) from sales_force_status_history where sales_force_status_id=${quote(unchanged)};`), historyBefore);
  assert.equal(sql(`select count(*) from profile_relations where user_id=${quote(userB)} and period_month='2026-10-01';`), "0");
  assert.equal(sql("select count(*) from sales_force_status where period_month='2026-08-01' and not is_deleted;"), "2");
});

test("un dato inválido revierte también las bajas, los vínculos y el estado del lote", () => {
  const existing = seedSales("2026-11-01", sales("ACTUAL", 900, "ana@example.test", "Ana"));
  const id = batch("sales_force_status", "2026-11-01", [{ ...sales("OTRA", 901, "bea@example.test", "Bea"), base_incentivos: -1 }]);
  const before = sql("select jsonb_agg(to_jsonb(s) order by id) from sales_force_status s;");
  const historyBefore = sql("select count(*) from sales_force_status_history;");
  assert.throws(() => apply(id), /sales_force_status_base_incentivos_chk/);
  assert.equal(sql("select jsonb_agg(to_jsonb(s) order by id) from sales_force_status s;"), before);
  assert.equal(sql("select count(*) from sales_force_status_history;"), historyBefore);
  assert.equal(sql(`select status from import_batches where id=${quote(id)};`), "preview_ready");
  assert.equal(sql(`select is_deleted from sales_force_status where id=${quote(existing)};`), "f");
});

test("rechaza archivos vacíos, incompletos, con errores o empleados/territorios duplicados", () => {
  assert.throws(() => apply(batch("sales_force_status", "2026-12-01", [])), /vacía o incompleta/);
  for (const data of [
    [sales("A", 1, "a@test.test"), sales("A", 2, "b@test.test")],
    [sales("A", 1, "a@test.test"), sales("B", 1, "b@test.test")],
  ]) assert.throws(() => apply(batch("sales_force_status", "2026-12-01", data)), /se repite en las filas/);
  const id = batch("sales_force_status", "2026-12-01", [sales("A", 1, "a@test.test")]);
  sql(`update import_batches set total_rows=2 where id=${quote(id)};`);
  assert.throws(() => apply(id), /vacía o incompleta/);
  sql(`update import_batches set total_rows=1 where id=${quote(id)}; update import_rows set action_type='invalid' where batch_id=${quote(id)};`);
  assert.throws(() => apply(id), /filas con errores/);
});

test("aplica managers completos, persiste su vacancia y retira managers ausentes", () => {
  const child = seedSales("2026-07-01", sales("HIJA", 123, "ana@example.test", "Ana"));
  const id = batch("manager_status", "2026-07-01", [{ territorio_manager: "GER-1", nombre_manager: "Ana", correo_manager: "ana@example.test", no_empleado_manager: 123, is_vacant: false }, { territorio_manager: "GER-2", nombre_manager: "Bea", correo_manager: "bea@example.test", no_empleado_manager: 456, is_vacant: false }]);
  assert.equal(apply(id).results.inserted_count, 2);
  const beforeId = sql("select id from manager_status where territorio_manager='GER-1';");
  assert.equal(sql(`select manager_status_id from sales_force_status where id=${quote(child)};`), beforeId);
  const second = apply(batch("manager_status", "2026-07-01", [{ territorio_manager: "GER-1", nombre_manager: "Vacante", correo_manager: null, no_empleado_manager: null, is_vacant: true }]));
  assert.equal(second.results.retired_count, 1);
  assert.equal(sql("select id from manager_status where territorio_manager='GER-1' and not is_deleted;"), beforeId);
  assert.equal(sql("select is_vacant from manager_status where territorio_manager='GER-1';"), "t");
  assert.equal(sql("select user_id is null from manager_status where territorio_manager='GER-1';"), "t");
});

test("rechaza actores no administradores y no expone el RPC a clientes públicos", () => {
  const id = batch("manager_status", "2026-06-01", [{ territorio_manager: "A", nombre_manager: "Vacante", is_vacant: true }]);
  assert.throws(() => sql(`select apply_import_batch_status_snapshot(${quote(id)},${quote(userA)});`), /administrador activo/);
  assert.equal(sql("select has_function_privilege('authenticated','public.apply_import_batch_status_snapshot(uuid,uuid)','execute');"), "f");
  assert.equal(sql("select has_function_privilege('anon','public.apply_import_batch_status_snapshot(uuid,uuid)','execute');"), "f");
  assert.equal(sql("select has_function_privilege('service_role','public.apply_import_batch_status_snapshot(uuid,uuid)','execute');"), "t");
});
