// Teste do conversor das planilhas para o Supabase (migracao/converter.mjs):
//   node testes/converter.test.js
// Monta um .xlsx com a fixture da RELAÇÃO + abas de inventário/MachineCards/AJUSTE e confere os CSVs.
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const { execFileSync } = require("child_process");
const XLSX = require("xlsx");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "conv-"));
const rel = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "relacao-mini.json"), "utf8"));
const wb = XLSX.utils.book_new();
Object.entries(rel).forEach(([n, rows]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), n));
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
  ["campo1", "campo2", "LOC", "RUA", "ANDAR", "GPSSTRING", "DATAHORA", "NumInv", "fotoUrl", "fotoUrl2", "fotoUrl3", "fotoUrl4", "OBS", "USUARIO"],
  ["146000231", "1103", "Pátio 1", "2", "1", "", 46329.5, "7", "https://drive/x", "", "", "", "obs, com vírgula", "real"],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", ""],                      // linha limpa
  [958152101, 993, "Pátio 2", "", "", "", "2026-11-03 08:15:00", "8", "", "", "", "", "", "joao"],
]), "Movimentacoes");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
  Array(13).fill("cab"),
  ["", "", "280", "", "", "", "", 146000231, "LANÇA 1 - PÉ", "", 1103, "C051.023-611.111", "GT-26"],
]), "MachineCards Consolidado");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
  ["DATAHORA", "USUARIO", "GT", "MODELO", "POSICAO (CODIGO C)", "DESCRICAO", "CODIGO9 ANTIGO", "ID ANTIGO", "CODIGO9 NOVO", "ID NOVO", "ALERTA", "OBS", "CODIGO C NOVO"],
  ["29/10/2026 07:41:00", "real", "GT-13", "280 EC-H 12 Litronic", "C051.001-634.111", "LANÇA 8", "", "", 958152101, 993, "INCLUSÃO", "", ""],
]), "AJUSTE");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["qualquer coisa"]]), "Rascunho");
const arq = path.join(tmp, "planilhas.xlsx");
XLSX.writeFile(wb, arq);

const saida = path.join(tmp, "saida");
const log = execFileSync(process.execPath, [path.join(__dirname, "..", "migracao", "converter.mjs"), arq, "--saida", saida], { encoding: "utf8" });
const csv = t => XLSX.utils.sheet_to_json(XLSX.read(fs.readFileSync(path.join(saida, t + ".csv"), "utf8"), { type: "string", raw: true }).Sheets.Sheet1, { raw: false, defval: "" });

assert.match(log, /abas não reconhecidas[\s\S]*'Rascunho'/);
console.log("ok - aba desconhecida aparece no aviso");

const mov = csv("movimentacoes");
assert.deepStrictEqual(mov.map(r => r.id), ["2", "4"], "linha limpa fica fora; id = linha da planilha");
assert.strictEqual(mov[0].datahora, "2026-11-03 12:00:00-03:00");
assert.strictEqual(mov[1].datahora, "2026-11-03 08:15:00-03:00");
assert.strictEqual(mov[0].obs, "obs, com vírgula");
assert.strictEqual(mov[1].campo1, "958152101");
console.log("ok - Movimentacoes: id, data/hora e texto com vírgula");

const mc = csv("machinecards");
assert.strictEqual(mc[0].id, "2"); assert.strictEqual(mc[0].codigo9, "146000231"); assert.strictEqual(mc[0].gt, "GT-26");
const aj = csv("ajustes");
assert.strictEqual(aj[0].id, "2"); assert.strictEqual(aj[0].datahora, "2026-10-29 07:41:00-03:00"); assert.strictEqual(aj[0].id_novo, "993");
console.log("ok - MachineCards e AJUSTE");

assert.deepStrictEqual(csv("gruas_lista").map(r => r.modelo), ["280 EC-H 12 Litronic", "630 EC-H 40 Litronic"]);
assert.ok(csv("validacao").some(r => r.gt === "GT-26" && r.modelo === "280 EC-H 12 Litronic"));
const abas = csv("relacao_abas");
assert.deepStrictEqual(abas.map(a => a.aba), ["280 EC-H 12 Litronic", "630 EC-H 40 Litronic"]);
assert.strictEqual(abas[0].colunas_compat, "{3,4,5,6}");
assert.strictEqual(abas[0].lancas, '{"75m","70m","65m","60m","55m"}');
const itens = csv("relacao_itens");
const l1 = itens.find(r => r.codigo_lbr === "C051.023-611.111");
assert.strictEqual(l1.grupo, "LANÇA"); assert.strictEqual(l1.peso, "3100");
assert.deepStrictEqual(JSON.parse(l1.qtd), { "75m": 1, "70m": 1, "65m": 1, "60m": 1, "55m": 1 });
assert.strictEqual(itens.find(r => r.linha_planilha === "3").grupo, "", "linha 3 (a grua) não é grupo");
console.log("ok - RELAÇÃO: abas de modelo, grupo, peso e quantidades por lança");

fs.rmSync(tmp, { recursive: true, force: true });
console.log("\nconversor OK");
