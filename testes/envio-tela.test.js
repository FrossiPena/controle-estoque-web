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
    C028047332111: { descricao: "TORRE 4,14", peso_kg: null, comp_m: 4.14, codigo_exibicao: "C028.047-332.111" },
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
      lastros: [], frota, clientes: [{ id: 1, tipo: "empresa", nome: "S11D", endereco_envio: "Canaã dos Carajás - PA" },
                { id: 2, tipo: "obra", pai_id: 1, nome: "Mina Norte", endereco_envio: "Estrada da Mina, km 5" }], transportadoras: [{ id: 3, nome: "Cat Log" }, { id: 4, nome: "Transcarga" }], motoristas: [], placas: [] }),
    previa: (p) => {
      const cfg = { ...p.cfg, lanca_m: Number(p.cfg.lanca_m), altura_m: p.cfg.altura_m == null ? null : Number(p.cfg.altura_m) };
      const r = p.itens ? { itens: p.itens.filter(i => i.qtd > 0), avisos: [] } : montarLista(cfg, { relacaoItens, regras, pecas });
      const d = distribuirVeiculos(r.itens, pecas, frota);
      return { cfg, itens: r.itens, avisos: r.avisos, veiculos: d.veiculos, avisosDistribuicao: d.avisos };
    },
    salvar_envio: (p) => {
      const id = S.envios.length + 1;
      S.ultimoEnvio = p;
      S.envios.push({ id, cliente: p.cliente, obra: p.obra, gt: p.cfg.gt, modelo: p.cfg.modelo, lanca_m: p.cfg.lanca_m, status: "aberto", criado_por: "real", criado_em: new Date().toISOString() });
      p.veiculos.forEach((v, k) => S.roms.push({ id: S.roms.length + 1, envio_id: id, numero: k + 1, veiculo: v.tipo, status: "planejado",
        itens: v.itens.map(i => ({ codigo: i.codigo, codigo_exibicao: i.codigoExib, descricao: i.descricao, qtd: i.qtd, forro: i.forro, filha: i.filha, origem: "plano" })) }));
      return { id, romaneios: p.veiculos.length };
    },
    envios: () => ({ envios: S.envios.map(e => ({ ...e, romaneios: S.roms.filter(r => r.envio_id === e.id).length, confirmados: 0,
      por_status: S.roms.filter(r => r.envio_id === e.id).reduce((m, r) => (m[r.status] = (m[r.status] || 0) + 1, m), {}),
      previstas: 0, lidas: S.leituras.length })) }),
    envio: (p) => ({ envio: S.envios.find(e => e.id === p.id), romaneios: S.roms.filter(r => r.envio_id === p.id).map(r => ({
      id: r.id, numero: r.numero, veiculo: r.veiculo, status: r.status, previstas: r.itens.reduce((s, i) => s + i.qtd, 0),
      lidas: S.leituras.filter(l => l.romaneio_id === r.id).length, peso_kg: 0, comp_m: 0 })) }),
    romaneio: (p) => {
      const r = S.roms.find(x => x.id === p.id), e = S.envios.find(x => x.id === r.envio_id);
      return { romaneio: { ...r, cliente: e.cliente, gt: e.gt, modelo: e.modelo },
        itens: r.itens.map(i => ({ ...i, lidos: lidos(r.id, i.codigo) })),
        leituras: S.leituras.filter(l => l.romaneio_id === r.id).map((l, k) => ({ id: k + 1, quando: "12/11 10:00", usuario: "real", ...l })),
        fotos: S.fotoFake ? [{ id: 1, url: "data:," }] : [], outros: S.roms.filter(x => x.envio_id === r.envio_id && x.id !== r.id).map(x => ({ id: x.id, numero: x.numero, veiculo: x.veiculo, status: x.status })),
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
      r.status = "iniciado";
      return { codigo: cod, descricao: pecas[cod]?.descricao || "PEÇA EXTRA" };
    },
    editar_romaneio: (p) => { Object.assign(S.roms.find(x => x.id === p.id), p); return {}; },
    solicitar_nota: (p) => { const r = S.roms.find(x => x.id === p.id); if (r.status !== "conferido") return { ok: false, error: "não conferido" }; r.status = "aguardando_nota"; return {}; },
    concluir: (p) => { const r = S.roms.find(x => x.id === p.id); if (!p.nota_fiscal) return { ok: false, error: "informe o número da nota fiscal" };
      r.status = "concluido"; r.nota_fiscal = p.nota_fiscal; return { envioConcluido: false }; },
    excluir_envio: (p) => {
      if (p.escopo === "geral" && p.confirmo !== "EXCLUIR") return { ok: false, error: "digite EXCLUIR" };
      const alvo = S.roms.filter(r => r.envio_id === p.envio_id && r.status !== "excluido" && (p.escopo === "geral" || r.status === "planejado"));
      alvo.forEach(r => { r.status = "excluido"; r.status_motivo = p.motivo; });
      S.exclusoes = (S.exclusoes || []).concat([{ escopo: p.escopo, n: alvo.length }]);
      return { excluidos: alvo.length, envio: S.roms.every(r => r.envio_id !== p.envio_id || r.status === "excluido") ? "excluido" : "aberto" };
    },
    confirmar: (p) => {
      const r = S.roms.find(x => x.id === p.id);
      const faltas = r.itens.filter(i => lidos(r.id, i.codigo) < i.qtd).map(i => i.descricao);
      if (faltas.length && !p.justificativa) return { ok: false, error: "há peças não conferidas: justifique ou confira", faltas };
      if (!r.placa_cavalo) return { ok: false, error: "falta preencher: placa do cavalo" };
      r.status = "conferido"; r.justificativa = p.justificativa;
      return { faltas };
    },
    cad_listar: (p) => (S.ultimaBusca = p.busca, false) ? null : p.tabela === "transportadoras" ? ({ podeEditar: true, total: 0, linhas: [],
        colunas: ["id", "nome", "cnpj", "contato_nome", "contato_telefone", "email_nf", "ativo"] }) : p.tabela === "motoristas" ? ({ podeEditar: true, total: 1,
        linhas: [{ id: 9, cpf: "52998224725", nome: "Elon Silva Musk", ativo: true }],
        colunas: ["id", "cpf", "nome", "celular", "celular2", "transportadora_id", "placa_cavalo", "placa_carreta1", "placa_carreta2", "ativo"] })
      : p.tabela === "transportadoras" ? ({ podeEditar: true, total: 0, colunas: ["id", "nome", "cnpj", "ativo"], linhas: [] })
      : p.tabela === "clientes" ? ({ podeEditar: true, total: 1,
      colunas: ["id", "tipo", "pai_id", "cnpj", "razao_social", "nome_fantasia", "nome", "endereco_envio", "cidade", "uf", "cep", "obs", "ativo"],
      linhas: [{ id: 7, tipo: "empresa", nome: "Construtora X", cnpj: "11222333000181", ativo: true },
               { id: 8, tipo: "obra", pai_id: 7, nome: "Obra Sul", cidade: "Betim", uf: "MG", ativo: true }] }) : ({ colunas: ["codigo", "codigo_exibicao", "descricao", "peso_kg", "pendencias"], podeEditar: true, total: 1,
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
    assert.match(await texto("#env-envios"), /Nenhum envio com romaneio nos status marcados/);
    assert.deepStrictEqual(await page.$$eval("#env-filtro input:checked", l => l.map(i => i.value)),
      ["planejado", "iniciado", "conferido", "aguardando_nota"], "filtro padrão");
    assert.strictEqual(await page.locator("#env-filtro input").count(), 7);
    console.log("ok - Envio de grua: entra no Supabase, mostra papéis e lista vazia");

    // B) Novo envio → prévia → salvar
    await page.click("#env-btn-novo");
    await page.fill("#env-cliente", "S11D");
    await page.dispatchEvent("#env-cliente", "change");
    assert.strictEqual(await page.inputValue("#env-endereco"), "Canaã dos Carajás - PA", "endereço do cadastro do cliente");
    assert.deepStrictEqual(await page.locator("#env-obra option").allInnerTexts(), ["S11D (o próprio cliente)", "Mina Norte"]);
    assert.strictEqual(await page.inputValue("#env-obra"), "1", "começa com o próprio cliente");
    await page.selectOption("#env-obra", "2");
    assert.strictEqual(await page.inputValue("#env-endereco"), "Estrada da Mina, km 5", "endereço da obra");
    // + Adicionar obra: cadastra ligada ao cliente
    await page.click("#env-btn-add-obra");
    await page.fill("#env-nova-obra-nome", "Mina Sul");
    await page.click("#env-btn-salvar-obra");
    await page.waitForFunction(() => /Obra Mina Sul cadastrada/.test(document.getElementById("env-status").textContent));
    const novaObra = S.cad[S.cad.length - 1];
    assert.strictEqual(novaObra.dados.tipo, "obra"); assert.strictEqual(novaObra.dados.pai_id, 1);
    await page.selectOption("#env-obra", "2");
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
    // Divergência: código + descrição, link para o cadastro da peça e volta sem perder o formulário
    assert.ok(await page.isVisible("#env-diverg"));
    assert.match(await page.locator("#env-avisos").innerText(), /C028047332111 · TORRE 4,14: sem peso|C028.047-332.111 · TORRE 4,14: sem peso/);
    await page.click("#env-avisos .env-diverg-link");
    await page.waitForSelector("#screen-cadastros:not([hidden])");
    assert.strictEqual(await page.inputValue("#cad-busca"), "C028047332111");
    assert.strictEqual(S.ultimaBusca, "C028047332111");
    await page.click("#cad-voltar-envio");
    await page.waitForSelector("#env-novo:not([hidden])");
    assert.strictEqual(await page.inputValue("#env-cliente"), "S11D", "formulário mantido");
    assert.ok(await page.isVisible("#env-previa"));
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
    assert.strictEqual(S.ultimoEnvio.obra, "Mina Norte"); assert.strictEqual(S.ultimoEnvio.cliente_id, 2);
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
    assert.match(await page.locator("#env-confirmar-hint").innerText(), /Para confirmar, falta:[\s\S]*placa do cavalo[\s\S]*motorista/);
    await page.click("#env-btn-confirmar");
    await page.waitForFunction(() => /não confirmado/.test(document.getElementById("env-status").textContent));
    assert.notStrictEqual(await page.getAttribute("#net-status", "data-estado"), "erro", "recusa não é erro de comunicação");
    await page.fill("#env-placa-cavalo", "abc1d23");
    await page.fill("#env-motorista", "Motorista Teste");
    await page.fill("#env-transp", "Cat Log");
    S.fotoFake = true;
    await page.click("#env-btn-dados");
    await page.waitForFunction(() => /salvos/.test(document.getElementById("env-status").textContent));
    assert.strictEqual(S.roms.find(r => r.id === rLanca2.id).placa_cavalo, "abc1d23", "placa enviada (a função grava em maiúsculas)");
    await page.fill("#env-just", "teste");
    assert.ok(await page.isHidden("#env-confirmar-hint"), "com justificativa e dados, nada falta");
    await page.click("#env-btn-confirmar");
    await page.waitForFunction(() => /Romaneio conferido/.test(document.getElementById("env-status").textContent));
    await page.waitForSelector("#env-btn-pedir-nota");
    assert.ok(await page.isDisabled("#env-btn-registrar"), "romaneio conferido não aceita leitura");
    assert.ok(await page.isHidden("#env-confirmar-sec"));
    await page.click("#env-btn-pedir-nota");
    await page.waitForSelector("#env-btn-concluir");
    assert.match(await page.locator("#env-situacao").innerText(), /Aguardando nota/);
    await page.click("#env-btn-concluir");
    await page.waitForFunction(() => /nota fiscal/.test(document.getElementById("env-status").textContent));
    await page.fill("#env-nf-concluir", "35161");
    await page.click("#env-btn-concluir");
    await page.waitForFunction(() => /Situação: Concluído/.test(document.getElementById("env-situacao").textContent));
    assert.strictEqual(S.roms.find(r => r.id === rLanca2.id).nota_fiscal, "35161");
    // Excluir envio: só planejados, depois geral com EXCLUIR
    await page.click(".env-voltar[data-voltar='detalhe']");
    await page.waitForSelector("#env-detalhe:not([hidden])");
    await page.click("#env-btn-excluir-envio");
    await page.fill("#env-excluir-motivo", "cliente adiou");
    await page.click("#env-btn-excluir-planejados");
    await page.waitForFunction(() => /excluído\(s\)/.test(document.getElementById("env-status").textContent));
    const planejados = S.exclusoes[0].n;
    assert.ok(planejados >= 1 && S.roms.find(r => r.id === rLanca2.id).status === "concluido", "só os planejados saem");
    await page.click("#env-btn-excluir-envio");
    await page.fill("#env-excluir-motivo", "cancelado");
    await page.click("#env-btn-excluir-geral");
    await page.waitForFunction(() => /EXCLUIR/.test(document.getElementById("env-status").textContent));
    await page.fill("#env-excluir-confirmo", "excluir");
    await page.click("#env-btn-excluir-geral");
    await page.waitForFunction(() => /Envio excluído/.test(document.getElementById("env-status").textContent));
    assert.ok(S.roms.every(r => r.status === "excluido"));
    // Lista: envio todo excluído some com o filtro padrão e aparece marcando "Excluído"
    await page.click("#env-detalhe .env-voltar");
    await page.waitForFunction(() => /Nenhum envio com romaneio/.test(document.getElementById("env-envios").textContent));
    await page.check("#env-f-excluido");
    await page.waitForFunction(() => /Romaneios: \d+ excluído/.test(document.getElementById("env-envios").textContent));
    await page.uncheck("#env-f-excluido");
    console.log("ok - status: conferido → aguardando nota → concluído (NF); excluir envio só planejados / geral com EXCLUIR");

    // E) Cadastros
    await page.evaluate(() => { document.getElementById("cad-lista").replaceChildren(); showScreen("cadastros"); });
    await page.waitForFunction(() => /papéis/.test(document.getElementById("cad-status").textContent));
    await page.waitForFunction(() => /peso_kg diferente/.test(document.getElementById("cad-lista").textContent));
    await page.click("#cad-lista .env-card");
    await page.fill("#cad-f-peso_kg", "3150");
    await page.click("#cad-btn-salvar");
    await page.waitForFunction(() => /Salvo/.test(document.getElementById("cad-status").textContent));
    const salvoPeca = S.cad.find(x => x.tabela === "pecas"); assert.strictEqual(salvoPeca.dados.peso_kg, "3150");
    assert.strictEqual(salvoPeca.dados.codigo, "C051023611111");
    console.log("ok - Cadastros: lista com pendência, edita e salva a peça");

    // Clientes: novo pelo CNPJ (BrasilAPI), obra com a construtora como pai, excluir
    await page.selectOption("#cad-tabela", "clientes");
    await page.waitForFunction(() => /Construtora X/.test(document.getElementById("cad-lista").textContent));
    await page.click("#cad-btn-novo");
    assert.ok(await page.isHidden("#cad-f-pai_id"), "empresa não mostra o campo da construtora");
    assert.ok(await page.$eval("#cad-f-cnpj", e => e.classList.contains("campo-invalido")), "CNPJ vazio do cliente fica vermelho");
    await page.fill("#cad-f-cnpj", "1122233300");
    assert.ok(await page.$eval("#cad-f-cnpj", e => e.classList.contains("campo-invalido")), "CNPJ incompleto fica vermelho");
    await page.fill("#cad-f-cnpj", "11222333000181");
    assert.ok(!(await page.$eval("#cad-f-cnpj", e => e.classList.contains("campo-invalido"))), "14 dígitos: sai do vermelho");
    await page.click("#cad-btn-cnpj");
    assert.strictEqual(await page.inputValue("#cad-f-cnpj"), "11.222.333/0001-81", "máscara antes de consultar");
    await page.waitForFunction(() => /CNPJ encontrado/.test(document.getElementById("cad-status").textContent));
    assert.strictEqual(await page.inputValue("#cad-f-razao_social"), "CONSTRUTORA X S/A");
    assert.strictEqual(await page.inputValue("#cad-f-nome"), "CONSTRUTORA X S/A");
    assert.match(await page.inputValue("#cad-f-endereco_envio"), /AVENIDA BRASIL, 100, CENTRO/);
    assert.strictEqual(await page.inputValue("#cad-f-cidade"), "BELO HORIZONTE");
    await page.selectOption("#cad-f-tipo", "obra");
    assert.ok(await page.isVisible("#cad-f-pai_id") && await page.isVisible("#cad-f-cnpj"), "obra mostra o cliente e o CNPJ (SPE)");
    await page.selectOption("#cad-f-pai_id", "7");
    await page.fill("#cad-f-nome", "Obra Mina Norte");
    await page.click("#cad-btn-salvar");
    await page.waitForFunction(() => /Salvo/.test(document.getElementById("cad-status").textContent));
    const obra = S.cad[S.cad.length - 1];
    assert.strictEqual(obra.tabela, "clientes"); assert.strictEqual(obra.dados.tipo, "obra"); assert.strictEqual(obra.dados.pai_id, "7");
    await page.waitForFunction(() => document.querySelectorAll("#cad-lista .env-card").length === 2);
    assert.match(await page.locator("#cad-lista").innerText(), /Obra Obra Sul · de Construtora X/);
    // Cliente: lista das obras e "+ Cadastrar obra" já ligada a ele
    await page.click("#cad-lista .env-card >> nth=0");
    assert.match(await page.locator("#cad-obras").innerText(), /Obras de Construtora X \(1\)[\s\S]*Obra Sul/);
    await page.click("#cad-btn-nova-obra");
    assert.strictEqual(await page.inputValue("#cad-f-tipo"), "obra");
    assert.strictEqual(await page.inputValue("#cad-f-pai_id"), "7");
    assert.ok(!(await page.$eval("#cad-f-cnpj", e => e.classList.contains("campo-invalido"))), "obra sem CNPJ não fica vermelha");
    await page.fill("#cad-f-nome", "Obra SPE");
    await page.fill("#cad-f-cnpj", "123");
    await page.click("#cad-btn-salvar");
    await page.waitForFunction(() => /incompleto/.test(document.getElementById("cad-status").textContent));
    await page.fill("#cad-f-cnpj", "");
    await page.click("#cad-btn-salvar");
    await page.waitForFunction(() => /Salvo/.test(document.getElementById("cad-status").textContent));
    assert.strictEqual(S.cad[S.cad.length - 1].dados.pai_id, "7");
    // Obra vira cliente: perde o vínculo
    await page.waitForFunction(() => document.querySelectorAll("#cad-lista .env-card").length === 2);
    await page.click("#cad-lista .env-card >> nth=1");
    await page.selectOption("#cad-f-tipo", "empresa");
    await page.fill("#cad-f-cnpj", "11222333000181");
    await page.click("#cad-btn-salvar");
    await page.waitForFunction(() => /Salvo/.test(document.getElementById("cad-status").textContent));
    assert.strictEqual(S.cad[S.cad.length - 1].dados.tipo, "empresa"); assert.strictEqual(S.cad[S.cad.length - 1].dados.pai_id, "");
    await page.waitForFunction(() => document.querySelectorAll("#cad-lista .env-card").length === 2);
    await page.click("#cad-lista .env-card >> nth=0");
    await page.click("#cad-btn-excluir");
    await page.waitForFunction(() => /desativado/.test(document.getElementById("cad-status").textContent));
    assert.deepStrictEqual(S.cad[S.cad.length - 1].excluir, { modo: "cad_excluir", tabela: "clientes", chave: 7 });
    console.log("ok - Clientes: CNPJ vermelho/máscara/BrasilAPI, obras do cliente, + Cadastrar obra, obra ↔ cliente, excluir");

    // Transportadora: Buscar CNPJ preenche o nome
    await page.selectOption("#cad-tabela", "transportadoras");
    await page.waitForFunction(() => /0 registro/.test(document.getElementById("cad-total").textContent));
    await page.click("#cad-btn-novo");
    assert.ok(await page.$eval("#cad-f-cnpj", e => e.classList.contains("campo-invalido")));
    await page.fill("#cad-f-cnpj", "11222333000181");
    await page.click("#cad-btn-cnpj");
    await page.waitForFunction(() => /CNPJ encontrado/.test(document.getElementById("cad-status").textContent));
    assert.strictEqual(await page.inputValue("#cad-f-cnpj"), "11.222.333/0001-81");
    assert.strictEqual(await page.inputValue("#cad-f-nome"), "CONSTRUTORA X S/A");
    await page.fill("#cad-f-contato_telefone", "3133334444");
    assert.strictEqual(await page.inputValue("#cad-f-contato_telefone"), "(31) 3333-4444");
    await page.fill("#cad-f-email_nf", "nf-sem-arroba");
    await page.click("#cad-btn-salvar");
    await page.waitForFunction(() => /E-mail da nota fiscal inválido/.test(document.getElementById("cad-status").textContent));
    console.log("ok - Transportadora: Buscar CNPJ com máscara e nome da Receita");

    // Motorista: transportadora pelo nome, sugestão a partir de 2 letras
    await page.selectOption("#cad-tabela", "motoristas");
    await page.waitForFunction(() => /1 registro/.test(document.getElementById("cad-total").textContent));
    await page.click("#cad-btn-novo");
    assert.ok(await page.isHidden("#cad-f-transportadora_id"), "id da transportadora não aparece");
    // CPF primeiro: máscara, vermelho, sugestão do CPF parecido e trava de duplicidade
    const ordem = await page.$$eval("#cad-form input:not([type=hidden])", l => l.map(e => e.id));
    assert.strictEqual(ordem[0], "cad-f-cpf", "CPF é o primeiro campo");
    await page.fill("#cad-f-cpf", "529");
    assert.ok(await page.$eval("#cad-f-cpf", e => e.classList.contains("campo-invalido")));
    assert.match(await page.locator("#cad-sug-cpf").innerText(), /529.982.247-25 · Elon Silva Musk/);
    await page.fill("#cad-f-cpf", "52998224725");
    assert.strictEqual(await page.inputValue("#cad-f-cpf"), "529.982.247-25");
    assert.match(await page.locator("#cad-sug-cpf").innerText(), /já cadastrado para Elon Silva Musk/);
    await page.fill("#cad-f-nome", "Elon S. Musk");
    await page.click("#cad-btn-salvar");
    await page.waitForFunction(() => /não dá para cadastrar de novo/.test(document.getElementById("cad-status").textContent));
    await page.fill("#cad-f-cpf", "11144477735");
    assert.ok(!(await page.$eval("#cad-f-cpf", e => e.classList.contains("campo-invalido"))));
    await page.fill("#cad-f-celular", "31987654321");
    assert.strictEqual(await page.inputValue("#cad-f-celular"), "(31) 98765-4321");
    await page.fill("#cad-f-nome", "Motorista Teste");
    await page.fill("#cad-f-transportadora", "c");
    assert.strictEqual(await page.locator("#cad-sug-transportadora .cad-sugestao").count(), 0, "1 letra: sem sugestão");
    await page.fill("#cad-f-transportadora", "CA");
    assert.deepStrictEqual(await page.locator("#cad-sug-transportadora .cad-sugestao").allInnerTexts(), ["Cat Log", "Transcarga"]);
    await page.click("#cad-sug-transportadora >> text=Cat Log");
    assert.strictEqual(await page.inputValue("#cad-f-transportadora"), "Cat Log");
    await page.click("#cad-btn-salvar");
    await page.waitForFunction(() => /Salvo/.test(document.getElementById("cad-status").textContent));
    assert.strictEqual(S.cad[S.cad.length - 1].dados.transportadora_id, "3");
    assert.strictEqual(S.cad[S.cad.length - 1].dados.cpf, "111.444.777-35");
    console.log("ok - Motorista: transportadora pelo nome com sugestões");

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
