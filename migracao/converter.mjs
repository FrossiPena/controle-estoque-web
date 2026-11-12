// Converte as planilhas baixadas do Google (Arquivo → Fazer download → .xlsx) em CSVs para importar no
// Supabase (Table Editor → schema estoque → tabela → Insert → Import data from CSV).
//   node migracao/converter.mjs Inventario.xlsx Consolidado.xlsx RELACAO.xlsx  [--saida migracao/saida]
// Reconhece as abas pelo nome/cabeçalho; lista as que não reconheceu (nada some calado).
// A pasta de saída fica fora do Git (dados internos).
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const args = process.argv.slice(2);
const iSaida = args.indexOf("--saida");
const SAIDA = iSaida >= 0 ? args.splice(iSaida, 2)[1] : path.join("migracao", "saida");
if (!args.length) {
  console.error("Uso: node migracao/converter.mjs <arquivo.xlsx> [...] [--saida pasta]");
  process.exit(1);
}

// Mesmas regras dos Apps Scripts
const txt = v => String(v ?? "").trim();
const normNome = v => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const letra = i => XLSX.utils.encode_col(i);   // 0 → A

// Data/hora da planilha → "yyyy-MM-dd HH:mm:ss-03:00" (o Brasil não tem horário de verão desde 2019)
function dataHora(v) {
  if (v === "" || v == null) return "";
  const p2 = n => String(n).padStart(2, "0");
  if (typeof v === "number") {                       // número de série do Excel, na hora local
    const d = new Date(Math.round((v - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ` +
           `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}-03:00`;
  }
  const s = txt(v);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6] || "00"}-03:00`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) return `${m[3]}-${p2(m[2])}-${p2(m[1])} ${p2(m[4] || 0)}:${m[5] || "00"}:${m[6] || "00"}-03:00`;
  throw new Error(`data/hora não reconhecida: "${s}"`);
}

function csvCampo(v) {
  if (v == null) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Array do Postgres: {"75m","70m"} / {3,4,5,6}
const pgArray = (a, num) => "{" + a.map(x => num ? x : `"${String(x).replace(/["\\]/g, m => "\\" + m)}"`).join(",") + "}";

const saidas = {};   // tabela → { colunas, linhas }
function emitir(tabela, colunas, linha) {
  const t = (saidas[tabela] = saidas[tabela] || { colunas, linhas: [] });
  t.linhas.push(colunas.map(c => linha[c]));
}

// ---------- Uma função por tipo de aba ----------

function movimentacoes(rows) {
  const cols = ["id", "campo1", "campo2", "loc", "rua", "andar", "gps", "datahora", "num_inv",
                "foto1", "foto2", "foto3", "foto4", "obs", "usuario"];
  rows.forEach((r, i) => {
    if (i === 0 || txt(r[0]) === "") return;         // cabeçalho e linhas limpas (Deletar linha)
    emitir("movimentacoes", cols, {
      id: i + 1, campo1: txt(r[0]), campo2: txt(r[1]), loc: txt(r[2]), rua: txt(r[3]), andar: txt(r[4]),
      gps: txt(r[5]), datahora: dataHora(r[6]), num_inv: txt(r[7]), foto1: txt(r[8]), foto2: txt(r[9]),
      foto3: txt(r[10]), foto4: txt(r[11]), obs: txt(r[12]), usuario: txt(r[13]),
    });
  });
}

function machinecards(rows) {
  const nomes = ["col_a", "col_b", "col_c", "col_d", "col_e", "col_f", "col_g", "codigo9", "descricao",
                 "col_j", "id_individual", "codigo_c", "gt"];
  rows.forEach((r, i) => {
    if (i === 0 || r.every(v => txt(v) === "")) return;
    emitir("machinecards", ["id", ...nomes], Object.fromEntries([["id", i + 1], ...nomes.map((n, j) => [n, txt(r[j])])]));
  });
}

function ajustes(rows) {
  const nomes = ["datahora", "usuario", "gt", "modelo", "posicao", "descricao", "c9_antigo", "id_antigo",
                 "c9_novo", "id_novo", "alerta", "obs", "codigo_c_novo"];
  rows.forEach((r, i) => {
    if (["datahora", "data"].includes(normNome(r[0])) || r.every(v => txt(v) === "")) return;   // cabeçalho(s)
    const o = Object.fromEntries([["id", i + 1], ...nomes.map((n, j) => [n, txt(r[j])])]);
    o.datahora = dataHora(r[0]);
    emitir("ajustes", ["id", ...nomes], o);
  });
}

function gruasLista(rows) {
  rows.forEach((r, i) => {
    if (i >= 3 && txt(r[3])) emitir("gruas_lista", ["linha_planilha", "modelo"], { linha_planilha: i + 1, modelo: txt(r[3]) });
  });
}

function validacao(rows) {
  rows.forEach((r, i) => {
    if (i >= 3 && txt(r[2])) emitir("validacao", ["linha_planilha", "gt", "modelo"], { linha_planilha: i + 1, gt: txt(r[2]), modelo: txt(r[3]) });
  });
}

// Aba de modelo: cabeçalho na linha 2; colunas pelo título (como o consolidado.gs)
function abaModelo(aba, rows) {
  const cab = (rows[1] || []).map(txt);
  const col = nome => cab.findIndex(h => normNome(h) === normNome(nome));
  const cD = col("DESCRIÇÃO"), cC = col("CÓDIGO LBR"), cT = col("COMPRIMENTO"), cGT = col("GT"), cP = col("PESO");
  const cCompat = [], cLanca = [];
  cab.forEach((h, i) => {
    if (/^compat/.test(normNome(h))) cCompat.push(i);
    else if (/^\d+([.,]\d+)?\s*m$/i.test(h)) cLanca.push(i);
  });
  if (cD < 0) throw new Error(`aba '${aba}': coluna DESCRIÇÃO não encontrada na linha 2`);
  const usadas = new Set([cD, cC, cT, cGT, cP, ...cCompat.slice(0, 4), ...cLanca].filter(i => i >= 0));

  emitir("relacao_abas", ["aba", "linha1", "cabecalho", "colunas_compat", "lancas"], {
    aba, linha1: rows[0] || [], cabecalho: rows[1] || [],
    colunas_compat: pgArray(cCompat.map(i => i + 1), true), lancas: pgArray(cLanca.map(i => cab[i])),
  });

  const colsItem = ["aba", "linha_planilha", "grupo", "descricao", "codigo_lbr", "compat1", "compat2", "compat3",
                    "compat4", "peso", "comprimento", "gt", "qtd", "extra"];
  let grupo = "";
  rows.forEach((r, i) => {
    if (i < 2 || r.every(v => txt(v) === "")) return;
    const codigo = cC >= 0 ? txt(r[cC]) : "", descricao = txt(r[cD]);
    if (i >= 3 && !/[0-9a-z]/i.test(codigo) && descricao) grupo = descricao;   // título de grupo (linha 3 = a grua)
    const qtd = {}, extra = {};
    cLanca.forEach(j => {
      const v = r[j];
      if (typeof v === "number" ? v > 0 : Number(txt(v).replace(",", ".")) > 0) qtd[cab[j]] = Number(String(v).replace(",", "."));
      else if (txt(v) && Number(txt(v).replace(",", ".")) !== 0) extra[cab[j]] = v;
    });
    r.forEach((v, j) => { if (!usadas.has(j) && txt(v) !== "") extra[cab[j] || letra(j)] = v; });
    const peso = cP >= 0 ? r[cP] : "";
    const pesoNum = typeof peso === "number" ? peso : (txt(peso) && !isNaN(Number(txt(peso).replace(",", "."))) ? Number(txt(peso).replace(",", ".")) : null);
    if (pesoNum == null && txt(peso)) extra[cab[cP]] = peso;
    const compat = cCompat.slice(0, 4).map(j => txt(r[j]));
    emitir("relacao_itens", colsItem, {
      aba, linha_planilha: i + 1, grupo: i >= 3 ? grupo : "", descricao, codigo_lbr: codigo,
      compat1: compat[0] || "", compat2: compat[1] || "", compat3: compat[2] || "", compat4: compat[3] || "",
      peso: pesoNum ?? "", comprimento: cT >= 0 ? txt(r[cT]) : "", gt: cGT >= 0 ? txt(r[cGT]) : "",
      qtd, extra,
    });
  });
}

// ---------- Leitura ----------

// Sempre a partir de A1: o .xlsx baixado do Google pode começar o !ref na 1ª coluna/linha usada (B2…),
// e aí r[3] deixaria de ser a coluna D e o id (= linha da planilha) sairia deslocado
function linhasDesdeA1(ws) {
  const ref = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
  if (ref) { ref.s.r = 0; ref.s.c = 0; }
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "", blankrows: true, ...(ref ? { range: ref } : {}) });
}

const naoReconhecidas = [];
for (const arq of args) {
  const wb = XLSX.read(fs.readFileSync(arq), { cellDates: false });
  for (const aba of wb.SheetNames) {
    const rows = linhasDesdeA1(wb.Sheets[aba]);
    const n = normNome(aba);
    if (n === "movimentacoes") movimentacoes(rows);
    else if (n === "machinecards consolidado") machinecards(rows);
    else if (n === "ajuste") ajustes(rows);
    else if (n === "gruas lista") gruasLista(rows);
    else if (n === "validacao") validacao(rows);
    else if ((rows[1] || []).some(h => normNome(h) === normNome("CÓDIGO LBR"))) abaModelo(aba, rows);
    else naoReconhecidas.push(`${path.basename(arq)} → '${aba}' (${rows.length} linhas)`);
  }
}

fs.mkdirSync(SAIDA, { recursive: true });
// Ordem de importação (relacao_abas antes de relacao_itens)
const ORDEM = ["movimentacoes", "machinecards", "ajustes", "gruas_lista", "validacao", "relacao_abas", "relacao_itens"];
console.log(`Arquivos em ${SAIDA} (importe nesta ordem):`);
ORDEM.filter(t => saidas[t]).forEach(t => {
  const { colunas, linhas } = saidas[t];
  const corpo = [colunas, ...linhas].map(l => l.map(csvCampo).join(",")).join("\n") + "\n";
  fs.writeFileSync(path.join(SAIDA, `${t}.csv`), corpo, "utf8");
  console.log(`  ${t}.csv: ${linhas.length} linhas`);
});
const abasModelo = saidas.relacao_abas ? saidas.relacao_abas.linhas.length : 0;
console.log(`Abas de modelo da RELAÇÃO: ${abasModelo}`);
if (naoReconhecidas.length) {
  console.log("\nATENÇÃO - abas não reconhecidas (não foram convertidas):");
  naoReconhecidas.forEach(a => console.log("  " + a));
}
console.log("\nDepois de importar, no SQL Editor: select estoque.ajustar_sequencias();");
