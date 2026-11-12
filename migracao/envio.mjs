// Envio de grua: converte a RELAÇÃO "com preço padrão" (.xls/.xlsx) e a "Base de Dados Grua.xlsx" em CSVs para
// as tabelas carga_* do Supabase (supabase/migrations/20261112120000_envio_cadastros.sql); aplicar_carga_envio()
// passa para as definitivas sem apagar o que foi editado no app. Gera também o relatório de inconsistências.
// Mesmo Código C = mesma peça: peso, comprimento, preço e Sapiens têm um valor só (o mais frequente entre as abas);
// as diferenças são erro de cadastro e vão para o relatório.
//   node migracao/envio.mjs RELACAO.xls "Base de Dados Grua.xlsx" [Consolidado.xlsx] [--saida migracao/saida/envio]
// O Consolidado é opcional: com a aba "MachineCards Consolidado", códigos 9 da Base de Dados viram Código C.
// Reconhece as planilhas pelas abas; colunas pelo título (posição só onde o título está em branco, e avisa).
// Nenhuma coluna some calada: o que não tem uso definido vai para "extra".
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const args = process.argv.slice(2);
const iSaida = args.indexOf("--saida");
const SAIDA = iSaida >= 0 ? args.splice(iSaida, 2)[1] : path.join("migracao", "saida", "envio");
if (!args.length) {
  console.error('Uso: node migracao/envio.mjs <RELACAO.xls> <"Base de Dados Grua.xlsx"> [Consolidado.xlsx] [--saida pasta]');
  process.exit(1);
}

// ---------- Normalização ----------
const txt = v => String(v ?? "").replace(/\s+/g, " ").trim();
const normNome = v => txt(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const letra = i => XLSX.utils.encode_col(i);
const chaveC = v => (String(v ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "").match(/^C\d{12}/) || [""])[0];
// Chave da peça: Código C sem pontuação; outros códigos (WIW…, FAW…, A 101…, código 9) só letras e números
const chavePeca = v => chaveC(v) || String(v ?? "").toUpperCase().replace(/\.0+$/, "").replace(/[^0-9A-Z]/g, "");
const ehCodigo9 = k => /^\d{7,10}$/.test(k);
// "75,6" / "80m" / 75.6 → número; vazio/texto → null
function num(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = txt(v).replace(/m$/i, "").replace(",", ".");
  return s && !isNaN(Number(s)) ? Number(s) : null;
}
const simNao = v => { const n = normNome(v); return n === "sim" ? true : n === "nao" ? false : null; };

// ---------- Saída ----------
const saidas = {};
function emitir(tabela, colunas, linha) {
  const t = (saidas[tabela] = saidas[tabela] || { colunas, linhas: [] });
  t.linhas.push(colunas.map(c => linha[c]));
}
const avisos = [];   // relatório de inconsistências
const avisar = (tipo, onde, codigo, detalhe) => avisos.push({ tipo, onde, codigo: codigo ?? "", detalhe });

function csvCampo(v) {
  if (v == null) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Separa células com mais de um código ("X/ Y", quebra de linha): fica o primeiro, avisa
function codigoUnico(bruto, onde) {
  const partes = String(bruto ?? "").split(/[\/\n;]+/).map(txt).filter(Boolean);
  if (partes.length > 1) avisar("dois códigos na célula", onde, partes[0], `"${txt(bruto)}" → usado ${partes[0]}`);
  return partes[0] || "";
}

// ---------- Leitura das planilhas ----------
const livros = args.map(a => ({ arq: path.basename(a), wb: XLSX.read(fs.readFileSync(a), { cellDates: false }) }));
const linhas = (wb, aba) => XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, raw: true, defval: "", blankrows: true });
const acharAba = (wb, nome) => wb.SheetNames.find(n => normNome(n) === normNome(nome));

const relacao = livros.find(l => l.wb.SheetNames.some(n => (linhas(l.wb, n)[1] || []).some(h => normNome(h) === "codigo lbr")));
const baseDados = livros.find(l => acharAba(l.wb, "Altura") && acharAba(l.wb, "Lanças"));
const consolidado = livros.find(l => acharAba(l.wb, "MachineCards Consolidado"));
if (!relacao) throw new Error("RELAÇÃO não encontrada (nenhuma aba com 'CÓDIGO LBR' na linha 2)");
if (!baseDados) throw new Error("Base de Dados Grua não encontrada (abas 'Lanças' e 'Altura')");

// Código 9 → Código C pela MachineCards (H = código 9, L = Código C)
const c9paraC = new Map();
if (consolidado) {
  linhas(consolidado.wb, acharAba(consolidado.wb, "MachineCards Consolidado")).forEach((r, i) => {
    const c9 = chavePeca(r[7]), c = chaveC(r[11]);
    if (i > 0 && c9 && c && !c9paraC.has(c9)) c9paraC.set(c9, { chave: c, exib: txt(r[11]) });
  });
}

// ---------- Peças: valores vistos em cada lugar; no fim, um por código (o mais frequente) ----------
const pecas = new Map();   // codigo → { exib, campos: {campo: Map(valor → [onde])} }
function verPeca(bruto, onde) {
  const exib = codigoUnico(bruto, onde);
  let k = chavePeca(exib);
  if (!k) return "";
  if (ehCodigo9(k)) {
    const c = c9paraC.get(k);
    if (c) { k = c.chave; return registrar(k, c.exib); }
    avisar("código 9 no lugar do Código C", onde, exib, consolidado ? "não está na MachineCards" : "rode com o Consolidado.xlsx para converter");
  }
  return registrar(k, exib);
}
function registrar(k, exib) {
  if (!pecas.has(k)) pecas.set(k, { exib, campos: {} });
  return k;
}
function valorPeca(k, campo, v, onde) {
  if (!k || v == null || v === "") return;
  const m = (pecas.get(k).campos[campo] = pecas.get(k).campos[campo] || new Map());
  m.set(v, [...(m.get(v) || []), onde]);
}
function escolher(k, campo, silencioso = false) {
  const m = pecas.get(k).campos[campo];
  if (!m || !m.size) return null;
  const ord = [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  if (ord.length > 1 && !silencioso) avisar(`${campo} diferente entre abas`, ord.map(([v, o]) => `${v} (${o.slice(0, 3).join(", ")}${o.length > 3 ? "…" : ""})`).join(" × "),
    pecas.get(k).exib, `usado ${ord[0][0]} (${ord[0][1].length > ord[1][1].length ? "mais frequente" : "empate: o primeiro encontrado, conferir"})`);
  return ord[0][0];
}

// ---------- RELAÇÃO: abas de modelo ----------
const modelos = new Map();   // normNome → nome da aba
for (const aba of relacao.wb.SheetNames) {
  const rows = linhas(relacao.wb, aba);
  const cab = (rows[1] || []).map(txt);
  const col = nome => cab.findIndex(h => normNome(h) === normNome(nome));
  const colIni = nome => cab.findIndex(h => normNome(h).startsWith(normNome(nome)));
  const cC = col("CÓDIGO LBR");
  if (cC < 0) continue;
  const cD = col("DESCRIÇÃO"), cP = col("PESO"), cT = col("COMPRIMENTO"), cPr = col("PREÇO PADRÃO"),
        cKg = colIni("PREÇO ESTRUT. METÁLICA"), cProd = col("PRODUTO"), cDer = col("DERIVAÇÃO"), cVu = col("VALOR UNITÁRIO");
  [["PESO", cP], ["COMPRIMENTO", cT], ["PREÇO PADRÃO", cPr], ["PRODUTO", cProd], ["DERIVAÇÃO", cDer], ["VALOR UNITÁRIO", cVu]]
    .filter(([, i]) => i < 0).forEach(([n]) => avisar("coluna não encontrada", `${relacao.arq} → '${aba}'`, "", `sem título "${n}" na linha 2`));
  modelos.set(normNome(aba), aba);
  emitir("modelos", ["nome", "preco_kg", "na_relacao"], { nome: aba, preco_kg: cKg >= 0 ? num(rows[2]?.[cKg]) : null, na_relacao: true });

  const vistos = new Set();
  rows.forEach((r, i) => {
    if (i < 3) return;
    const bruto = txt(r[cC]), descricao = cD >= 0 ? txt(r[cD]) : "";
    if (!/[0-9]/.test(bruto)) return;   // título de grupo (grupo e ordem ficam na relacao_itens)
    const onde = `'${aba}'!${i + 1}`;
    const k = verPeca(bruto, onde);
    valorPeca(k, "descricao", descricao, onde);
    const peso = cP >= 0 ? num(r[cP]) : null;
    if (peso != null) valorPeca(k, "peso_kg", peso, onde);
    let comp = cT >= 0 ? num(r[cT]) : null;
    if (comp != null && comp > 30) {
      avisar("comprimento em mm?", onde, bruto, `${comp} → usado ${comp / 1000} m`);
      comp = comp / 1000;
    } else if (comp != null && comp > 0 && comp < 0.2) avisar("comprimento suspeito", onde, bruto, `${comp} m`);
    if (comp != null) valorPeca(k, "comp_m", comp, onde);
    if (cProd >= 0 && txt(r[cProd])) valorPeca(k, "sapiens_produto", txt(r[cProd]), onde);
    if (cDer >= 0 && txt(r[cDer])) valorPeca(k, "sapiens_derivacao", txt(r[cDer]).padStart(3, "0"), onde);
    // Preço: um por Código C (diferença entre modelos = erro de cadastro, vai para o relatório); centavos
    const reais = v => (v == null ? null : Math.round(v * 100) / 100);
    if (cPr >= 0) valorPeca(k, "preco_padrao", reais(num(r[cPr])), onde);
    if (cVu >= 0) valorPeca(k, "valor_unitario", reais(num(r[cVu])), onde);
    if (vistos.has(k)) avisar("código repetido na aba", onde, bruto, "");
    vistos.add(k);
  });
}

// ---------- Base de Dados Grua: regras do configurador ----------
function modeloDe(nome, onde) {
  const n = normNome(nome);
  if (!n) return "";
  if (modelos.has(n)) {
    if (modelos.get(n) !== txt(nome)) avisar("nome de modelo diferente da RELAÇÃO", onde, "", `"${nome}" → '${modelos.get(n)}'`);
    return modelos.get(n);
  }
  modelos.set(n, txt(nome));
  emitir("modelos", ["nome", "preco_kg", "na_relacao"], { nome: txt(nome), preco_kg: null, na_relacao: false });
  avisar("modelo sem aba na RELAÇÃO", onde, "", `"${txt(nome)}" (sem peso/preço/Sapiens)`);
  return txt(nome);
}

const bases = new Set();
const COLS_REGRA = ["modelo", "componente", "lanca_m", "altura_m", "base", "telescopagem", "lastro_t", "codigo",
                    "quantidade", "pai", "ordem", "origem", "extra"];
// componente: aba → como ler as condições (por título)
const ABAS_REGRA = [
  { aba: "Lanças", componente: "lanca", cond: { lanca_m: ["Lança"] } },
  { aba: "Altura", componente: "torre", cond: { altura_m: ["Altura"], base: ["Base"], telescopagem: ["Telescopagem"] } },
  { aba: "Base", componente: "base", cond: { base: ["Base"] } },
  { aba: "Lastro", componente: "lastro", cond: { lastro_t: ["Tolenada", "Tonelada"], base: ["Base"], telescopagem: ["Telescopagem"] } },
  { aba: "Contra-Peso", componente: "contrapeso", cond: { lanca_m: ["Tamanho lança", "Lança"] } },
  { aba: "Cabine", componente: "cabine", cond: {} },
];
for (const def of ABAS_REGRA) {
  const nomeAba = acharAba(baseDados.wb, def.aba);
  if (!nomeAba) { avisar("aba não encontrada", baseDados.arq, "", def.aba); continue; }
  const rows = linhas(baseDados.wb, nomeAba);
  const cab = (rows[0] || []).map(txt);
  const col = (...nomes) => cab.findIndex(h => nomes.some(n => normNome(h) === normNome(n)));
  const cG = col("Grua"), cCod = col("Código"), cF = col("Fator de uso"), cPai = col("Pai"),
        cEmb = col("Espaço embaixo"), cTipo = col("Tipo de carreta");
  let cDesc = col("Descrição");
  if (cDesc < 0 && cCod >= 0 && !cab[cCod + 1]) {
    cDesc = cCod + 1;
    avisar("coluna sem título", `${baseDados.arq} → '${nomeAba}'`, "", `descrição lida da coluna ${letra(cDesc)} (título em branco)`);
  }
  const cConds = Object.fromEntries(Object.entries(def.cond).map(([campo, nomes]) => [campo, col(...nomes)]));
  const usadas = new Set([cG, cCod, cF, cPai, cEmb, cTipo, cDesc, ...Object.values(cConds)].filter(i => i >= 0));

  rows.forEach((r, i) => {
    if (i === 0 || !txt(r[cG]) || !txt(r[cCod])) return;
    const onde = `${def.aba}!${i + 1}`;
    const modelo = modeloDe(r[cG], onde);
    const k = verPeca(r[cCod], onde);
    if (cDesc >= 0) valorPeca(k, "descricao", txt(r[cDesc]), onde);
    if (cEmb >= 0 && num(r[cEmb]) === 1) valorPeca(k, "vai_embaixo", true, onde);
    if (cTipo >= 0 && txt(r[cTipo])) valorPeca(k, "veiculo_exigido", txt(r[cTipo]), onde);
    const quantidade = num(r[cF]);
    if (!(quantidade > 0)) { avisar("fator de uso vazio ou zero", onde, txt(r[cCod]), `"${txt(r[cF])}" (linha ignorada)`); return; }
    const c = {};
    for (const [campo, j] of Object.entries(cConds)) {
      if (j < 0) { c[campo] = null; continue; }
      if (campo === "base") c[campo] = txt(r[j]) || null;
      else if (campo === "telescopagem") c[campo] = simNao(r[j]);
      else {
        c[campo] = num(r[j]);
        if (c[campo] == null && txt(r[j])) avisar("condição não numérica", onde, txt(r[cCod]), `${campo} = "${txt(r[j])}"`);
      }
    }
    if (c.base) bases.add(`${modelo}\u0000${c.base}`);
    const paiBruto = cPai >= 0 ? txt(r[cPai]) : "";
    const pai = paiBruto ? verPeca(paiBruto, `${onde} (pai)`) : null;
    const extra = {};
    r.forEach((v, j) => { if (!usadas.has(j) && txt(v) !== "") extra[cab[j] || letra(j)] = v; });
    emitir("config_regras", COLS_REGRA, {
      modelo, componente: def.componente, lanca_m: c.lanca_m ?? null, altura_m: c.altura_m ?? null, base: c.base ?? null,
      telescopagem: c.telescopagem ?? null, lastro_t: c.lastro_t ?? null, codigo: k, quantidade, pai,
      ordem: i + 1, origem: onde, extra,
    });
  });
}
[...bases].sort().forEach(s => { const [modelo, base] = s.split("\u0000"); emitir("bases", ["modelo", "base"], { modelo, base }); });

// ---------- Peças: um valor por campo ----------
const VEICULOS = ["Bitruck", "Carreta 12 m", "Carreta 15 m", "Prancha"];
const linhasPecas = [];
for (const [k, p] of pecas) {
  let veiculo = escolher(k, "veiculo_exigido");
  if (veiculo) {
    const v = VEICULOS.find(n => normNome(n) === normNome(veiculo) || normNome(n).startsWith(normNome(veiculo)));
    if (!v) avisar("veículo desconhecido", "", p.exib, `"${veiculo}" (deixado em branco)`);
    veiculo = v || null;
  }
  const o = {
    codigo: k, codigo_exibicao: p.exib, descricao: escolher(k, "descricao", true), peso_kg: escolher(k, "peso_kg"),
    comp_m: escolher(k, "comp_m"), preco_padrao: escolher(k, "preco_padrao"),
    valor_unitario: escolher(k, "valor_unitario"), sapiens_produto: escolher(k, "sapiens_produto"),
    sapiens_derivacao: escolher(k, "sapiens_derivacao"), veiculo_exigido: veiculo,
    vai_embaixo: escolher(k, "vai_embaixo") === true,
  };
  if (o.peso_kg == null) avisar("peça sem peso", "", p.exib, o.descricao || "");
  if (o.comp_m == null) avisar("peça sem comprimento", "", p.exib, o.descricao || "");
  if (o.preco_padrao == null && o.valor_unitario == null) avisar("peça sem preço", "", p.exib, o.descricao || "");
  linhasPecas.push(o);
}

// Pendências: os avisos de cada código vão para a coluna "pendencias" da peça (aparecem na tela Cadastros)
const porCodigo = new Map();   // codigo → Map(texto → [lugares])
for (const a of avisos) {
  const k = a.codigo && chavePeca(a.codigo);
  if (!k || !pecas.has(k)) continue;
  const semDetalhe = a.tipo.startsWith("peça sem");   // o detalhe é só a descrição
  const texto = semDetalhe || !a.detalhe ? a.tipo : `${a.tipo}: ${a.detalhe}`;
  const m = porCodigo.get(k) || porCodigo.set(k, new Map()).get(k);
  m.set(texto, [...(m.get(texto) || []), ...(a.onde ? [a.onde] : [])]);
}
for (const o of linhasPecas) {
  const m = porCodigo.get(o.codigo);
  o.pendencias = m ? [...m].map(([t, l]) => l.length ? `${t} [${l.slice(0, 3).join("; ")}${l.length > 3 ? ` e mais ${l.length - 3}` : ""}]` : t).join(" | ") : "";
  emitir("pecas", Object.keys(o), o);
}

// ---------- Escrita ----------
fs.mkdirSync(SAIDA, { recursive: true });
// Um CSV por tabela de carga (carga_*): importar no Table Editor e rodar aplicar_carga_envio()
const ORDEM = ["modelos", "pecas", "bases", "config_regras"];
console.log(`Arquivos em ${SAIDA}: importe cada um na tabela de mesmo nome (schema estoque) e depois rode`);
console.log("  select estoque.aplicar_carga_envio();   (só atualiza: o que foi editado no app fica)");
for (const t of ORDEM.filter(t => saidas[t])) {
  const { colunas, linhas: ls } = saidas[t];
  fs.writeFileSync(path.join(SAIDA, `carga_${t}.csv`), [colunas, ...ls].map(l => l.map(csvCampo).join(",")).join("\n") + "\n", "utf8");
  console.log(`  carga_${t}.csv: ${ls.length} linhas`);
}
// Uma linha por (tipo, código, detalhe), com os lugares onde aparece (o mesmo problema se repete por altura/lança)
const agrupados = new Map();
for (const a of avisos) {
  const k = `${a.tipo}\u0000${a.codigo}\u0000${a.detalhe}`;
  if (!agrupados.has(k)) agrupados.set(k, { ...a, lugares: [] });
  if (a.onde) agrupados.get(k).lugares.push(a.onde);
}
const unicos = [...agrupados.values()].sort((a, b) => a.tipo.localeCompare(b.tipo) || a.codigo.localeCompare(b.codigo));
const ondeResumo = l => l.length <= 3 ? l.join("; ") : `${l.slice(0, 3).join("; ")} e mais ${l.length - 3}`;
fs.writeFileSync(path.join(SAIDA, "inconsistencias.csv"),
  ["tipo,codigo,detalhe,ocorrencias,onde", ...unicos.map(a =>
    [a.tipo, a.codigo, a.detalhe, a.lugares.length || 1, ondeResumo(a.lugares)].map(csvCampo).join(","))].join("\n") + "\n", "utf8");
const porTipo = unicos.reduce((m, a) => (m[a.tipo] = (m[a.tipo] || 0) + 1, m), {});
console.log(`\nInconsistências (${unicos.length} itens, ${avisos.length} ocorrências) em inconsistencias.csv:`);
Object.entries(porTipo).sort((a, b) => b[1] - a[1]).forEach(([t, n]) => console.log(`  ${String(n).padStart(4)}  ${t}`));
console.log("\nVeículos: a migration já cria Bitruck, Carreta 12 m, Carreta 15 m e Prancha; preencha comprimento útil e carga máxima.");
