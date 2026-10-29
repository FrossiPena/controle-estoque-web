// Simulação do Apps Script do Consolidado (apps-script/consolidado.gs) em Node.
// Planilha vinculada: aba "MachineCards Consolidado" + aba AJUSTE; RELAÇÃO lida de um JSON
// (por padrão fixtures/relacao-mini.json; a RELAÇÃO completa pode ser indicada em RELACAO_JSON,
// guardada fora do Git em testes/dados/).
// Uso: const m = criarMock(); m.q({ mode: "diag" })  → resposta do doGet já em objeto.
const fs = require("fs"), path = require("path"), vm = require("vm");

function sheet(name, rows) {
  return {
    rows, getName: () => name, getLastRow: () => rows.length,
    getLastColumn: () => Math.max(1, ...rows.map(r => r.length)),
    getDataRange: () => ({ getValues: () => rows.map(r => r.slice()) }),
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => { const o = []; for (let i = 0; i < nr; i++) { const row = rows[r - 1 + i] || []; o.push(Array.from({ length: nc }, (_, j) => row[c - 1 + j] ?? "")); } return o; },
      setValues: (v) => { v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, j) => rows[r - 1 + i][c - 1 + j] = x); }); return { setFontWeight() {} }; },
      getValue: () => ((rows[r - 1] || [])[c - 1] ?? ""),
      setValue: (v) => { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = v; },
      setNote: (n) => { notas.push(n); },
    }),
    appendRow: r => rows.push(r), setFrozenRows() {}, insertRowBefore: (n) => rows.splice(n - 1, 0, []),
  };
}
let notas = [];

// Linha da MachineCards: H código 9, I descrição, K ID, L Código C, M GT
const mcRow = (h, k, l, m, desc) => { const r = Array(13).fill(""); r[7] = h; r[8] = desc || ""; r[10] = k; r[11] = l; r[12] = m; return r; };

function criarMock(relacaoJson = process.env.RELACAO_JSON || path.join(__dirname, "fixtures", "relacao-mini.json")) {
  notas = [];
  const mc = [Array(13).fill("cab"),
    mcRow("146000231", 1103, "C051.023-611.111", "GT-26", "LANÇA 1 - PÉ (MC)"),
    mcRow("146000036", 1104, "C051.001-621.111", "GT-26", "LANÇA 2 (MC)"),
    mcRow("146000036", "1105", "C051.001-621.111 002", "GT-26", "LANÇA 2 (MC)"),
    mcRow("146000231", 2203, "C051.023-611.111", "GT-09", "LANÇA 1 - PÉ (MC)"),
    mcRow("148000001", 69, "C048.001-812.161", "GT-27", "TIRANTE 630 (MC)"),
    mcRow("958152101", 120, "C051.001-634.111", "GT-26", "LANÇA 8 (MC)"),
    mcRow("146000042", 1201, "C051.043-629.111 001", "GT-26", "LANÇA 4 280 EC-H 12 (MC)"),
    mcRow("146000099", 300, "C 051.001-631.111", "GT-09", "LANÇA 4 ALTERNATIVA (MC)"),
    mcRow("146000555", 301, "C051.001-640.111", "GT-09", "PEÇA NOVA 640 (MC)"),
    mcRow("146000035", 1300, "C051.001-632.111", "GT-26", "LANÇA 5 (MC)")];
  const abas = {
    "MachineCards Consolidado": sheet("MachineCards Consolidado", mc),
    // AJUSTE antiga, ainda sem a coluna M (o script completa o cabeçalho)
    "AJUSTE": sheet("AJUSTE", [
      ["DATAHORA", "USUARIO", "GT", "MODELO", "POSICAO (CODIGO C)", "DESCRICAO", "CODIGO9 ANTIGO", "ID ANTIGO", "CODIGO9 NOVO", "ID NOVO", "ALERTA", "OBS"],
      ["2026-10-29 07:41:00", "real", "GT-13", "280 EC-H 12 Litronic", "C051.001-634.111", "LANÇA 8", "", "", 958152101, 993, "INCLUSÃO", ""]]),
  };
  const ativa = { getSheetByName: n => abas[n] || null, insertSheet: n => (abas[n] = sheet(n, [])) };
  const R = JSON.parse(fs.readFileSync(relacaoJson, "utf8"));
  const relSheets = Object.entries(R).map(([n, r]) => sheet(n, r));
  const rel = { getSheets: () => relSheets };
  const ctx = {
    ContentService: { createTextOutput: t => ({ setMimeType: () => JSON.parse(t) }), MimeType: { JSON: 1 } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => "real:x" }) },
    SpreadsheetApp: { openById: () => rel, getActiveSpreadsheet: () => ativa, flush() {} },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) },
    Utilities: { formatDate: () => "2026-10-28 15:00:00" },
    Session: { getScriptTimeZone: () => "America/Sao_Paulo" },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "apps-script", "consolidado.gs"), "utf8"), ctx);
  return {
    q: (p) => ctx.doGet({ parameter: Object.assign({ user: "real", pass: "x" }, p) }),
    abas, relSheets, notas: () => notas,
    aba: (nome) => relSheets.find(s => s.getName() === nome),
  };
}

module.exports = { criarMock };
