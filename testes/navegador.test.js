// Teste do app no navegador (Playwright), com os Apps Scripts simulados:
//   node testes/navegador.test.js
// Sobe um servidor local para index.html/app.js/style.css e intercepta script.google.com.
// Fluxo: Cadastro de peça inexistente → ajuste com pergunta "outro desenho?" → Equipamento.
const assert = require("assert");
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const { criarMock } = require("./mock-consolidado");

const RAIZ = path.join(__dirname, "..");
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const servidor = http.createServer((req, res) => {
  const arq = path.join(RAIZ, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TIPOS[path.extname(arq)] || "application/octet-stream" });
  fs.createReadStream(arq).pipe(res);
});

(async () => {
  await new Promise(r => servidor.listen(0, r));
  const url = `http://localhost:${servidor.address().port}/index.html`;
  const m = criarMock();
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => localStorage.setItem("ce_auth", JSON.stringify({ user: "real", pass: "x" })));
    const page = await ctx.newPage();
    const erros = [];
    page.on("pageerror", e => erros.push(e.message));
    page.on("dialog", d => d.dismiss());
    // Inventário simulado: inventários 5 e 6, duas vigas (código "V.") e uma peça comum
    const LINHAS = [
      { row: 1902, numInv: "6", campo1: "V.I.T.324.4000.0.0-01", campo2: "1", loc: "2", rua: "", andar: "", dataHora: "2026-11-04 10:00:00", usuario: "real" },
      { row: 1900, numInv: "5", campo1: "V.V.T.226.5100.60.60-02", campo2: "2", loc: "3", rua: "", andar: "", dataHora: "2026-11-04 09:37:48", usuario: "real" },
      { row: 1901, numInv: "5", campo1: "146000231", campo2: "1103", loc: "1", rua: "A", andar: "2", dataHora: "2026-11-04 09:40:00", usuario: "real" },
    ];
    const INV_RESUMO = { ok: true, numinvs: [{ numInv: "5", registros: 2 }, { numInv: "6", registros: 1 }],
      chaves: { "V.V.T.226.5100.60.60-02|2": { "5": 1900 }, "V.I.T.324.4000.0.0-01|1": { "6": 1899 }, "146000231|1103": { "5": 1901 } } };
    const PEDIDOS_LINHAS = [];
    await ctx.route("https://unpkg.com/**", r => r.fulfill({ body: "", contentType: "text/javascript" }));
    await ctx.route("https://script.google.com/**", r => {
      const u = new URL(r.request().url()); const p = Object.fromEntries(u.searchParams);
      const inventario = { log_mov: { ok: true, appended: true, row: 90, sheet: "Mov", dataHora: "x" }, ultimo_numinv: { ok: true, numInv: "5" }, inv_resumo: INV_RESUMO,
        linhas_inv: { ok: true, itens: LINHAS.filter(l => String(p.numinvs || "").split(",").includes(l.numInv)), total: 0 } };
      inventario.linhas_inv.total = inventario.linhas_inv.itens.length;
      if (p.mode === "linhas_inv") PEDIDOS_LINHAS.push(p.numinvs);
      const body = u.pathname.includes("AKfycbxClcs2") ? (inventario[p.mode] || { ok: true }) : m.q(p);
      r.fulfill({ body: JSON.stringify(body), contentType: "application/json" });
    });
    await ctx.route("https://*.supabase.co/**", r => r.fulfill({ status: 503, body: '{"ok":false}', contentType: "application/json" }));
    await page.goto(url);

    const registrar = async (c9, id) => {
      await page.evaluate(() => showScreen("cadastro"));
      await page.uncheck("#gps-check");
      await page.fill("#campo1_cad", c9); await page.fill("#campo2_cad", id);
      await page.click("#btn-registrar");
      await page.locator("#cad-mc button").click();
      await page.waitForFunction(() => !document.getElementById("aj-gt").disabled && document.getElementById("aj-gt").options.length > 1);
      await page.selectOption("#aj-gt", "GT-26");
    };
    const podeGravar = () => page.$eval("#aj-gravar", e => !e.disabled);

    // A) peça nova de outro desenho substituindo a Lança 5
    await registrar("777000009", "1");
    await page.fill("#aj-posicao input[type=search]", "lança 5");
    await page.locator("#aj-posicao .aj-opcao").first().click();
    await page.locator("#aj-ids .aj-opcao").first().click();
    assert.match(await page.textContent("#aj-compat .campo-label"), /outro desenho, compatível com LANÇA 5/);
    assert.ok(!(await podeGravar()), "sem resposta não grava");
    await page.locator("#aj-compat .aj-opcao").first().click(); // Sim
    await page.fill("#aj-compat-codigo", "051.001-632.111");
    assert.match(await page.textContent("#aj-compat .eq-compat-msg"), /mesmo desenho/);
    assert.ok(!(await podeGravar()));
    await page.fill("#aj-compat-codigo", "051.001-631.111");
    assert.ok(await podeGravar());
    await page.click("#aj-gravar");
    await page.waitForFunction(() => /Ajuste gravado/.test(document.getElementById("aj-status").textContent));
    assert.match(await page.textContent("#aj-status"), /Compatível C051.001-631.111 gravado na RELAÇÃO/);
    const l5 = m.aba("280 EC-H 12 Litronic").rows.find(r => r[7] === "C051.001-632.111");
    assert.strictEqual(l5[2], "C051.001-631.111");
    assert.strictEqual(m.abas.AJUSTE.rows.at(-1)[12], "C051.001-631.111");
    console.log("ok - ajuste com outro desenho grava o compatível");

    // B) código 9 conhecido do mesmo desenho: sem pergunta
    await registrar("146000035", "4444");
    await page.locator("#aj-ids .aj-opcao").first().click();
    assert.ok(!(await page.isVisible("#aj-compat")) && await podeGravar());
    console.log("ok - mesmo desenho não pergunta");

    // C) inclusão: sem pergunta
    await page.click(".aj-opcao-inclusao");
    assert.ok(!(await page.isVisible("#aj-compat")) && await podeGravar());
    console.log("ok - inclusão não pergunta");

    // D) Equipamento mostra o compatível novo; E) compatível sem machine card
    await page.evaluate(() => showScreen("equipamento"));
    await page.waitForFunction(() => document.getElementById("eq-grua").options.length > 1);
    await page.selectOption("#eq-grua", "280 EC-H 12 Litronic");
    await page.waitForFunction(() => document.getElementById("eq-gt").options.length > 1);
    await page.selectOption("#eq-gt", "GT-26");
    await page.waitForFunction(() => document.getElementById("eq-lanca").options.length > 1);
    await page.selectOption("#eq-lanca", "75m");
    const item = (txt) => page.locator("#eq-lista .eq-item").filter({ hasText: txt }).first();
    await item("LANÇA 5").waitFor();
    assert.match(await item("LANÇA 5").locator(".eq-item-codigo").textContent(), /compatível: C051.001-631.111/);
    console.log("ok - Equipamento mostra o compatível");
    await item("LANÇA 6").locator(".eq-compat-btn").click();
    await page.fill(".eq-compat-painel input", "C051.001-699.111");
    await page.click(".eq-compat-painel .eq-compat-ok");
    await page.waitForFunction(() => /Machine Card/.test(document.querySelector(".eq-compat-msg")?.textContent || ""));
    console.log("ok - compatível sem machine card pede novo cadastro");

    // F) Consulta: gruas aplicáveis com compatíveis e ajuste
    await page.evaluate(() => showScreen("consulta"));
    await page.fill("#campo1", "146000042"); await page.fill("#campo2", "");
    await page.click("#btn-consultar-consulta");
    await page.waitForFunction(() => /Compatíveis/.test(document.getElementById("gruas-aplicaveis").value));
    assert.match(await page.inputValue("#gruas-aplicaveis"), /Aplicações \(M\): GT-26\nCompatíveis: GT-09 → C051.001-631.111/);
    await page.fill("#campo1", "958152101");
    await page.click("#btn-consultar-consulta");
    await page.waitForFunction(() => /Por ajuste/.test(document.getElementById("gruas-aplicaveis").value));
    assert.match(await page.inputValue("#gruas-aplicaveis"), /Por ajuste: GT-13 \(inclusão\)/);
    console.log("ok - Consulta mostra compatíveis e ajustes");

    // H) Consultar Inventário: marca vários inventários → todas as linhas, em ordem de linha
    await page.evaluate(() => showScreen("inventario"));
    await page.waitForFunction(() => document.querySelectorAll("#invsel-opcoes input").length === 2);
    await page.click("#invsel summary");
    await page.check('#invsel-opcoes input[value="5"]');
    await page.waitForFunction(() => document.querySelectorAll("#invsel-lista .item-inv").length === 2);
    await page.check('#invsel-opcoes input[value="6"]');
    await page.waitForFunction(() => document.querySelectorAll("#invsel-lista .item-inv").length === 3);
    const linhas = await page.$$eval("#invsel-lista .item-inv", bs => bs.map(b => b.textContent.match(/^Linha (\d+)/)[1]));
    assert.deepStrictEqual(linhas, ["1900", "1901", "1902"]);
    assert.strictEqual(PEDIDOS_LINHAS.at(-1), "5,6");
    assert.match(await page.textContent("#invsel-status"), /3 linha\(s\) no\(s\) inventário\(s\) 5, 6/);
    await page.locator("#invsel-lista .item-inv").nth(1).click();
    assert.strictEqual(await page.inputValue("#linha_consulta"), "1901");
    assert.strictEqual(await page.locator("#invsel-lista .item-inv").count(), 3, "abrir uma linha não refaz a lista");
    console.log("ok - Consultar Inventário: vários inventários, linhas em ordem");

    // I) Acessórios → Vigas: só códigos "V.", linha mais recente primeiro, filtro e verde/vermelho por inventário
    await page.evaluate(() => showScreen("acessorios"));
    await page.waitForFunction(() => document.querySelectorAll("#vg-lista .eq-item").length === 2);
    const vigas = await page.$$eval("#vg-lista .eq-item-titulo", ts => ts.map(t => t.textContent));
    assert.deepStrictEqual(vigas, ["V.V.T.226.5100.60.60-02", "V.I.T.324.4000.0.0-01"]);
    assert.match(await page.textContent("#vg-lista"), /Inventário\(s\): 5 · linha 1900/);
    assert.match(await page.textContent("#vg-lista"), /Viga completa · Tubular · Ø 226 mm · 5100 mm · furos 60\/60/);
    await page.click("#vg-inv summary");
    await page.check('#vg-inv-opcoes input[value="5"]');
    assert.strictEqual(await page.locator("#vg-lista .eq-item-ok").count(), 1);
    assert.strictEqual(await page.locator("#vg-lista .eq-item-falta").count(), 1);
    await page.selectOption("#vg-tipo", "I");
    assert.strictEqual(await page.locator("#vg-lista .eq-item").count(), 1);
    assert.match(await page.textContent("#vg-status"), /1 de 2 viga\(s\) · 0 registrada/);
    await page.selectOption("#vg-tipo", "");
    await page.locator("#vg-lista .vg-id").first().click();
    assert.strictEqual(await page.inputValue("#campo1"), "V.V.T.226.5100.60.60-02");
    assert.strictEqual(await page.inputValue("#campo2"), "2");
    console.log("ok - Acessórios: vigas em ordem, filtro, inventário e consulta");

    // G) usuário consulta: menu só Consulta e Equipamento, sem "+ Inserir compatível"
    const pc = await ctx.newPage();
    pc.on("pageerror", e => erros.push(e.message));
    await pc.addInitScript(() => localStorage.setItem("ce_auth", JSON.stringify({ user: "consulta", pass: "y" })));
    await pc.goto(url);
    const visiveis = await pc.$$eval(".nav button", bs => bs.filter(b => !b.hidden).map(b => b.dataset.screen));
    assert.deepStrictEqual(visiveis, ["consulta", "equipamento", "acessorios"]);
    await pc.evaluate(() => showScreen("equipamento"));
    await pc.waitForFunction(() => document.getElementById("eq-grua").options.length > 1);
    await pc.selectOption("#eq-grua", "280 EC-H 12 Litronic");
    await pc.waitForFunction(() => document.getElementById("eq-gt").options.length > 1);
    await pc.selectOption("#eq-gt", "GT-26");
    await pc.waitForFunction(() => document.getElementById("eq-lanca").options.length > 1);
    await pc.selectOption("#eq-lanca", "75m");
    await pc.locator("#eq-lista .eq-item").first().waitFor();
    assert.strictEqual(await pc.locator(".eq-compat-btn").count(), 0);
    console.log("ok - usuário consulta: só Consulta e Equipamento, sem inserir compatível");

    assert.deepStrictEqual(erros, [], "erros de JavaScript na página");
    console.log("\nnavegador OK");
  } finally {
    await b.close();
    servidor.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
