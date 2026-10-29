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
    await page.route("https://unpkg.com/**", r => r.fulfill({ body: "", contentType: "text/javascript" }));
    await page.route("https://script.google.com/**", r => {
      const u = new URL(r.request().url()); const p = Object.fromEntries(u.searchParams);
      const inventario = { log_mov: { ok: true, appended: true, row: 90, sheet: "Mov", dataHora: "x" }, ultimo_numinv: { ok: true, numInv: "5" }, inv_resumo: { ok: true, numinvs: [], chaves: {} } };
      const body = u.pathname.includes("AKfycbxClcs2") ? (inventario[p.mode] || { ok: true }) : m.q(p);
      r.fulfill({ body: JSON.stringify(body), contentType: "application/json" });
    });
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

    assert.deepStrictEqual(erros, [], "erros de JavaScript na página");
    console.log("\nnavegador OK");
  } finally {
    await b.close();
    servidor.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
