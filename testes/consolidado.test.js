// Testes do script do Consolidado (sem Google): node testes/consolidado.test.js
const assert = require("assert");
const { criarMock } = require("./mock-consolidado");

const m = criarMock();
const MODELO = "280 EC-H 12 Litronic";
const linha = (cod) => { const sh = m.aba(MODELO); return sh.rows[sh.rows.findIndex(r => r[7] === cod)]; };
const ajuste = (x) => m.q(Object.assign({ mode: "gravar_ajuste", gt: "GT-26" }, x));
let n = 0;
const ok = (nome, fn) => { fn(); n++; console.log("ok -", nome); };

ok("diag responde sem login", () => {
  const j = m.q({ mode: "diag", user: "", pass: "" });
  assert.ok(j.ok && /^v\d/.test(j.version));
});

ok("login errado é recusado", () => {
  assert.ok(!m.q({ mode: "gruas_lista", pass: "errada" }).ok);
});

ok("gruas_lista e gts_todos", () => {
  assert.ok(m.q({ mode: "gruas_lista" }).gruas.includes(MODELO));
  assert.ok(m.q({ mode: "gts_todos" }).gts.some(g => g.gt === "GT-26" && g.modelo === MODELO));
});

ok("lancas_grua lê compatíveis (C–F) e comprimentos de lança", () => {
  const j = m.q({ mode: "lancas_grua", grua: MODELO });
  assert.ok(j.lancas.includes("75m"));
  const l4 = j.itens.find(i => i.codigo === "C051.043-629.111");
  assert.deepStrictEqual(l4.compat, ["C051.001-631.111"]);
});

ok("gruas: diretos, compatíveis (linha da RELAÇÃO, nos dois sentidos) e por ajuste", () => {
  const m0 = criarMock();   // antes dos ajustes dos testes abaixo
  const j = m0.q({ mode: "gruas", h: "146000042" });            // LANÇA 4 C051.043-629.111
  assert.deepStrictEqual(j.gruasM, ["GT-26"]);
  assert.deepStrictEqual(j.compat, [{ gt: "GT-09", codigoC: "C051.001-631.111", codigo9: "146000099" }]);
  const r = m0.q({ mode: "gruas", h: "146000099" });            // o compatível aponta de volta para o principal
  assert.deepStrictEqual(r.compat.map(x => x.gt + " " + x.codigoC), ["GT-26 C051.043-629.111"]);
  const a = m0.q({ mode: "gruas", h: "958152101" });            // LANÇA 8: GT-26 direto, GT-13 por inclusão
  assert.deepStrictEqual(a.gruasM, ["GT-26"]);
  assert.deepStrictEqual(a.ajustes, [{ gt: "GT-13", posicao: "C051.001-634.111", inclusao: true }]);
  assert.deepStrictEqual(m0.q({ mode: "gruas", h: "146000231" }).compat, []);
});

ok("compatível pelo código 9 de 8 dígitos → GT-13 passa a aparecer em gruas", () => {
  const m0 = criarMock();
  const p = { grua: MODELO, gt: "GT-26", codigo: "C051.043-629.111", entrada: "90009999" };
  const pr = m0.q(Object.assign({ mode: "compat_previa" }, p));
  assert.ok(pr.ok && pr.novo.codigoC === "C051.023-629.111", JSON.stringify(pr));
  assert.ok(m0.q(Object.assign({ mode: "compat_inserir" }, p)).gravado);
  const j = m0.q({ mode: "gruas", h: "146000042" });
  assert.ok(j.compat.some(x => x.gt === "GT-13" && x.codigoC === "C051.023-629.111"), JSON.stringify(j.compat));
});

ok("compatível sem machine card → mensagem de novo cadastro", () => {
  const j = m.q({ mode: "compat_previa", grua: MODELO, gt: "GT-26", codigo: "C051.043-629.111", entrada: "C051.001-699.111" });
  assert.strictEqual(j.error, "Não localizamos o código compatível pelo Machine Card. Necessário um novo cadastro de peça.");
});

const base = { posicao: "C051.001-632.111", descricao: "LANÇA 5", c9_antigo: "146000035", id_antigo: "1300", c9_novo: "777000001", id_novo: "5" };

ok("ajuste com compat=1 exige o Código C", () => {
  assert.ok(ajuste(Object.assign({ compat: "1" }, base)).error);
});

ok("ajuste com compat=1 recusa o mesmo desenho da posição", () => {
  assert.ok(ajuste(Object.assign({ compat: "1", codigo_c_novo: "051.001-632.111" }, base)).error);
});

ok("ajuste + compatível novo: grava AJUSTE (coluna M) e RELAÇÃO (1ª COMPATÍVEL vazia)", () => {
  const antes = m.abas.AJUSTE.rows.length;
  const j = ajuste(Object.assign({ compat: "1", codigo_c_novo: "051.001-631.111" }, base));
  assert.ok(j.ok && j.compat && j.compat.gravado, JSON.stringify(j));
  assert.strictEqual(j.codigoCNovo, "C051.001-631.111");
  assert.deepStrictEqual(linha("C051.001-632.111").slice(2, 6), ["C051.001-631.111", "", "", ""]);
  assert.ok(/via ajuste/.test(m.notas().slice(-1)[0]));
  assert.strictEqual(m.abas.AJUSTE.rows[0][12], "CODIGO C NOVO");
  assert.strictEqual(m.abas.AJUSTE.rows.length, antes + 1);
  assert.strictEqual(m.abas.AJUSTE.rows.at(-1)[12], "C051.001-631.111");
});

ok("compatível que já existia não é duplicado", () => {
  const j = ajuste({ posicao: "C051.043-629.111", c9_antigo: "146000042", id_antigo: "1201", c9_novo: "777000002", id_novo: "6", compat: "1", codigo_c_novo: "C051001631111" });
  assert.ok(j.ok && j.compat.jaExistia, JSON.stringify(j));
});

ok("resposta Não: CODIGO C NOVO = posição", () => {
  const j = ajuste({ posicao: "C051.023-611.111", c9_antigo: "146000231", id_antigo: "1103", c9_novo: "146000231", id_novo: "9001", compat: "0" });
  assert.strictEqual(j.codigoCNovo, "C051.023-611.111");
});

ok("inclusão: CODIGO C NOVO = posição", () => {
  const j = ajuste({ tipo: "inclusao", gt: "GT-13", posicao: "C051.001-635.111", c9_novo: "777000003", id_novo: "7" });
  assert.ok(j.ok, JSON.stringify(j));
  assert.strictEqual(j.codigoCNovo, "C051.001-635.111");
});

ok("verificar_peca conhece o código 9 do ajuste com o desenho real e a posição", () => {
  const c = m.q({ mode: "verificar_peca", codigo9: "777000001", id: "99" }).conhecido;
  assert.ok(c.some(x => x.codigoC === "C051.001-631.111" && x.posicao === "C051.001-632.111"), JSON.stringify(c));
});

ok("machinecards_por_gt traz o ajuste junto do ID de fábrica", () => {
  const mapa = m.q({ mode: "machinecards_por_gt", gt: "GT-26" }).mapa;
  const fab = (mapa["C051001632111"] || []).find(x => String(x.id) === "1300");
  assert.ok(fab && fab.ajuste && fab.ajuste.id === "5", JSON.stringify(mapa["C051001632111"]));
});

ok("compatíveis lotados: nada é gravado", () => {
  const l = linha("C051.001-632.111"); l[3] = "X1"; l[4] = "X2"; l[5] = "X3";
  const antes = m.abas.AJUSTE.rows.length;
  const j = ajuste(Object.assign({}, base, { c9_novo: "777000004", id_novo: "8", compat: "1", codigo_c_novo: "C051001640111" }));
  assert.ok(j.error);
  assert.strictEqual(m.abas.AJUSTE.rows.length, antes);
});

ok("exata e patrimonio_por_h trazem a peça incluída por ajuste (GT-13)", () => {
  const m0 = criarMock();
  assert.strictEqual(m0.q({ mode: "exata", h: "958152101", k: "993" }).exata, "GT-13");
  assert.strictEqual(m0.q({ mode: "exata", h: "958152101", k: "120" }).exata, "GT-26");   // fábrica continua
  const mapa = m0.q({ mode: "patrimonio_por_h", h: "958152101" }).mapa;
  assert.strictEqual(mapa["993"], "GT-13");
  assert.strictEqual(mapa["120"], "GT-26");
});

ok("usuário consulta lê, mas não grava compatível nem ajuste", () => {
  const m0 = criarMock();
  const c = (p) => m0.q(Object.assign({ user: "consulta", pass: "y" }, p));
  assert.ok(c({ mode: "gruas", h: "146000042" }).ok);
  assert.ok(c({ mode: "lancas_grua", grua: MODELO }).ok);
  const antesRel = JSON.stringify(m0.aba(MODELO).rows), antesAj = m0.abas.AJUSTE.rows.length;
  const ci = c({ mode: "compat_inserir", grua: MODELO, gt: "GT-26", codigo: "C051.043-629.111", entrada: "90009999" });
  assert.ok(!ci.ok && ci.semPermissao && ci.auth !== false, JSON.stringify(ci));
  const ga = c(Object.assign({ mode: "gravar_ajuste", gt: "GT-26" }, base));
  assert.ok(!ga.ok && ga.semPermissao, JSON.stringify(ga));
  assert.strictEqual(JSON.stringify(m0.aba(MODELO).rows), antesRel);
  assert.strictEqual(m0.abas.AJUSTE.rows.length, antesAj);
});

console.log(`\n${n} testes OK`);
