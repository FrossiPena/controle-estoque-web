// Teste da alimentação dupla (fase 1 da migração para o Supabase), no navegador:
//   node testes/duplo.test.js
// Apps Scripts simulados (como no navegador.test.js) + Supabase simulado (Auth e função "espelho").
// O Google é o principal: o espelho só recebe o que o Google aceitou, e falha no Supabase não atrapalha.
const assert = require("assert");
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const { criarMock } = require("./mock-consolidado");

const RAIZ = path.join(__dirname, "..");
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
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

  // Estado dos simulados (cada caso ajusta)
  const S = { googleOk: true, supabaseFora: false, tokenVencido: 0, logins: [], espelho: [] };
  const ate = async (cond, msg) => {
    for (let i = 0; i < 100 && !cond(); i++) await new Promise(r => setTimeout(r, 50));
    assert.ok(cond(), msg);
  };

  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => { if (!localStorage.getItem("ce_auth")) localStorage.setItem("ce_auth", JSON.stringify({ user: "real", pass: "x" })); });
    await ctx.route("https://unpkg.com/**", r => r.fulfill({ body: "", contentType: "text/javascript" }));
    await ctx.route("https://script.google.com/**", r => {
      const u = new URL(r.request().url()); const p = Object.fromEntries(u.searchParams);
      const inventario = {
        log_mov: S.googleOk ? { ok: true, appended: true, row: 90, sheet: "Movimentacoes", dataHora: "2026-11-03 10:20:30" }
                            : { ok: false, error: "servidor ocupado, nada foi gravado; tente de novo" },
        clear_lin: { ok: true, cleared: true, row: Number(p.row) },
        get_lin: { ok: true, row: Number(p.row), data: {} },
        ultimo_numinv: { ok: true, numInv: "5" }, inv_resumo: { ok: true, numinvs: [], chaves: {} },
      };
      const body = u.pathname.includes("AKfycbxClcs2") ? (inventario[p.mode] || { ok: true }) : m.q(p);
      r.fulfill({ body: JSON.stringify(body), contentType: "application/json" });
    });
    await ctx.route("https://*.supabase.co/**", r => {
      const req = r.request(), u = new URL(req.url());
      if (S.supabaseFora) return r.fulfill({ status: 503, body: "indisponível" });
      if (req.method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } });
      const cab = { "Access-Control-Allow-Origin": "*" };
      if (u.pathname === "/auth/v1/token") {
        const corpo = JSON.parse(req.postData());
        S.logins.push(corpo.email);
        return r.fulfill({ headers: cab, contentType: "application/json", body: JSON.stringify({ access_token: "tok" + S.logins.length, expires_in: 3600 }) });
      }
      if (u.pathname === "/functions/v1/espelho") {
        if (S.tokenVencido > 0) { S.tokenVencido--; return r.fulfill({ headers: cab, contentType: "application/json", body: '{"ok":false,"auth":false}' }); }
        const corpo = JSON.parse(req.postData());
        S.espelho.push({ ...corpo, token: req.headers()["authorization"] });
        return r.fulfill({ headers: cab, contentType: "application/json", body: JSON.stringify({ ok: true, detalhe: corpo.modo }) });
      }
      r.fulfill({ status: 404, body: "" });
    });

    const page = await ctx.newPage();
    const erros = [];
    page.on("pageerror", e => erros.push(e.message));
    page.on("dialog", d => d.dismiss());   // "Deseja adicionar fotos?" → não; "Deletar linha?" é aceito abaixo
    await page.goto(url);

    const registrar = async (c9, id) => {
      await page.evaluate(() => showScreen("cadastro"));
      await page.uncheck("#gps-check");
      await page.fill("#campo1_cad", c9); await page.fill("#campo2_cad", id);
      await page.fill("#obs-input", "obs teste");
      await page.click("#btn-registrar");
      await page.waitForFunction(() => /Registrado|Falha|ocupado/.test(document.getElementById("status-msg").textContent));
    };

    // A) Registrar: o espelho recebe a mesma linha do Google
    await registrar("146000231", "01103");
    await ate(() => S.espelho.length === 1, "espelho recebeu o log_mov");
    const e = S.espelho[0];
    assert.strictEqual(e.modo, "log_mov");
    assert.strictEqual(e.row, 90);
    assert.strictEqual(e.dataHora, "2026-11-03 10:20:30");
    assert.strictEqual(e.campo1, "146000231");
    assert.strictEqual(e.campo2, "1103");
    assert.strictEqual(e.obs, "obs teste");
    assert.strictEqual(e.token, "Bearer tok1");
    assert.deepStrictEqual(S.logins, ["real@estoque.realguindastes.com"]);
    console.log("ok - registrar espelha a mesma linha, com login no Supabase");

    // B) Google recusou: nada vai para o Supabase
    S.googleOk = false;
    await registrar("146000231", "1103");
    await page.waitForTimeout(300);
    assert.strictEqual(S.espelho.length, 1);
    S.googleOk = true;
    console.log("ok - Google recusou: Supabase não recebe nada");

    // C) Deletar linha e foto (link do Drive)
    page.removeAllListeners("dialog");
    page.on("dialog", d => d.type() === "confirm" && /deletar/i.test(d.message()) ? d.accept() : d.dismiss());
    await page.evaluate(() => { showScreen("inventario"); document.getElementById("linha_consulta").value = "90"; });
    await page.evaluate(() => deletarLinhaInventarioUI());
    await ate(() => S.espelho.length === 2, "espelho recebeu o clear_lin");
    assert.deepStrictEqual([S.espelho[1].modo, S.espelho[1].row], ["clear_lin", 90]);
    await page.evaluate(() => { espelhar("foto_link", { row: 90, slot: 2, fotoUrl: "https://drive.google.com/file/d/abc/view" }); });
    await ate(() => S.espelho.length === 3, "espelho recebeu o foto_link");
    assert.deepStrictEqual([S.espelho[2].modo, S.espelho[2].slot, S.espelho[2].fotoUrl], ["foto_link", 2, "https://drive.google.com/file/d/abc/view"]);
    console.log("ok - deletar linha e link da foto são espelhados");

    // D) Token vencido: entra de novo e reenvia
    S.tokenVencido = 1;
    await page.evaluate(() => espelhar("clear_lin", { row: 91 }));
    await ate(() => S.espelho.length === 4, "reenviou depois de entrar de novo");
    assert.strictEqual(S.logins.length, 2);
    assert.strictEqual(S.espelho[3].token, "Bearer tok2");
    console.log("ok - token vencido: novo login e reenvio");

    // E) Supabase fora do ar: o registro no Google segue normal; rodapé conta a falha
    S.supabaseFora = true;
    await page.evaluate(() => { SB.token = ""; });
    await registrar("146000231", "1103");
    assert.match(await page.textContent("#status-msg"), /Registrado com sucesso/);
    await page.waitForFunction(() => /Supabase: 1 falha/.test(document.getElementById("app-footer").textContent));
    assert.strictEqual(await page.getAttribute("#net-status", "data-estado"), "pronto", "falha no Supabase não pinta o sinal do topo");
    S.supabaseFora = false;
    console.log("ok - Supabase fora do ar não atrapalha; rodapé mostra a falha");

    // F) Ajuste com outro desenho: espelho recebe a linha da AJUSTE e o compatível
    await page.evaluate(() => showScreen("cadastro"));
    await page.uncheck("#gps-check");
    await page.fill("#campo1_cad", "777000009"); await page.fill("#campo2_cad", "1");
    await page.click("#btn-registrar");
    await page.locator("#cad-mc button").click();
    await page.waitForFunction(() => !document.getElementById("aj-gt").disabled && document.getElementById("aj-gt").options.length > 1);
    await page.selectOption("#aj-gt", "GT-26");
    await page.fill("#aj-posicao input[type=search]", "lança 5");
    await page.locator("#aj-posicao .aj-opcao").first().click();
    await page.locator("#aj-ids .aj-opcao").first().click();
    await page.locator("#aj-compat .aj-opcao").first().click(); // Sim, outro desenho
    await page.fill("#aj-compat-codigo", "051.001-631.111");
    const antes = S.espelho.length;
    await page.click("#aj-gravar");
    await page.waitForFunction(() => /Ajuste gravado/.test(document.getElementById("aj-status").textContent));
    await ate(() => S.espelho.some((x, i) => i >= antes && x.modo === "ajuste"), "espelho recebeu o ajuste");
    const aj = S.espelho.find((x, i) => i >= antes && x.modo === "ajuste");
    assert.strictEqual(aj.linha, m.abas.AJUSTE.rows.length);
    assert.strictEqual(aj.gt, "GT-26");
    assert.strictEqual(aj.modelo, "280 EC-H 12 Litronic");
    assert.strictEqual(aj.c9_novo, "777000009");
    assert.strictEqual(aj.codigo_c_novo, "C051.001-631.111");
    assert.strictEqual(aj.compat.codigoC, "C051.001-631.111");
    assert.ok(aj.compat.linha > 3);
    console.log("ok - ajuste e compatível espelhados com a linha da AJUSTE");

    // G) Usuário consulta: nunca chama o Supabase
    const pc = await ctx.newPage();
    pc.on("pageerror", e2 => erros.push(e2.message));
    await pc.addInitScript(() => localStorage.setItem("ce_auth", JSON.stringify({ user: "consulta", pass: "y" })));
    const n = S.espelho.length + S.logins.length;
    await pc.goto(url);
    await pc.evaluate(() => espelhar("log_mov", { row: 99 }));
    await pc.waitForTimeout(300);
    assert.strictEqual(S.espelho.length + S.logins.length, n);
    console.log("ok - usuário consulta não grava no Supabase");

    assert.deepStrictEqual(erros, [], "erros de JavaScript na página");
    console.log("\nalimentação dupla OK");
  } finally {
    await b.close();
    servidor.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
