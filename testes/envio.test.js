// Teste do conversor do envio de grua (migracao/envio.mjs):
//   node testes/envio.test.js
// Monta, com dados inventados, uma RELAÇÃO "com preço", uma Base de Dados Grua e um Consolidado, e confere
// os CSVs e o relatório de inconsistências.
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const { execFileSync } = require("child_process");
const XLSX = require("xlsx");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "envio-"));
function livro(arq, abas) {
  const wb = XLSX.utils.book_new();
  Object.entries(abas).forEach(([n, rows]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), n));
  XLSX.writeFile(wb, path.join(tmp, arq));
  return path.join(tmp, arq);
}

// RELAÇÃO: cabeçalho na linha 2, linha 3 = a grua (R$/kg), títulos de grupo sem código
const cabRel = ["", "DESCRIÇÃO", "O.", "R.", "D.", "Fator de uso", "PREÇO PADRÃO", "CÓDIGO LBR", "PESO", "COMPRIMENTO",
                "PREÇO ESTRUT. METÁLICA - R$/KG", "PRODUTO", "DERIVAÇÃO", "VALOR UNITÁRIO"];
const relacao = livro("relacao.xlsx", {
  "GRUA": [["qualquer"]],
  "Grua X 10": [
    ["", "Grua X 10"], cabRel,
    ["", "GUINDASTE X", "", "", "", "", "", "", "", "", 100],
    ["", "LANÇA"],
    ["", "LANÇA 1 - PÉ", 1, 0, 1, 1, 310000, "C051.023-611.111", 3100, 12, "", 146000231, 1, 310000],
    ["", "LANÇA 2", 1, 0, 1, 1, 200000, "C051.001-621.111", 2000, 10, "", 146000036, "001", 200000],
    ["", "TORRE"],
    ["", "ELEMENTO DE TORRE 4,14M", 1, 0, 1, "", 230000, "C028.047-332.111", 2300, 4.14, "", 146000104, 1, 230000],
    ["", "CONTRA-PESO A", 1, 0, 1, "", 1125, "C028.006-718.320", 2250, 2555, "", 146000043, 1, 1125],
    ["", "CABINE", 1, 0, 1, "", 900000, "C051.045-411.000", 10120, 5.49, "", 146000309, 1, 900000],
    ["", "ELEMENTO TORRE CARRO INFERIOR", 1, 0, 1, "", 1, "C028.097-312.111/ C028.047-312.111", 2550, 3.73, "", "", "", 1],
  ],
  "Grua Y 20": [
    ["", "Grua Y 20"], cabRel,
    ["", "GUINDASTE Y", "", "", "", "", "", "", "", "", 200],
    ["", "LANÇA"],
    ["", "LANÇA 1 - PÉ", 1, 0, 1, 1, 620000, "C051.023-611.111", 3100, 12, "", 146000231, 1, 620000],
    ["", "LANÇA 2 (peso diferente)", 1, 0, 1, 1, 420000, "C051.001-621.111", 2100, 10, "", 146000036, 1, 420000],
    ["", "TORRE"],
    ["", "ELEMENTO DE TORRE 4,14M", 1, 0, 1, "", 460000, "C028.047-332.111", 2300, 4.14, "", 146000104, 1, 460000],
    ["", "PEÇA COM PREÇO NEGATIVO", 1, 0, 1, "", -5, "C041.001-621.111", 100, 1, "", "", "", -5],
  ],
});

const baseDados = livro("base.xlsx", {
  "Lanças": [
    ["", "Grua", "Lança", "Código", "Descrição", "Fator de uso", "Pai", "Telescopagem", "Digite 1 para o Pai", "Tipo de carreta", "Espaço embaixo", "."],
    ["", "Grua X 10", 50, "C051.023-611.111", "LANÇA 1 - PÉ", 1, "", "", 1, "", "", 2],
    ["", "Grua X 10", "50m", "C051.001-621.111", "LANÇA 2", 2, "", "", 1],
    ["", "Grua X 10 ", 50, "C051.001-812.111", "TIRANTE DA LANÇA", 2, "C051.001-621.111"],
    ["", "Grua X 10", 45, "C051.023-611.111", "LANÇA 1 - PÉ", 0],
  ],
  "Altura": [
    ["", "GRUA", "Altura", "Código", "Descrição", "Fator de uso", "Pai", "Telescopagem", "Nº 1 para o pai", "Tipo de carreta", "Espaço embaixo", "Espaço comprimento ", "Posição", "Base", "Base torre"],
    ["", "Grua X 10", "20,7", "C028.047-332.111", "ELEMENTO DE TORRE 4,14M", 5, "", "NÃO", 4, "", 1, "", "", "CHUMBADOR  X ", ""],
    ["", "Grua X 10", 20.7, "954102201", "BANDA 1 - FRENTE", 1, "", "SIM", 1, "", "", "", "", "CHUMBADOR X"],
    ["", "Grua X 10", 20.7, "933093001", "PASSARELA", 1, "954102201", "SIM", "", "", "", "", "", "CHUMBADOR X"],
  ],
  "Base": [
    ["", "Grua", "Código", "", "Fator de uso", "Base", "", "", "Nº da Carreta ", "Tipo de carreta", "Espaço embaixo"],
    ["", "Grua X 10", "C028.097-312.111/ C028.047-312.111", "ELEMENTO TORRE CARRO INFERIOR", 1, "CARRO INFERIOR X", "", "", 1],
  ],
  "Lastro": [
    ["", "Grua", "Tolenada", "Código", "Descrição", "Fator de uso", ".", "Telescopagem", "N° 1 para o pai", "Tipo de carreta", "Base"],
    ["", "Grua X 10", "10,8", "C028.058-318.411", "LASTRO A", 2, "", "", 1, "", "CARRO INFERIOR X"],
  ],
  "Contra-Peso": [
    ["", "Grua", "Tamanho lança", "Código", "Descrição", "Fator de uso"],
    ["", "Grua X 10", 50, "C028.006-718.320", "CONTRA-PESO A", 7],
  ],
  "Cabine": [
    ["", "Grua", "", "Código", "Descrição", "Fator de uso", "", "", "", "Tipo de carreta", "Qt. Carreta"],
    ["", "Grua X 10", "", "C051.045-411.000", "CABINE", 1, "", "", "", "Prancha", 1],
    ["", "Grua Z 99", "", "WIW300VZ401", "MECANISMO DE ELEVAÇÃO", 1, "", "", "", "Prancha", 1],
  ],
});

const consolidado = livro("consolidado.xlsx", {
  "MachineCards Consolidado": [
    Array(13).fill("cab"),
    ["", "", "", "", "", "", "", 954102201, "BANDA 1", "", 7, "C053.007-321.111", "GT-31"],
  ],
});

const saida = path.join(tmp, "saida");
const log = execFileSync(process.execPath, [path.join(__dirname, "..", "migracao", "envio.mjs"), relacao, baseDados, consolidado, "--saida", saida], { encoding: "utf8" });
const csv = t => XLSX.utils.sheet_to_json(XLSX.read(fs.readFileSync(path.join(saida, (t === "inconsistencias" ? t : "carga_" + t) + ".csv"), "utf8"), { type: "string", raw: true }).Sheets.Sheet1, { raw: false, defval: "" });
const avisos = csv("inconsistencias");
const temAviso = (tipo, codigo) => avisos.some(a => a.tipo === tipo && (codigo == null || a.codigo === codigo));

// Modelos
const modelos = csv("modelos");
assert.deepStrictEqual(modelos.map(m => [m.nome, m.preco_kg, m.na_relacao]),
  [["Grua X 10", "100", "true"], ["Grua Y 20", "200", "true"], ["Grua Z 99", "", "false"]]);
assert.ok(temAviso("modelo sem aba na RELAÇÃO"));
console.log("ok - modelos: abas da RELAÇÃO (R$/kg) e modelo só da Base de Dados avisado");

// Peças: uma linha por código, valor mais frequente, mm → m, Sapiens
const pecas = Object.fromEntries(csv("pecas").map(p => [p.codigo, p]));
assert.strictEqual(pecas.C051023611111.codigo_exibicao, "C051.023-611.111");
assert.strictEqual(pecas.C051023611111.sapiens_derivacao, "001", "derivação com 3 dígitos");
assert.strictEqual(pecas.C051001621111.peso_kg, "2000");
assert.ok(temAviso("peso_kg diferente entre abas", "C051.001-621.111"));
assert.strictEqual(pecas.C028006718320.comp_m, "2.555");
assert.ok(temAviso("comprimento em mm?", "C028.006-718.320"));
assert.strictEqual(pecas.C028047332111.vai_embaixo, "true");
assert.strictEqual(pecas.C051045411000.veiculo_exigido, "Prancha");
assert.strictEqual(pecas.WIW300VZ401.veiculo_exigido, "Prancha", "código fora do padrão C");
assert.ok(pecas.C028097312111 && !pecas.C028047312111, "célula com dois códigos: fica o primeiro");
assert.ok(temAviso("dois códigos na célula", "C028.097-312.111"));
assert.ok(pecas.C053007321111 && !pecas["954102201"], "código 9 convertido pela MachineCards");
assert.ok(pecas["933093001"] && temAviso("código 9 no lugar do Código C", "933093001"), "código 9 sem MachineCards fica e é avisado");
assert.ok(temAviso("peça sem peso", "C051.001-812.111"));
console.log("ok - peças: uma por código, conflitos avisados, mm → m, Sapiens, prancha, forro, códigos 9");

// Preço: um por Código C; diferença entre modelos vai para o relatório
assert.strictEqual(pecas.C051045411000.preco_padrao, "900000");
assert.strictEqual(pecas.C051045411000.valor_unitario, "900000");
assert.ok(["310000", "620000"].includes(pecas.C051023611111.preco_padrao));
assert.ok(temAviso("preco_padrao diferente entre abas", "C051.023-611.111"));
assert.ok(temAviso("valor_unitario diferente entre abas", "C051.023-611.111"));
assert.ok(temAviso("peça sem preço", "C051.001-812.111"));
assert.ok(!fs.existsSync(path.join(saida, "carga_pecas_modelo.csv")), "não há mais preço por modelo");
assert.match(pecas.C051023611111.pendencias, /preco_padrao diferente entre abas/, "divergência anotada na peça");
assert.match(pecas.C051001812111.pendencias, /peça sem peso/);
assert.match(pecas.C028097312111.pendencias, /dois códigos na célula/);
assert.strictEqual(pecas.C051045411000.pendencias, "", "peça sem problema fica sem pendência");
assert.strictEqual(pecas.C041001621111.preco_padrao, "", "preço negativo fica em branco");
assert.match(pecas.C041001621111.pendencias, /preço negativo/);
console.log("ok - preço único por Código C, divergências no relatório e na coluna pendencias");

// Regras
const regras = csv("config_regras");
const regra = (comp, cod) => regras.filter(r => r.componente === comp && r.codigo === cod);
const l2 = regra("lanca", "C051001621111");
assert.strictEqual(l2.length, 1); assert.strictEqual(l2[0].lanca_m, "50", '"50m" vira 50'); assert.strictEqual(l2[0].quantidade, "2");
const tir = regra("lanca", "C051001812111")[0];
assert.strictEqual(tir.modelo, "Grua X 10", "nome com espaço sobrando casa com a aba");
assert.strictEqual(tir.pai, "C051001621111");
assert.ok(!regras.some(r => r.componente === "lanca" && r.lanca_m === "45"), "fator zero fica fora");
assert.ok(temAviso("fator de uso vazio ou zero"));
assert.deepStrictEqual(JSON.parse(regra("lanca", "C051023611111")[0].extra), { "Digite 1 para o Pai": 1, ".": 2 }, "colunas sem uso vão para extra");
const t = regra("torre", "C028047332111")[0];
assert.strictEqual(t.altura_m, "20.7"); assert.strictEqual(t.telescopagem, "false"); assert.strictEqual(t.base, "CHUMBADOR X");
assert.strictEqual(JSON.parse(t.extra)["Nº 1 para o pai"], 4);
assert.strictEqual(regra("torre", "933093001")[0].pai, "C053007321111", "pai em código 9 convertido");
assert.strictEqual(regra("lastro", "C028058318411")[0].lastro_t, "10.8");
assert.strictEqual(regra("contrapeso", "C028006718320")[0].lanca_m, "50");
assert.strictEqual(regra("base", "C028097312111")[0].base, "CARRO INFERIOR X");
assert.ok(temAviso("coluna sem título"), "descrição da aba Base lida pela posição, com aviso");
assert.deepStrictEqual(csv("bases").map(b => b.base), ["CARRO INFERIOR X", "CHUMBADOR X"]);
console.log("ok - regras: condições numéricas, telescopagem, base, pai, extra, bases por modelo");

assert.match(log, /Inconsistências \(\d+ itens/);
fs.rmSync(tmp, { recursive: true, force: true });
console.log("\nconversor do envio OK");
