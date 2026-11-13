// Teste das telas 6) Envio de grua e 7) Cadastros, no navegador:
//   node testes/envio-tela.test.js
// Supabase simulado (Auth + função "romaneio" em memória; a prévia usa o configurador de verdade com dados
// inventados). Confere a ligação das telas: novo envio → prévia → salvar → romaneio → leitura (ok, mover, fora do
// envio com CONFIRMO, não encontrada → ajuste) → dados da carreta → confirmar; Cadastros lista e salva; consulta não vê.
const assert = require("assert");
const http = require("http"), fs = require("fs"), path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const servidor = http.createServer((req, res) => {
  const arq = path.join(RAIZ, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TIPOS[path.extname(arq)] || "application/octet-stream" });
  fs.createReadStream(arq).pipe(res);
});

(async () => {
  const { montarLista, distribuirVeiculos } =
    await import(pathToFileURL(path.join(RAIZ, "supabase", "functions", "_shared", "configurador.mjs")).href);

  // ---------- Dados inventados ----------
  const M = "Grua X 10";
  const relacaoItens = [
    { codigo: "C051.023-611.111", descricao: "LANÇA 1 - PÉ", grupo: "LANÇA", linha: 5, gt: "", qtd: { "50m": 1 } },
    { codigo: "C051.001-621.111", descricao: "LANÇA 2", grupo: "LANÇA", linha: 6, gt: "", qtd: { "50m": 2 } },
  ];
  const regras = [{ modelo: M, componente: "torre", altura_m: 20.7, base: "CHUMBADOR X", telescopagem: false, codigo: "C028047332111", quantidade: 2, ordem: 1 }];
  const pecas = {
    C051023611111: { descricao: "LANÇA 1 - PÉ", peso_kg: 3100, comp_m: 12 },
    C051001621111: { descricao: "LANÇA 2", peso_kg: 2000, comp_m: 10 },
    C028047332111: { descricao: "TORRE 4,14", peso_kg: 2300, comp_m: 4.14, codigo_exibicao: "C028.047-332.111" },
  };
  const frota = [{ nome: "Carreta 12 m", comp_util_m: 12, carga_max_kg: 27000, padrao: true }, { nome: "Prancha", comp_util_m: 10 }];
  // Peças físicas: código 9 + ID → Código C
  const fisicas = { "111|1": "C051023611111", "222|2": "C051001621111", "222|3": "C051001621111", "333|3": "C099000000001" };

  // ---------- Estado da função simulada ----------
  const S = { papeis: ["admin"], usuario: "real", envios: [], roms: [], leituras: [], fotos: 0, chamadas: [], cad: [] };
  const lidos = (rid, cod) => S.leituras.filter(l => l.romaneio_id === rid && l.codigo === cod).length;
  const MODOS = {
    me: () => ({ usuario: S.usuario, papeis: S.papeis }),
    opcoes: () => ({ modelos: [{ nome: M, lancas: ["50m", "45m"] }], gts: [{ gt: "GT-10", modelo: M }],
      bases: [{ modelo: M, base: "CHUMBADOR X" }], torres: [{ modelo: M, base: "CHUMBADOR X", telescopagem: false, altura_m: 20.7 }],
      lastros: [], frota, clientes: [{ id: 1, nome: "S11D", endereco_envio: "Canaã dos Carajás - PA" }], transportadoras: [], motoristas: [], placas: [] }),
    previa: (p) => {
      const cfg = { ...p.cfg, lanca_m: Number(p.cfg.lanca_m), altura_m: p.cfg.altura_m == null ? null : Number(p.cfg.altura_m) };
      const r = p.itens ? { itens: p.itens.filter(i => i.qtd > 0), avisos: [] } : montarLista(cfg, { relacaoItens, regras, pecas });
      const d = distribuirVeiculos(r.itens, pecas, frota);
      return { cfg, itens: r.itens, avisos: r.avisos, veiculos: d.veiculos, avisosDistribuicao: d.avisos };
    },
    salvar_envio: (p) => {
      const id = S.envios.length + 1;
      S.envios.push({ id, cliente: p.cliente, obra: p.obra, gt: p.cfg.gt, modelo: p.cfg.modelo, lanca_m: p.cfg.lanca_m, status: "aberto", criado_por: "real", criado_em: new Date().toISOString() });
      p.veiculos.forEach((v, k) => S.roms.push({ id: S.roms.length + 1, envio_id: id, numero: k + 1, veiculo: v.tipo, status: "planejado",
        itens: v.itens.map(i => ({ codigo: i.codigo, codigo_exibicao: i.codigoExib, descricao: i.descricao, qtd: i.qtd, forro: i.forro, filha: i.filha, origem: "plano" })) }));
      return { id, romaneios: p.veiculos.length };
    },
    envios: () => ({ envios: S.envios.map(e => ({ ...e, romaneios: S.roms.filter(r => r.envio_id === e.id).length, confirmados: 0,
      previstas: 0, lidas: S.leituras.length })) }),
    envio: (p) => ({ envio: S.envios.find(e => e.id === p.id), romaneios: S.roms.filter(r => r.envio_id === p.id).map(r => ({
      id: r.id, numero: r.numero, veiculo: r.veiculo, status: r.status, previstas: r.itens.reduce((s, i) => s + i.qtd, 0),
      lidas: S.leituras.filter(l => l.romaneio_id === r.id).length, peso_kg: 0, comp_m: 0 })) }),
    romaneio: (p) => {
      const r = S.roms.find(x => x.id === p.id), e = S.envios.find(x => x.id === r.envio_id);
      return { romaneio: { ...r, cliente: e.cliente, gt: e.gt, modelo: e.modelo },
        itens: r.itens.map(i => ({ ...i, lidos: lidos(r.id, i.codigo) })),
        leituras: S.leituras.filter(l => l.romaneio_id === r.id).map((l, k) => ({ id: k + 1, quando: "12/11 10:00", usuario: "real", ...l })),
        fotos: [], outros: S.roms.filter(x => x.envio_id === r.envio_id && x.id !== r.id).map(x => ({ id: x.id, numero: x.numero, veiculo: x.veiculo, status: x.status })),
        historico: [] };
    },
    ler_peca: (p) => {
      const r = S.roms.find(x => x.id === p.romaneio_id);
      if (S.leituras.some(l => l.codigo9 === p.codigo9 && l.id_individual === p.id_individual)) return { ok: false, error: "já conferida", duplicada: true };
      const cod = fisicas[`${p.codigo9}|${p.id_individual}`];
      if (!cod) return { ok: false, error: "peça não encontrada na MachineCards nem nos ajustes", naoEncontrada: true };
      const aqui = r.itens.find(i => i.codigo === cod && i.qtd > lidos(r.id, cod));
      if (!aqui) {
        const outro = S.roms.find(x => x.id !== r.id && x.envio_id === r.envio_id && x.itens.some(i => i.codigo === cod && i.qtd > lidos(x.id, cod)));
        if (outro && !p.mover) return { ok: false, error: `peça prevista no romaneio ${outro.numero}`, pedeMover: true };
        if (outro) { outro.itens.find(i => i.codigo === cod).qtd--; const it = r.itens.find(i => i.codigo === cod);
          if (it) it.qtd++; else r.itens.push({ codigo: cod, descricao: "movida", qtd: 1, origem: "movido" }); }
        else if (p.confirmo !== "CONFIRMO") return { ok: false, error: "peça fora do envio", foraDoEnvio: true, pedeConfirmo: true };
        else r.itens.push({ codigo: cod, codigo_exibicao: cod, descricao: "PEÇA EXTRA", qtd: 1, origem: "manual" });
      }
      S.leituras.push({ romaneio_id: r.id, codigo9: p.codigo9, id_individual: p.id_individual, codigo: cod, manual: p.manual });
      r.status = "carregando";
      return { codigo: cod, descricao: pecas[cod]?.descricao || "PEÇA EXTRA" };
    },
    editar_romaneio: (p) => { Object.assign(S.roms.find(x => x.id === p.id), p); return {}; },
    confirmar: (p) => {
      const r = S.roms.find(x => x.id === p.id);
      const faltas = r.itens.filter(i => lidos(r.id, i.codigo) < i.qtd).map(i => i.descricao);
      if (faltas.length && !p.justificativa) return { ok: false, error: "há peças não conferidas: justifique ou confira", faltas };
      if (!r.placa_cavalo) return { ok: false, error: "falta preencher: placa do cavalo" };
      r.status = "confirmado"; r.justificativa = p.justificativa;
      return { faltas };
    },
    cad_listar: (p) => p.tabela === "clientes" ? ({ podeEditar: true, total: 1,
      colunas: ["id", "tipo", "pai_id", "cnpj", "razao_social", "nome_fantasia", "nome", "endereco_envio", "cidade", "uf", "cep", "obs", "ativo"],
      linhas: [{ id: 7, tipo: "empresa", nome: "Construtora X", cnpj: "11222333000181", ativo: true }] }) : ({ colunas: ["codigo", "codigo_exibicao", "descricao", "peso_kg", "pendencias"], podeEditar: true, total: 1,
      linhas: [{ codigo: "C051023611111", codigo_exibicao: "C051.023-611.111", descricao: "LANÇA 1 - PÉ", peso_kg: 3100, pendencias: "peso_kg diferente entre abas" }] }),
    cad_salvar: (p) => { S.cad.push(p); return {}; },
    cad_excluir: (p) => { S.cad.push({ excluir: p }); return { acao: "desativado (já usado em envio/cadastro)" }; },
  };

  await new Promise(r => servidor.listen(0, r));
  const url = `http://localhost:${servidor.address().port}/index.html`;
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => { if (!localStorage.getItem("ce_auth")) localStorage.setItem("ce_auth", JSON.stringify({ user: "real", pass: "x" })); });
    await ctx.route("https://unpkg.com/**", r => r.fulfill({ body: "", contentType: "text/javascript" }));
    await ctx.route("https://brasilapi.com.br/**", r => r.fulfill({ headers: { "Access-Control-Allow-Origin": "*" }, contentType: "application/json",
      body: JSON.stringify({ cnpj: "11222333000181", razao_social: "CONSTRUTORA X S/A", nome_fantasia: "", descricao_tipo_de_logradouro: "AVENIDA",
        logradouro: "BRASIL", numero: "100", bairro: "CENTRO", municipio: "BELO HORIZONTE", uf: "MG", cep: "30000000",
        descricao_situacao_cadastral: "ATIVA" }) }));
    await ctx.route("https://script.google.com/**", r => r.fulfill({ body: JSON.stringify({ ok: true, version: "mock", gts: [] }), contentType: "application/json" }));
    await ctx.route("https://*.supabase.co/**", r => {
      const req = r.request(), u = new URL(req.url());
      const cab = { "Access-Control-Allow-Origin": "*" };
      if (req.method() === "OPTIONS") return r.fulfill({ status: 204, headers: { ...cab, "Access-Control-Allow-Headers": "*" } });
      if (u.pathname === "/auth/v1/token") return r.fulfill({ headers: cab, contentType: "application/json", body: JSON.stringify({ access_token: "tok", expires_in: 3600 }) });
      if (u.pathname === "/functions/v1/romaneio") {
        const p = JSON.parse(req.postData());
        S.chamadas.push(p.modo);
        const fn = MODOS[p.modo];
        const out = fn ? fn(p) : { ok: false, error: "modo " + p.modo };
        return r.fulfill({ headers: cab, contentType: "application/json", body: JSON.stringify(out.ok === false ? out : { ok: true, ...out }) });
      }
      r.fulfill({ status: 404, body: "" });
    });

    const page = await ctx.newPage();
    const erros = [];
    page.on("pageerror", e => erros.push(e.message));
    page.on("dialog", d => d.accept());
    await page.goto(url);
    const texto = sel => page.locator(sel).innerText();

    // A) Menu e lista
    await page.evaluate(() => showScreen("envio"));
    await page.waitForFunction(() => /Papéis: admin/.test(document.getElementById("env-status").textContent));
    assert.ok(await page.isVisible("#env-btn-novo"));
    assert.match(await texto("#env-envios"), /Nenhum envio em aberto/);
    console.log("ok - Envio de grua: entra no Supabase, mostra papéis e lista vazia");

    // B) Novo envio → prévia → salvar
    await page.click("#env-btn-novo");
    await page.fill("#env-cliente", "S11D");
    await page.dispatchEvent("#env-cliente", "change");
    assert.strictEqual(await page.inputValue("#env-endereco"), "Canaã dos Carajás - PA", "endereço do cadastro do cliente");
    await page.fill("#env-obra", "Mina");
    await page.selectOption("#env-gt", "GT-10");
    assert.strictEqual(await page.inputValue("#env-modelo"), M, "modelo vem do GT");
    await page.selectOption("#env-lanca", "50m");
    await page.selectOption("#env-base", "CHUMBADOR X");
    await page.selectOption("#env-altura", "20.7");
    await page.click("#env-btn-previa");
    await page.waitForSelector("#env-previa:not([hidden])");
    assert.match(await texto("#env-itens"), /LANÇA 2/);
    assert.match(await texto("#env-itens"), /TORRE 4,14/);
    assert.match(await texto("#env-veiculos"), /Carreta 12 m/);
    const nVeic = (await page.locator("#env-veiculos .eq-item").count());
    // Edita a quantidade da lança 2 para 1 e redistribui
    const idx = await page.evaluate(() => ENV.previa.itens.findIndex(i => i.codigo === "C051001621111"));
    await page.fill(`#env-qtd-${idx}`, "1");
    await page.click("#env-btn-redistribuir");
    await page.waitForFunction(n => document.querySelectorAll("#env-veiculos .eq-item").length === n - 1, nVeic);
    await page.fill(`#env-qtd-${idx}`, "2");
    await page.click("#env-btn-redistribuir");
    await page.waitForFunction(n => document.querySelectorAll("#env-veiculos .eq-item").length === n, nVeic);
    await page.click("#env-btn-salvar");
    await page.waitForSelector("#env-detalhe:not([hidden])");
    assert.match(await texto("#env-det-titulo"), /S11D – GT-10/);
    assert.strictEqual(await page.locator("#env-romaneios .env-card").count(), nVeic);
    console.log(`ok - novo envio: cliente com endereço, GT → modelo, prévia (${nVeic} veículos), redistribuir, salvar`);

    // C) Romaneio com a LANÇA 2 (romaneio 2 ou 3) e leituras
    const rLanca2 = S.roms.find(r => r.itens.some(i => i.codigo === "C051001621111"));
    await page.locator("#env-romaneios .env-card").nth(rLanca2.numero - 1).click();
    await page.waitForSelector("#env-romaneio:not([hidden])");
    const ler = async (c9, id) => { await page.fill("#env-c9", c9); await page.fill("#env-id", id); await page.click("#env-btn-registrar");
      await page.waitForFunction(() => !/Conferindo/.test(document.getElementById("env-leitura-msg").textContent)); };
    await ler("222", "2");
    assert.match(await texto("#env-leitura-msg"), /OK: LANÇA 2/);
    assert.match(await texto("#env-rom-itens"), /1\/1 peças conferidas|1\/\d+ peças conferidas/);
    // Segunda LANÇA 2 está prevista em outro romaneio → pergunta mover
    await ler("222", "3");
    assert.match(await texto("#env-leitura-msg"), /prevista no romaneio/);
    await page.click("#env-leitura-acoes >> text=Mover para este romaneio");
    await page.waitForFunction(() => /OK: LANÇA 2/.test(document.getElementById("env-leitura-msg").textContent));
    // Fora do envio → CONFIRMO
    await ler("333", "3");
    assert.match(await texto("#env-leitura-msg"), /fora do envio/);
    await page.fill(".env-confirmo", "CONFIRMO");
    await page.click("#env-leitura-acoes >> text=Incluir mesmo assim");
    await page.waitForFunction(() => /OK: PEÇA EXTRA/.test(document.getElementById("env-leitura-msg").textContent));
    assert.match(await texto("#env-rom-itens"), /fora do plano/);
    // Não encontrada → Registrar ajuste abre a tela de ajuste e volta para o envio
    await ler("999", "9");
    assert.match(await texto("#env-leitura-msg"), /não encontrada/);
    await page.click("#env-leitura-acoes >> text=Registrar ajuste");
    await page.waitForSelector("#screen-ajuste:not([hidden])");
    assert.match(await texto("#aj-peca"), /999 · ID 9/);
    await page.click("#aj-voltar");
    await page.waitForSelector("#screen-envio:not([hidden])");
    console.log("ok - conferência: leitura ok, mover de outro romaneio, fora do envio com CONFIRMO, não encontrada → ajuste");

    // D) Dados da carreta e confirmar
    await page.evaluate(() => { envView("romaneio"); recarregarRomaneio(); });
    await page.waitForSelector("#env-romaneio:not([hidden])");
    await page.click("#env-btn-confirmar");
    await page.waitForFunction(() => /Não confirmado/.test(document.getElementById("env-status").textContent));
    await page.fill("#env-placa-cavalo", "abc1d23");
    await page.fill("#env-motorista", "Motorista Teste");
    await page.click("#env-btn-dados");
    await page.waitForFunction(() => /salvos/.test(document.getElementById("env-status").textContent));
    assert.strictEqual(S.roms.find(r => r.id === rLanca2.id).placa_cavalo, "abc1d23", "placa enviada (a função grava em maiúsculas)");
    await page.fill("#env-just", "teste");
    await page.click("#env-btn-confirmar");
    await page.waitForFunction(() => /Romaneio confirmado/.test(document.getElementById("env-status").textContent));
    assert.ok(await page.isDisabled("#env-btn-registrar"), "romaneio confirmado não aceita leitura");
    console.log("ok - confirmar: recusa sem dados, salva dados da carreta, confirma com justificativa e trava");

    // E) Cadastros
    await page.evaluate(() => showScreen("cadastros"));
    await page.waitForFunction(() => document.querySelectorAll("#cad-lista .env-card").length === 1);
    assert.match(await texto("#cad-lista"), /peso_kg diferente/);
    await page.click("#cad-lista .env-card");
    await page.fill("#cad-f-peso_kg", "3150");
    await page.click("#cad-btn-salvar");
    await page.waitForFunction(() => /Salvo/.test(document.getElementById("cad-status").textContent));
    assert.strictEqual(S.cad[0].tabela, "pecas"); assert.strictEqual(S.cad[0].dados.peso_kg, "3150");
    assert.strictEqual(S.cad[0].dados.codigo, "C051023611111");
    console.log("ok - Cadastros: lista com pendência, edita e salva a peça");

    // Clientes: novo pelo CNPJ (BrasilAPI), obra com a construtora como pai, excluir
    await page.selectOption("#cad-tabela", "clientes");
    await page.waitForFunction(() => /Construtora X/.test(document.getElementById("cad-lista").textContent));
    await page.click("#cad-btn-novo");
    assert.ok(await page.isHidden("#cad-f-pai_id"), "empresa não mostra o campo da construtora");
    await page.fill("#cad-f-cnpj", "11.222.333/0001-81");
    await page.click("#cad-btn-cnpj");
    await page.waitForFunction(() => /CNPJ encontrado/.test(document.getElementById("cad-status").textContent));
    assert.strictEqual(await page.inputValue("#cad-f-razao_social"), "CONSTRUTORA X S/A");
    assert.strictEqual(await page.inputValue("#cad-f-nome"), "CONSTRUTORA X S/A");
    assert.match(await page.inputValue("#cad-f-endereco_envio"), /AVENIDA BRASIL, 100, CENTRO/);
    assert.strictEqual(await page.inputValue("#cad-f-cidade"), "BELO HORIZONTE");
    await page.selectOption("#cad-f-tipo", "obra");
    assert.ok(await page.isVisible("#cad-f-pai_id") && await page.isHidden("#cad-f-cnpj"), "obra mostra a construtora e esconde o CNPJ");
    await page.selectOption("#cad-f-pai_id", "7");
    await page.fill("#cad-f-nome", "Obra Mina Norte");
    await page.click("#cad-btn-salvar");
    await page.waitForFunction(() => /Salvo/.test(document.getElementById("cad-status").textContent));
    const obra = S.cad[S.cad.length - 1];
    assert.strictEqual(obra.tabela, "clientes"); assert.strictEqual(obra.dados.tipo, "obra"); assert.strictEqual(obra.dados.pai_id, "7");
    await page.waitForFunction(() => document.querySelectorAll("#cad-lista .env-card").length === 1);
    await page.click("#cad-lista .env-card");
    await page.click("#cad-btn-excluir");
    await page.waitForFunction(() => /desativado/.test(document.getElementById("cad-status").textContent));
    assert.deepStrictEqual(S.cad[S.cad.length - 1].excluir, { modo: "cad_excluir", tabela: "clientes", chave: 7 });
    console.log("ok - Clientes: CNPJ preenche razão social/endereço, obra com construtora, excluir (desativa se usado)");

    // F) Usuário sem papel e usuário consulta
    S.papeis = [];
    await page.evaluate(() => showScreen("consulta"));
    await page.evaluate(() => showScreen("envio"));
    await page.waitForFunction(() => /sem papel/.test(document.getElementById("env-status").textContent));
    await page.evaluate(() => { AUTH.user = "consulta"; atualizarUsuarioUI(); });
    assert.ok(await page.locator('.nav button[data-screen="envio"]').isHidden());
    assert.ok(await page.locator('.nav button[data-screen="cadastros"]').isHidden());
    console.log("ok - sem papel: aviso; consulta: menu sem Envio de grua e Cadastros");

    assert.deepStrictEqual(erros, []);
    console.log("\ntelas do envio OK");
  } finally {
    await b.close();
    servidor.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
