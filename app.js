// v6.0.0 - Envio de grua completo (Supabase). Clientes: CNPJ vermelho até ter 14 dígitos e com máscara antes da busca; "+ Cadastrar obra" já ligada ao
//          cliente, lista das obras do cliente, obra pode ter CNPJ (SPE), trocar cliente ↔ obra; envio: obra = o cliente
// v5.23.0 - Cadastros: cliente pelo CNPJ (BrasilAPI preenche razão social e endereço), obra como sub-cadastro da
//          construtora, botão Excluir (desativa se já usado); motorista guarda as últimas placas e o romaneio as sugere
// v5.22.1 - Envio de grua: base sem regra de torre aparece marcada e a altura vazia explica o que falta
// v5.22.0 - Telas 6) Envio de grua (envios por cliente – GT, configurador → romaneios por veículo, conferência por
//          QR/digitada, mover peça, fotos, dados da carreta, confirmar) e 7) Cadastros (peças por Código C, veículos,
//          clientes, transportadoras, motoristas, placas, papéis). Só Supabase (função "romaneio"); Debug passa a ser 8
// v5.21.0 - Tela 2.1) Cadastro Acessórios → Viga: código V em campos com dicas, sequencial sugerido
//          (maior usado + 1), figura do padrão; passa código/individual para o Cadastro
// v5.20.2 - Acessórios → Vigas: ordem pela linha do inventário, mais novas primeiro (mostra a linha)
// v5.20.1 - Espelho do Supabase desligado na publicação (projeto ainda de teste; só "real" tem conta no Auth)
// v5.20.0 - Consultar Inventário: "Itens por inventário" (marca vários NumInv → todas as linhas, em ordem
//          de linha; mode=linhas_inv, Inventário v5.10-inv). Nova tela 5) Acessórios → Vigas (código "V.",
//          ordem alfabética, filtros por tipo/seção/diâmetro/comprimento, verde/vermelho por inventário)
// v5.19.0 - Migração para o Supabase, fase 1 (alimentação dupla): o que o Apps Script grava com sucesso
//          também vai para a função "espelho" do Supabase; falha lá não atrapalha (Debug + rodapé)
// v5.18.0 - Fotos maiores que Full HD são reduzidas no celular antes do envio (1080 no lado menor, JPEG 0,85)
// v5.17.0 - Usuário "consulta" (login genérico): menu só com Consulta ítem e Equipamento, sem "+ Inserir compatível"
// v5.16.2 - "+ Inserir compatível" aceita código 9 com 8 dígitos (Consolidado v4.11)
// v5.16.1 - Código 9 com 8 dígitos não fica mais vermelho (Consulta e Cadastro)
// v5.16.0 - Consulta: "Gruas aplicáveis" mostra também os GTs com peça compatível (GT → Código C usado)
//          e os que receberam a peça por ajuste (inclusão/substituição)
// v5.15.0 - Ajuste (substituição): pergunta se a peça é de outro desenho compatível; se sim, pede o Código C
//          (pré-preenchido quando conhecido) e grava o compatível junto com o ajuste
// v5.14.0 - Equipamento: "+ Inserir compatível" em cada item (código 9 ou C → confere descrições da
//          MachineCards → grava o Código C na RELAÇÃO; outro modelo pede CONFIRMO)
// v5.13.0 - Ajuste: inclusão de peça adicional (opcional comprado), sem ID de fábrica substituído;
//          Equipamento mostra peças incluídas com a etiqueta INCLUSÃO
// v5.12.0 - Ajuste de machine card: após Registrar, confere código 9 + ID na MachineCards; se não existe,
//          tela de ajuste (GT → peça → ID de fábrica substituído; alerta de outro modelo pede CONFIRMO).
//          Equipamento: ID de fábrica em cinza riscado + ID novo com etiqueta AJUSTE
// v5.11.0 - Equipamento: conferência por inventário (várias seleções); ID verde = inventariado
//          (toque abre a Consulta ítem já consultada), vermelho = não inventariado
// v5.10.0 - Tela 4) Equipamento: grua → GT → lança → lanças e tirantes com machine cards do GT
//         (Debug passa a ser 5)
// v5.9.0 - Registrar trava até terminar registro + fotos; ciclo de até 4 fotos após registrar
//        - Tempo limite: 30s registro, 60s por foto; contagem no sinal do topo e "tempo esgotado" em amarelo
// v5.8.2 - Rodapé com a versão em execução; avisa se index.html e app.js estão em versões diferentes
// v5.8.1 - index.html carrega app.js/style.css com ?v= (evita cache antigo no celular); versão no menu
// v5.8.0 - Sinal de comunicação no topo: vermelho (em andamento), verde (pronto), amarelo (terminou com erro)
// v5.7.0 - Cadastro com leitura de QR, "Último inventário" (mode=ultimo_numinv) e GPS marcado
//        - Consulta ítem seção 4: botão Localização (Google Maps a partir do GPS gravado)
// v5.6.0 - Seção 5 "Dados completos": Busca completa por Código 9 (lista_inv + patrimonio_por_h)
//        - Clique em uma ocorrência abre Consultar Inventário com a linha preenchida
// v5.5.0 - Login com usuário + senha por pessoa (validado nos Apps Scripts)
//        - Todas as chamadas enviam user/pass; "acesso negado" volta para o login
// v5.4.0 - Consulta ítem dividida em 4 seções + botão Consultar na própria tela
//        - Seção "Último inventário" (mode=ultimo_inv): Data, Pátio, Rua, Andar e fotos
// v5.2.1 - Modal foto fecha automático após selecionar
//        - Registrar (novo item): se quiser foto -> sempre slot=1 (não pergunta)
//        - Observações (obs-input) grava na coluna M (OBS) via log_mov

const APP_VERSION = "v6.0.0";

const ENDPOINT_CONSULTA =
  "https://script.google.com/a/macros/realguindastes.com/s/AKfycbxE5uwmWek7HDPlBh1cD52HPDsIREptl31j-BTt2wXWaoj2KxOYQiVXmHMAP0PiDjeT/exec";

const ENDPOINT_REGISTRO =
  "https://script.google.com/a/macros/realguindastes.com/s/AKfycbxClcs2PLsAt7RjwMxV-ThLMVevpPesjnyH1rDrse6ORbPNgbP4-xAOSuq5O1xIWZ2j/exec";

// Supabase (migração, fase 1): gravações aceitas pelo Apps Script são repetidas na função "espelho".
// false = desliga o espelho (o app volta a usar só o Google).
const ESPELHO_SUPABASE = false;
const SUPABASE_URL = "https://xmrkwychewovxqsvqxxk.supabase.co";
const SUPABASE_CHAVE = "sb_publishable_J7TEpA4OOKxJs6RRiil4yg_pTzDPMp8"; // chave pública (publishable)
const SUPABASE_EMAIL_DOMINIO = "estoque.realguindastes.com";            // usuário "fernando" = fernando@…
const ESPELHO_TIMEOUT_MS = 20000;

let html5QrCode;
let scannerRunning = false;
let leituraProcessada = false;
let lastHandledAt = 0;

let gpsString = "";

// URLs das fotos do último get_lin
let FOTO_URLS = { 1:"", 2:"", 3:"", 4:"" };

// URLs das fotos do último inventário (tela Consulta ítem)
let FOTO_URLS_ULT = { 1:"", 2:"", 3:"", 4:"" };

// Link do Google Maps do último inventário (tela Consulta ítem)
let ULT_GPS_URL = "";

// Modal/upload control
let pendingFoto = null; // {row, slot, origem}

/* =========================
   UI: Menu lateral + telas
========================= */

let CURRENT_SCREEN = "consulta";

function setScreenName(nome) {
  const el = document.getElementById("screenName");
  if (el) el.textContent = nome || "";
}

function openMenu() {
  document.getElementById("sidebar")?.classList.add("open");
  document.getElementById("overlay")?.classList.add("show");
}

function closeMenu() {
  document.getElementById("sidebar")?.classList.remove("open");
  document.getElementById("overlay")?.classList.remove("show");
}

function showScreen(key) {
  const map = {
    consulta: { id: "screen-consulta", name: "Consulta ítem" },
    cadastro: { id: "screen-cadastro", name: "Cadastro" },
    cadacess: { id: "screen-cadacess", name: "Cadastro Acessórios" },
    inventario: { id: "screen-inventario", name: "Consultar Inventário" },
    equipamento: { id: "screen-equipamento", name: "Equipamento" },
    acessorios: { id: "screen-acessorios", name: "Acessórios" },
    ajuste: { id: "screen-ajuste", name: "Ajuste de machine card" },
    envio: { id: "screen-envio", name: "Envio de grua" },
    cadastros: { id: "screen-cadastros", name: "Cadastros" },
    debug: { id: "screen-debug", name: "Debug" },
  };

  // Só uma câmera por vez: trocar de tela para o leitor
  const mudou = key !== CURRENT_SCREEN;
  if (mudou) pararLeitor();

  Object.keys(map).forEach(k => {
    const sec = document.getElementById(map[k].id);
    if (sec) sec.hidden = (k !== key);
  });

  document.querySelectorAll(".nav button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.screen === key);
  });

  CURRENT_SCREEN = key;
  setScreenName(map[key]?.name || "");

  if (key === "cadastro" && AUTH.user) carregarUltimoNumInv();
  if (key === "equipamento" && AUTH.user) {
    if (!EQ.gruasCarregadas) carregarGruasEq();
    carregarInventariosEq(); // sempre atualiza: pode ter havido registro novo
  }
  // Ao entrar na tela (não a cada linha aberta pela lista): recarrega, pode ter havido registro novo
  if (key === "inventario" && mudou && AUTH.user) carregarInvSel();
  if (key === "acessorios" && mudou && AUTH.user) carregarVigas();
  if (key === "cadacess" && mudou && AUTH.user) carregarCadAcess();
  if (key === "envio" && mudou && AUTH.user) abrirEnvio();
  if (key === "cadastros" && mudou && AUTH.user) abrirCadastros();
}

/* =========================
   UI: Binding (campo1/campo2 duplicados no Cadastro)
========================= */

function setCampo1Classes(el, valor) {
  if (!el) return;
  el.classList.remove("campo1-ok", "campo1-bad");
  const s = String(valor || "").trim(), len = s.length;
  if (len === 8 || len === 9 || /^V\./i.test(s)) el.classList.add("campo1-ok"); // código 9 antigo pode ter 8 dígitos; V. = viga
  else el.classList.add("campo1-bad");
}

function syncCampo1ToCadastro() {
  const master = document.getElementById("campo1");
  const slave  = document.getElementById("campo1_cad");
  if (!master || !slave) return;
  slave.value = master.value;
  setCampo1Classes(master, master.value);
  setCampo1Classes(slave, slave.value);
  atualizarBotaoBuscaCompleta();
}

function syncCampo2ToCadastro() {
  const master = document.getElementById("campo2");
  const slave  = document.getElementById("campo2_cad");
  if (!master || !slave) return;
  slave.value = master.value;
}

function syncCadastroToMaster() {
  const master1 = document.getElementById("campo1");
  const slave1  = document.getElementById("campo1_cad");
  if (master1 && slave1) {
    master1.value = slave1.value;
    setCampo1Classes(master1, master1.value);
    setCampo1Classes(slave1, slave1.value);
    atualizarBotaoBuscaCompleta();
  }

  const master2 = document.getElementById("campo2");
  const slave2  = document.getElementById("campo2_cad");
  if (master2 && slave2) master2.value = slave2.value;
}

function logDebug(msg) {
  const el = document.getElementById("debug-log");
  const ts = new Date().toLocaleTimeString();
  if (el) { el.value += `[${ts}] ${msg}\n`; el.scrollTop = el.scrollHeight; }
}

/* =========================
   LOGIN (usuário + senha por pessoa, validados nos Apps Scripts)
========================= */

const AUTH_KEY = "ce_auth";
let AUTH = { user:"", pass:"" };

function carregarAuth() {
  try {
    const j = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    if (j && j.user && j.pass) AUTH = { user:String(j.user), pass:String(j.pass) };
  } catch {}
}

function salvarAuth() {
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(AUTH)); } catch {}
}

function authParams() {
  return `&user=${encodeURIComponent(AUTH.user)}&pass=${encodeURIComponent(AUTH.pass)}`;
}

// Login genérico só de leitura: vê Consulta ítem e Equipamento (os Apps Scripts recusam as gravações)
function ehUsuarioConsulta() {
  return AUTH.user.trim().toLowerCase() === "consulta";
}

function atualizarUsuarioUI() {
  const el = document.getElementById("user-info");
  if (el) el.textContent = (AUTH.user ? `Usuário: ${AUTH.user} · ` : "") + APP_VERSION;
  const soConsulta = ehUsuarioConsulta();
  const telasConsulta = ["consulta", "equipamento", "acessorios"];
  document.querySelectorAll(".nav button").forEach(btn => {
    btn.hidden = soConsulta && !telasConsulta.includes(btn.dataset.screen);
  });
  if (soConsulta && !telasConsulta.includes(CURRENT_SCREEN)) showScreen("consulta");
}

function mostrarLogin(msg) {
  const tela = document.getElementById("login-screen");
  const st = document.getElementById("login-msg");
  if (st) st.innerText = msg || "";
  if (tela) tela.hidden = false;
  document.getElementById("login-user")?.focus();
}

function sair(msg) {
  AUTH = { user:"", pass:"" };
  SB.token = "";
  try { localStorage.removeItem(AUTH_KEY); } catch {}
  atualizarUsuarioUI();
  closeMenu();
  mostrarLogin(msg || "");
}

function respostaNegada(raw) {
  let j = null; try { j = JSON.parse(raw); } catch {}
  return !!(j && j.auth === false);
}

/* =========================
   SINAL DE COMUNICAÇÃO (topo da página)
   Conta as chamadas em andamento: vermelho enquanto houver alguma,
   verde quando todas terminaram, amarelo se alguma do lote falhou.
========================= */

const NET = { ativos: 0, erro: false, tempoEsgotado: false, prazos: new Set(), relogio: null };

function renderSinal() {
  const el = document.getElementById("net-status");
  const txt = document.getElementById("net-text");
  if (!el) return;
  const estado = NET.ativos > 0 ? "ocupado" : (NET.erro ? "erro" : "pronto");
  el.dataset.estado = estado;

  // Chamada com tempo limite em andamento (registro/foto): mostra a contagem regressiva
  const prazo = NET.prazos.size ? Math.max(...NET.prazos) : 0;
  const resta = prazo ? Math.max(0, Math.ceil((prazo - Date.now()) / 1000)) : 0;

  const rotulo = {
    ocupado: prazo ? `Gravando… ${resta}s` : "Consultando…",
    pronto: "Pronto",
    erro: NET.tempoEsgotado ? "tempo esgotado" : "erro"
  }[estado];
  const dica = {
    ocupado: prazo ? `Gravação em andamento (tempo limite em ${resta}s)` : "Consulta em andamento",
    pronto: "Consulta terminou",
    erro: NET.tempoEsgotado ? "O servidor não respondeu dentro do tempo limite (ver Debug)" : "Consulta terminou com erro (ver Debug)"
  }[estado];
  if (txt) txt.textContent = rotulo;
  el.title = NET.ativos > 1 ? `${dica} (${NET.ativos} chamadas)` : dica;
}

function netInicio() {
  if (NET.ativos === 0) { NET.erro = false; NET.tempoEsgotado = false; } // novo lote
  NET.ativos++;
  renderSinal();
}

function netFim(ok) {
  if (!ok) NET.erro = true;
  NET.ativos = Math.max(0, NET.ativos - 1);
  renderSinal();
}

function prazoInicio(ms) {
  const prazo = Date.now() + ms;
  NET.prazos.add(prazo);
  if (!NET.relogio) NET.relogio = setInterval(renderSinal, 1000);
  return prazo;
}

function prazoFim(prazo) {
  NET.prazos.delete(prazo);
  if (!NET.prazos.size && NET.relogio) { clearInterval(NET.relogio); NET.relogio = null; }
}

// Erro lançado quando a chamada passa do tempo limite
function erroTempoEsgotado(err) {
  return !!(err && err.name === "TempoEsgotado");
}

// Resposta "ok" = HTTP 2xx, JSON válido e sem ok:false
function respostaOk(resp, raw) {
  if (!resp.ok) return false;
  let j = null; try { j = JSON.parse(raw); } catch {}
  return !!(j && j.ok !== false);
}

// fetch com sinal; retorna { resp, raw } (o texto completo da resposta).
// tempoMs: se informado, desiste depois desse tempo e lança erro "TempoEsgotado".
// semSinal: não mexe no sinal do topo (espelho do Supabase: falha lá não pode parecer que o registro falhou)
async function netFetch(url, opts, tempoMs, semSinal) {
  if (!semSinal) netInicio();
  let ok = false, prazo = 0, timer = null;
  const ctrl = tempoMs ? new AbortController() : null;
  if (ctrl) {
    if (!semSinal) prazo = prazoInicio(tempoMs);
    timer = setTimeout(() => ctrl.abort(), tempoMs);
  }
  try {
    const resp = await fetch(url, Object.assign({}, opts, ctrl ? { signal: ctrl.signal } : {}));
    const raw = await resp.text();
    ok = respostaOk(resp, raw);
    return { resp, raw };
  } catch (err) {
    if (ctrl && ctrl.signal.aborted) {
      if (!semSinal) NET.tempoEsgotado = true;
      const e = new Error(`Tempo esgotado (${Math.round(tempoMs / 1000)}s)`);
      e.name = "TempoEsgotado";
      throw e;
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
    if (prazo) prazoFim(prazo);
    if (!semSinal) netFim(ok);
  }
}

// GET com credenciais; retorna o texto da resposta (o log mostra a URL sem a senha)
async function apiGet(url, tempoMs) {
  const { raw } = await netFetch(url + authParams(), undefined, tempoMs);
  if (respostaNegada(raw)) {
    logDebug("Acesso negado pelo servidor. Voltando para o login.");
    sair("Acesso negado. Entre novamente.");
  }
  return raw;
}

async function fazerLogin(ev) {
  if (ev) ev.preventDefault();
  const user = (document.getElementById("login-user")?.value || "").trim();
  const pass = document.getElementById("login-pass")?.value || "";
  const st = document.getElementById("login-msg");

  if (!user || !pass) { if (st) st.innerText = "Informe usuário e senha."; return; }
  if (st) st.innerText = "Verificando...";

  AUTH = { user, pass };
  try {
    // Valida nos dois scripts (cada um tem sua própria lista de USUARIOS)
    const urls = [ENDPOINT_REGISTRO, ENDPOINT_CONSULTA].map(e => `${e}?mode=login&t=${Date.now()}`);
    const raws = await Promise.all(urls.map(u => netFetch(u + authParams()).then(x => x.raw)));
    const oks = raws.map(raw => { let j=null; try{ j=JSON.parse(raw); }catch{} return !!(j && j.ok); });

    if (oks[0] && oks[1]) {
      salvarAuth();
      atualizarUsuarioUI();
      document.getElementById("login-pass").value = "";
      document.getElementById("login-screen").hidden = true;
      if (st) st.innerText = "";
      logDebug(`Login OK: ${user}`);
      if (ESPELHO_SUPABASE && !ehUsuarioConsulta()) {
        sbEntrar().then(() => logDebug("Supabase: login OK")).catch(e => logDebug("Supabase: " + (e.message || e)));
      }
    } else {
      AUTH = { user:"", pass:"" };
      if (st) st.innerText = (oks[0] || oks[1])
        ? "Usuário aceito em apenas uma das planilhas. Verifique USUARIOS nos dois Apps Scripts."
        : "Usuário ou senha inválidos.";
      logDebug(`Login recusado: ${user} (registro=${oks[0]}, consulta=${oks[1]})`);
    }
  } catch (err) {
    AUTH = { user:"", pass:"" };
    if (st) st.innerText = "Erro de rede ao entrar (ver debug).";
    logDebug("Erro login: " + err);
  }
}

carregarAuth();

/* =========================
   SUPABASE: alimentação dupla (fase 1 da migração)
   O Google continua sendo o principal. Depois que o Apps Script confirma uma gravação, o mesmo registro
   vai para a função "espelho" (mesmo número de linha). Falha no Supabase só aparece no Debug e no rodapé.
   Login: mesmo usuário/senha no Supabase Auth (e-mail usuario@SUPABASE_EMAIL_DOMINIO); token só na memória.
========================= */

const SB = { token: "", expira: 0, falhas: 0 };

async function sbEntrar() {
  SB.token = "";
  const email = `${AUTH.user.trim().toLowerCase()}@${SUPABASE_EMAIL_DOMINIO}`;
  const { resp, raw } = await netFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_CHAVE, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: AUTH.pass })
  }, ESPELHO_TIMEOUT_MS, true);
  let j = null; try { j = JSON.parse(raw); } catch {}
  if (!resp.ok || !j || !j.access_token) {
    throw new Error("login no Supabase recusado: " + ((j && (j.msg || j.error_description || j.error)) || `HTTP ${resp.status}`));
  }
  SB.token = j.access_token;
  SB.expira = Date.now() + ((Number(j.expires_in) || 3600) - 60) * 1000;
}

async function espelhoPost(modo, dados) {
  if (!SB.token || Date.now() > SB.expira) await sbEntrar();
  const { raw } = await netFetch(`${SUPABASE_URL}/functions/v1/espelho`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SB.token}`, apikey: SUPABASE_CHAVE, "Content-Type": "application/json" },
    body: JSON.stringify(Object.assign({ modo }, dados))
  }, ESPELHO_TIMEOUT_MS, true);
  let j = null; try { j = JSON.parse(raw); } catch {}
  return j || { ok: false, error: "resposta inválida: " + String(raw).slice(0, 200) };
}

// Chamar só depois que o Apps Script confirmou a gravação. Não é esperado pela tela e nunca lança erro.
function espelhar(modo, dados) {
  if (!ESPELHO_SUPABASE || ehUsuarioConsulta()) return Promise.resolve();
  return (async () => {
    try {
      let j = await espelhoPost(modo, dados);
      if (j.auth === false) { SB.token = ""; j = await espelhoPost(modo, dados); } // token vencido: entra de novo
      if (!j.ok) throw new Error(j.error || "ok:false");
      logDebug(`Supabase ${modo}: ${j.detalhe || "ok"}`);
    } catch (err) {
      SB.falhas++;
      logDebug(`Supabase ${modo} FALHOU: ${(err && err.message) || err}`);
      atualizarRodapeVersao();
    }
  })();
}

// Rodapé: mostra a versão do app.js; se o index.html for de outra versão, há arquivo antigo em cache
function atualizarRodapeVersao() {
  const el = document.getElementById("app-footer");
  if (!el) return;
  const versaoHtml = document.querySelector('meta[name="app-version"]')?.content || "";
  const espelho = SB.falhas ? ` · Supabase: ${SB.falhas} falha${SB.falhas > 1 ? "s" : ""} (ver Debug)` : "";
  if (versaoHtml && versaoHtml !== APP_VERSION) {
    el.textContent = `Controle de Estoque · ${APP_VERSION} · página ${versaoHtml}: recarregue para atualizar${espelho}`;
    el.classList.add("app-footer-aviso");
    logDebug(`Versões diferentes: index.html=${versaoHtml}, app.js=${APP_VERSION}`);
  } else {
    el.textContent = `Controle de Estoque · ${APP_VERSION}${espelho}`;
  }
}

logDebug(`Carregado app.js versão ${APP_VERSION}`);
logDebug(`ENDPOINT_CONSULTA: ${ENDPOINT_CONSULTA}`);
logDebug(`ENDPOINT_REGISTRO: ${ENDPOINT_REGISTRO}`);
logDebug(`Espelho Supabase: ${ESPELHO_SUPABASE ? SUPABASE_URL : "desligado"}`);

window.addEventListener("DOMContentLoaded", () => {

  // Menu lateral
  const btnMenu = document.getElementById("btnMenu");
  const btnClose = document.getElementById("btnClose");
  const overlay = document.getElementById("overlay");

  if (btnMenu) btnMenu.addEventListener("click", openMenu);
  if (btnClose) btnClose.addEventListener("click", closeMenu);
  if (overlay) overlay.addEventListener("click", closeMenu);

  document.querySelectorAll(".nav button").forEach(btn => {
    btn.addEventListener("click", () => {
      showScreen(btn.dataset.screen);
      closeMenu();
    });
  });

  // ESC fecha o menu
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  atualizarRodapeVersao();

  // Tela padrão
  showScreen("consulta");

  // Ajuste de machine card
  document.getElementById("aj-gt")?.addEventListener("change", onGtAjuste);
  document.getElementById("aj-confirmo")?.addEventListener("input", atualizarBotaoAjuste);
  document.getElementById("aj-gravar")?.addEventListener("click", gravarAjuste);
  document.getElementById("aj-voltar")?.addEventListener("click", () => showScreen(AJ.voltar || "cadastro"));

  // Equipamento
  document.getElementById("eq-grua")?.addEventListener("change", onGruaEq);
  document.getElementById("eq-gt")?.addEventListener("change", onGtEq);
  document.getElementById("eq-lanca")?.addEventListener("change", renderListaEq);
  // Cadastro Acessórios → Viga
  VC_NUM.forEach(id => document.getElementById(id)?.addEventListener("input", e => {
    const so = e.target.value.replace(/\D/g, "");
    if (so !== e.target.value) e.target.value = so;
    atualizarCodigoViga();
  }));
  ["vc-tipo", "vc-secao"].forEach(id => document.getElementById(id)?.addEventListener("change", atualizarCodigoViga));
  document.getElementById("vc-usar")?.addEventListener("click", usarCodigoViga);
  ["vg-tipo", "vg-secao", "vg-diametro", "vg-comprimento"].forEach(id =>
    document.getElementById(id)?.addEventListener("change", renderVigas));

  // Login
  document.getElementById("login-form")?.addEventListener("submit", fazerLogin);
  document.getElementById("btn-sair")?.addEventListener("click", () => sair());
  atualizarUsuarioUI();
  if (!AUTH.user || !AUTH.pass) mostrarLogin("");

  const rua = document.getElementById("rua-input");
  const andar = document.getElementById("andar-input");
  const campo1 = document.getElementById("campo1");
  const codigoC = document.getElementById("codigo-c-input");
  const numInv = document.getElementById("numinv-input");
  const campo1Cad = document.getElementById("campo1_cad");
  const campo2Cad = document.getElementById("campo2_cad");


  function onlyDigits(el, label) {
    if (!el) return;
    el.addEventListener("input", () => {
      const before = el.value;
      const after = before.replace(/\D+/g, "");
      if (before !== after) {
        el.value = after;
        logDebug(`${label}: removidos caracteres não numéricos.`);
      }
    });
  }

  onlyDigits(rua, "Rua");
  onlyDigits(andar, "Andar");
  onlyDigits(numInv, "NumInv");
  onlyDigits(codigoC, "Codigo C");
  if (codigoC) codigoC.addEventListener("input", atualizarBotaoBuscaCompleta);

  if (campo1) campo1.addEventListener("input", () => setCampo1CorPorTamanho(campo1.value.trim()));

  // Bind: master (Consulta) <-> Cadastro (duplicados)
  if (campo1) campo1.addEventListener("input", () => { syncCampo1ToCadastro(); });
  if (campo2) campo2.addEventListener("input", () => { syncCampo2ToCadastro(); });

  if (campo1Cad) campo1Cad.addEventListener("input", () => { syncCadastroToMaster(); });
  if (campo2Cad) campo2Cad.addEventListener("input", () => { syncCadastroToMaster(); });

  // Inicializa duplicados
  syncCampo1ToCadastro();
  syncCampo2ToCadastro();


  // Substituir foto (pede slot 1..4)
  const btnSub = document.getElementById("btn-substfoto");
  if (btnSub) btnSub.addEventListener("click", () => substituirFotoLinhaUI());

  // Modal handlers
  const btnOpen = document.getElementById("foto-modal-open");
  const btnCancel = document.getElementById("foto-modal-cancel");
  const fileInput = document.getElementById("foto-input");

  if (btnOpen && fileInput) {
    btnOpen.addEventListener("click", () => {
      fileInput.value = ""; // permite escolher o mesmo arquivo novamente
      fileInput.click();    // gesto do usuário => mobile abre câmera
    });
  }

  // Cancelar / Concluir: encerra o ciclo de fotos (e destrava o Registrar, se veio dele)
  if (btnCancel) {
    btnCancel.addEventListener("click", () => encerrarCicloFotos());
  }

  if (fileInput) {
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return; // câmera cancelada: a janela continua aberta

      if (!pendingFoto || !pendingFoto.row || !pendingFoto.slot) {
        logDebug("foto-input: pendingFoto vazio. Cancelando upload.");
        encerrarCicloFotos();
        return;
      }

      const { row, slot, origem } = pendingFoto;
      logDebug(`Foto selecionada (${origem}). row=${row}, slot=${slot}, name=${file.name}, type=${file.type}, size=${file.size}`);

      // A janela fica aberta mostrando o envio (botões travados)
      estadoModalFoto({ texto: `Linha ${row} — enviando Foto ${slot}…`, abrir: null, fechar: null });
      setStatusCadastro(`Enviando Foto ${slot} da linha ${row}…`);

      try {
        const j = await uploadFotoParaLinha(row, slot, file);
        logDebug(`Foto OK: row=${j.row} slot=${j.slot} url=${j.fotoUrl}`);
        setStatusCadastro(`Foto ${slot} enviada (linha ${row}).`);
        consultarLinhaInventario(row); // atualiza resumo + habilita/desabilita botões

        if (origem === "registrar" && slot < 4) {
          // Próxima foto: precisa de um toque do usuário para abrir a câmera
          pendingFoto = { row, slot: slot + 1, origem };
          estadoModalFoto({
            texto: `Linha ${row} — Foto ${slot} enviada ✓. Adicionar outra foto?`,
            abrir: `Tirar Foto ${slot + 1}`, fechar: "Concluir"
          });
        } else {
          estadoModalFoto({ texto: `Linha ${row} — Foto ${slot} enviada ✓.`, abrir: null, fechar: "Concluir" });
        }
      } catch (e) {
        logDebug("Erro ao processar/enviar foto: " + e);
        const motivo = erroTempoEsgotado(e)
          ? `tempo esgotado (${FOTO_TIMEOUT_MS / 1000}s). Confira em Consultar Inventário antes de reenviar.`
          : "falha no envio (ver Debug).";
        setStatusCadastro(`Foto ${slot} da linha ${row}: ${motivo}`);
        estadoModalFoto({
          texto: `Linha ${row} — Foto ${slot}: ${motivo}`,
          abrir: "Tentar de novo", fechar: "Concluir"
        });
      }
    });
  }

  // Inicializa botões visíveis e desabilitados
  atualizarBotoesFotos({ fotoUrl:"", fotoUrl2:"", fotoUrl3:"", fotoUrl4:"" });
});

function setCampo1CorPorTamanho(valor) {
  const el = document.getElementById("campo1");
  setCampo1Classes(el, valor);
  const elCad = document.getElementById("campo1_cad");
  setCampo1Classes(elCad, valor);
}

function limparDebug() { const el = document.getElementById("debug-log"); if (el) el.value = ""; }
function copiarDebug() { const el = document.getElementById("debug-log"); if (!el) return; el.select(); document.execCommand("copy"); }

/* =========================
   Fotos: botões sempre visíveis (disabled quando vazio)
========================= */

function atualizarBotoesFotos(d) {
  FOTO_URLS[1] = String(d.fotoUrl  || "").trim();
  FOTO_URLS[2] = String(d.fotoUrl2 || "").trim();
  FOTO_URLS[3] = String(d.fotoUrl3 || "").trim();
  FOTO_URLS[4] = String(d.fotoUrl4 || "").trim();

  for (let i=1;i<=4;i++){
    const btn = document.getElementById(`btn-abrirfoto${i}`);
    if (!btn) continue;
    const url = FOTO_URLS[i];
    btn.disabled = !url;
    btn.title = url ? url : "Sem foto nesta posição";
  }
}

function abrirFoto(slot) {
  const url = FOTO_URLS[Number(slot)] || "";
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

function atualizarBotoesFotosUlt(d) {
  FOTO_URLS_ULT[1] = String(d.fotoUrl  || "").trim();
  FOTO_URLS_ULT[2] = String(d.fotoUrl2 || "").trim();
  FOTO_URLS_ULT[3] = String(d.fotoUrl3 || "").trim();
  FOTO_URLS_ULT[4] = String(d.fotoUrl4 || "").trim();

  for (let i=1;i<=4;i++){
    const btn = document.getElementById(`btn-ult-foto${i}`);
    if (!btn) continue;
    const url = FOTO_URLS_ULT[i];
    btn.disabled = !url;
    btn.title = url ? url : "Sem foto nesta posição";
  }
}

function abrirFotoUlt(slot) {
  const url = FOTO_URLS_ULT[Number(slot)] || "";
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

/* =========================
   Modal foto
========================= */

function abrirModalFoto(row, slot, origem) {
  pendingFoto = { row:Number(row), slot:Number(slot), origem:String(origem||"") };

  estadoModalFoto({
    texto: `Linha ${row} — Foto ${slot}: toque em "Abrir câmera / selecionar arquivo"`,
    abrir: "Abrir câmera / selecionar arquivo", fechar: "Cancelar"
  });
  const modal = document.getElementById("foto-modal");
  if (modal) modal.style.display = "block";
}

// Atualiza texto e botões da janela de foto. abrir/fechar = rótulo, ou null para esconder/travar.
function estadoModalFoto({ texto, abrir, fechar }) {
  const txt = document.getElementById("foto-modal-text");
  const btnOpen = document.getElementById("foto-modal-open");
  const btnCancel = document.getElementById("foto-modal-cancel");
  if (txt) txt.innerText = texto || "";
  if (btnOpen) {
    btnOpen.hidden = !abrir;
    if (abrir) btnOpen.textContent = abrir;
  }
  if (btnCancel) {
    btnCancel.disabled = !fechar;
    btnCancel.textContent = fechar || "Aguarde…";
  }
}

function fecharModalFoto() {
  const modal = document.getElementById("foto-modal");
  if (modal) modal.style.display = "none";
}

function encerrarCicloFotos() {
  fecharModalFoto();
  const veioDoRegistro = pendingFoto && pendingFoto.origem === "registrar";
  pendingFoto = null;
  if (veioDoRegistro || REGISTRO_EM_CURSO) travarRegistro(false);
}

/* =========================
   QR / Scanner
========================= */

function iniciarLeitor(alvoId = "qr-reader") {
  if (scannerRunning) return;
  logDebug(`Iniciando leitor (${alvoId})...`);
  html5QrCode = new Html5Qrcode(alvoId);

  leituraProcessada = false;
  lastHandledAt = 0;

  const config = { fps: 10, qrbox: 250 };

  html5QrCode.start(
    { facingMode: { exact: "environment" } },
    config,
    qrCodeMessage => processarQRCode(qrCodeMessage)
  ).then(() => {
    scannerRunning = true;
    logDebug("Leitor iniciado com facingMode=environment.");
  }).catch(async (err) => {
    logDebug("Falhou facingMode=environment, listando câmeras... " + err);
    try {
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || !cameras.length) { logDebug("Nenhuma câmera encontrada."); return; }
      const preferidas = cameras.filter(c => /back|rear|traseira|environment/i.test(c.label || ""));
      const escolhida = preferidas[0] || cameras[cameras.length - 1];
      logDebug("Câmera escolhida: " + (escolhida.label || escolhida.id));
      html5QrCode.start(
        escolhida.id,
        config,
        qrCodeMessage => processarQRCode(qrCodeMessage)
      ).then(() => {
        scannerRunning = true;
        leituraProcessada = false;
        lastHandledAt = 0;
        logDebug("Leitor iniciado com cameraId selecionada.");
      }).catch(e2 => logDebug("Erro ao iniciar com cameraId: " + e2));
    } catch (e) {
      logDebug("Erro ao obter lista de câmeras: " + e);
    }
  });
}

function pararLeitor() {
  if (html5QrCode && scannerRunning) {
    logDebug("Parando leitor...");
    html5QrCode.stop().then(() => {
      html5QrCode.clear();
      scannerRunning = false;
      logDebug("Leitor parado e área limpa.");
    }).catch(err => logDebug("Erro ao parar leitor: " + err));
  }
}

function processarQRCode(qrCodeMessage) {
  const now = Date.now();
  if (leituraProcessada || (now - lastHandledAt) < 800) {
    logDebug("Leitura ignorada (debounce ativo).");
    return;
  }
  leituraProcessada = true;
  lastHandledAt = now;

  logDebug("QR bruto lido: " + qrCodeMessage);
  const partes = qrCodeMessage.split("|").filter(Boolean);
  logDebug("Partes após split('|'): " + JSON.stringify(partes));

  if (partes.length < 2) {
    logDebug("Formato inválido: esperado ao menos parte0 e parte1.");
    leituraProcessada = false;
    return;
  }

  pararLeitor();

  const parte0 = String(partes[0]).trim();
  const parte1Original = String(partes[1] || "").trim();
  let parte1Limpo = parte1Original.replace(/^0+/, "");
  if (parte1Limpo === "") parte1Limpo = "0";

  // Envio de grua: a leitura vai para o romaneio aberto (conferência), não para a Consulta
  if (CURRENT_SCREEN === "envio" && ENV.view === "romaneio") {
    leituraProcessada = false;
    lerPecaEnvio(parte0, parte1Limpo, { manual: false });
    return;
  }

  document.getElementById("codigo-lido").value = qrCodeMessage;
  const lidoCad = document.getElementById("codigo-lido-cad");
  if (lidoCad) lidoCad.value = qrCodeMessage;
  document.getElementById("campo1").value = parte0;
  document.getElementById("campo2").value = parte1Limpo;

  // sincroniza duplicados no Cadastro
  syncCampo1ToCadastro();
  syncCampo2ToCadastro();

  setCampo1CorPorTamanho(parte0);
  logDebug(`Parte[1] original: ${parte1Original} | limpa: ${parte1Limpo}`);

  consultarDados();
}

/* =========================
   CONSULTA (Consolidado) - mantém seu fluxo atual
========================= */

function consultarDados() {
  const parte0 = (document.getElementById("campo1")?.value || "").trim();
  let parte1 = (document.getElementById("campo2")?.value || "").trim();
  const codigoC = (document.getElementById("codigo-c-input")?.value || "").trim();

  const elI = document.getElementById("resultado-google");
  const elGruas = document.getElementById("gruas-aplicaveis");
  const elExata = document.getElementById("correspondencia-exata");
  const elDescPT = document.getElementById("descricao-pt");

  if (elI) elI.value = "";
  if (elGruas) elGruas.value = "";
  if (elExata) elExata.value = "";
  if (elDescPT) elDescPT.value = "";

  limparUltimoInventario("");
  limparListaInventario();

  if (!parte0) {
    if (!codigoC) {
      if (elI) elI.value = "Não encontrado";
      if (elGruas) elGruas.value = "Não encontrado";
      if (elExata) elExata.value = "Não encontrado";
      if (elDescPT) elDescPT.value = "Não encontrado";
      limparUltimoInventario("Informe Código 9 + Código individual ou o Código C.");
      logDebug("ConsultarUI: campo1 e Codigo C vazios. Nada a fazer.");
      return;
    }

    const chaveL = formatarCodigoC(codigoC);
    logDebug(`ConsultarUI: campo1 vazio -> buscando H por L usando chave "${chaveL}".`);

    const urlHporL = `${ENDPOINT_CONSULTA}?mode=h_por_l&l=${encodeURIComponent(chaveL)}&t=${Date.now()}`;
    logDebug("GET Buscar H por L (L->H): " + urlHporL);

    apiGet(urlHporL).then(raw=>{
      logDebug("Resposta (L->H) raw: " + raw);
      let j=null; try{ j=JSON.parse(raw); }catch{}

      if (j && j.ok && (j.h||"").trim()) {
        const h = String(j.h).trim();
        document.getElementById("campo1").value = h;
        setCampo1CorPorTamanho(h);
        consultarDados();
      } else {
        logDebug("ConsultarUI: não encontrou ocorrência em L.");
        if (elI) elI.value = "Não encontrado";
        if (elGruas) elGruas.value = "Não encontrado";
        if (elExata) elExata.value = "Não encontrado";
        if (elDescPT) elDescPT.value = "Não encontrado";
        limparUltimoInventario("Código C não encontrado.");
      }
    });

    return;
  }

  // Último inventário exige Código 9 AND Código individual (antes de normalizar vazio -> "0")
  const individualInformado = parte1 !== "";

  parte1 = parte1.replace(/^0+/, "");
  if (parte1 === "") parte1 = "0";
  if (document.getElementById("campo2")) document.getElementById("campo2").value = parte1;

  setCampo1CorPorTamanho(parte0);

  const urlI = `${ENDPOINT_CONSULTA}?mode=i_por_h&codigo=${encodeURIComponent(parte0)}`;
  logDebug("GET Resultado da consulta (H->I): " + urlI);
  apiGet(urlI).then(raw=>{
    logDebug("Resposta (H->I) raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}
    if (j && j.ok) { const v=(j.resultado||"").trim(); if (elI) elI.value = v || "Não encontrado"; }
    else { if (elI) elI.value = "Não encontrado"; }
  });

  const urlGruas = `${ENDPOINT_CONSULTA}?mode=gruas&h=${encodeURIComponent(parte0)}`;
  logDebug("GET Gruas aplicáveis (H->C[] & M[]): " + urlGruas);
  apiGet(urlGruas).then(raw=>{
    logDebug("Resposta Gruas raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}
    if (j && j.ok) {
      const listaC = Array.isArray(j.gruasC) ? j.gruasC : [];
      const listaM = Array.isArray(j.gruasM) ? j.gruasM : [];
      const linhas = [];
      if (listaC.length) linhas.push(`Modelos (C): ${listaC.join(", ")}`);
      if (listaM.length) linhas.push(`Aplicações (M): ${listaM.join(", ")}`);
      // Compatíveis: uma linha por código compatível, com os GTs que o usam
      const porCodigo = {};
      (Array.isArray(j.compat) ? j.compat : []).forEach(x => {
        (porCodigo[x.codigoC] = porCodigo[x.codigoC] || []).push(x.gt + (x.ajuste ? " (ajuste)" : ""));
      });
      Object.keys(porCodigo).forEach(c => linhas.push(`Compatíveis: ${porCodigo[c].join(", ")} → ${c}`));
      const ajustes = Array.isArray(j.ajustes) ? j.ajustes : [];
      if (ajustes.length) {
        linhas.push(`Por ajuste: ${ajustes.map(a => `${a.gt} (${a.inclusao ? "inclusão" : "substituição"})`).join(", ")}`);
      }
      const texto = linhas.length ? linhas.join("\n") : "Não encontrado";
      elGruas.value = texto;
      elGruas.style.height = "auto";                       // cresce com as linhas (e quebras no celular)
      elGruas.style.height = (elGruas.scrollHeight + 2) + "px";
    } else {
      document.getElementById("gruas-aplicaveis").value = "Não encontrado";
    }
  });

  const urlExata = `${ENDPOINT_CONSULTA}?mode=exata&h=${encodeURIComponent(parte0)}&k=${encodeURIComponent(parte1)}`;
  logDebug("GET Correspondência exata (H&K->M): " + urlExata);
  apiGet(urlExata).then(raw=>{
    logDebug("Resposta Exata raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}
    document.getElementById("correspondencia-exata").value =
      (j && j.ok && (j.exata||"").trim()) ? (j.exata||"").trim() : "Não encontrado";
  });

  const urlDescPT = `${ENDPOINT_CONSULTA}?mode=desc_pt&h=${encodeURIComponent(parte0)}`;
  logDebug("GET Descrição Português: " + urlDescPT);
  apiGet(urlDescPT).then(raw=>{
    logDebug("Resposta Descrição PT raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}
    document.getElementById("descricao-pt").value =
      (j && j.ok && (j.descricao||"").trim()) ? (j.descricao||"").trim() : "Não encontrado";
  });

  if (individualInformado) {
    consultarUltimoInventario(parte0, parte1);
  } else {
    limparUltimoInventario("Informe o Código individual para ver o último inventário.");
  }
}

/* =========================
   ÚLTIMO INVENTÁRIO (Código 9 + Código individual)
========================= */

/* =========================
   EQUIPAMENTO: grua → GT → comprimento de lança → lanças e tirantes (+ machine cards do GT)
========================= */

const EQ = {
  gruasCarregadas: false,
  lancasPorGrua: {},   // grua -> resposta de lancas_grua
  mcPorGt: {},         // GT -> mapa Código C -> [{id, codigo9, codigoC}]
  inv: null,           // resposta de inv_resumo (planilha de inventário)
  invSel: new Set(),   // NumInv marcados para conferir
  seq: 0               // descarta respostas de uma seleção anterior
};

function eqNorm(v) {
  return String(v == null ? "" : v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

// Código C só com letras/dígitos, sem sufixo (mesma regra do Apps Script)
function eqChaveC(v) {
  const d = String(v == null ? "" : v).toUpperCase().replace(/[^0-9A-Z]/g, "");
  const m = d.match(/^C\d{12}/);
  return m ? m[0] : "";
}

function eqSelect(id, opcoes, placeholder) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.replaceChildren();
  const ph = document.createElement("option");
  ph.value = ""; ph.textContent = placeholder;
  sel.appendChild(ph);
  opcoes.forEach(v => { const o = document.createElement("option"); o.value = v; o.textContent = v; sel.appendChild(o); });
  sel.disabled = !opcoes.length;
}

function eqStatus(msg) {
  const el = document.getElementById("eq-status");
  if (el) el.textContent = msg || "";
}

async function eqGetJson(url) {
  const raw = await apiGet(url);
  logDebug("Resposta Equipamento raw: " + raw.slice(0, 500));
  let j = null; try { j = JSON.parse(raw); } catch {}
  return j;
}

async function carregarGruasEq() {
  eqSelect("eq-grua", [], "Carregando…");
  eqStatus("");
  try {
    const j = await eqGetJson(`${ENDPOINT_CONSULTA}?mode=gruas_lista&t=${Date.now()}`);
    if (!(j && j.ok && Array.isArray(j.gruas))) throw new Error(j && j.error || "resposta inválida");
    eqSelect("eq-grua", j.gruas, "Selecione a grua…");
    EQ.gruasCarregadas = true;
  } catch (err) {
    logDebug("Erro gruas_lista: " + err);
    eqSelect("eq-grua", [], "Erro ao carregar");
    eqStatus("Não foi possível carregar a lista de gruas (ver Debug). Abra a tela de novo para tentar.");
  }
}

/* Caixas "Inventário N (x registros)": Equipamento, Consultar Inventário e Acessórios (cada tela com a sua seleção) */

function ordenarNumInv(lista) {
  return [...lista].sort((a, b) => (Number(a) - Number(b)) || String(a).localeCompare(String(b)));
}

// inv_resumo: { numinvs:[{numInv, registros}], chaves:{"código9|individual": {NumInv: linha}} }
async function buscarInvResumo() {
  const j = await eqGetJson(`${ENDPOINT_REGISTRO}?mode=inv_resumo&t=${Date.now()}`);
  if (!(j && j.ok && Array.isArray(j.numinvs))) throw new Error(j && j.error || "resposta inválida");
  return j;
}

// Mantém só seleções que ainda existem na planilha
function podarSelecaoInv(sel, numinvs) {
  const existentes = new Set(numinvs.map(n => n.numInv));
  sel.forEach(n => { if (!existentes.has(n)) sel.delete(n); });
}

function atualizarResumoInv(resumoId, sel) {
  const resumo = document.getElementById(resumoId);
  if (!resumo) return;
  const lista = ordenarNumInv(sel);
  resumo.textContent = lista.length ? `Inventário ${lista.join(", ")}` : "Nenhum selecionado (toque para escolher)";
}

function renderOpcoesInv(boxId, resumoId, numinvs, sel, aoMudar) {
  const box = document.getElementById(boxId);
  if (!box) return;
  box.replaceChildren();
  if (!numinvs.length) box.textContent = "Nenhum número de inventário na planilha.";
  numinvs.forEach(({ numInv, registros }) => {
    const lab = document.createElement("label");
    lab.className = "eq-inv-opcao";
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.value = numInv; cb.checked = sel.has(numInv);
    cb.addEventListener("change", () => {
      if (cb.checked) sel.add(numInv); else sel.delete(numInv);
      atualizarResumoInv(resumoId, sel);
      aoMudar();
    });
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(` Inventário ${numInv} (${registros} registros)`));
    box.appendChild(lab);
  });
  atualizarResumoInv(resumoId, sel);
}

async function carregarInventariosEq() {
  const resumo = document.getElementById("eq-inv-resumo");
  if (resumo && !EQ.inv) resumo.textContent = "Carregando…";
  try {
    const j = await buscarInvResumo();
    EQ.inv = j;
    podarSelecaoInv(EQ.invSel, j.numinvs);
    renderOpcoesInvEq();
    renderListaEq();
  } catch (err) {
    logDebug("Erro inv_resumo: " + err);
    if (resumo) resumo.textContent = "Erro ao carregar os inventários (ver Debug)";
  }
}

function renderOpcoesInvEq() {
  if (EQ.inv) renderOpcoesInv("eq-inv-opcoes", "eq-inv-resumo", EQ.inv.numinvs, EQ.invSel, renderListaEq);
}

// Linhas de inventário (NumInv marcados) para o par Código 9 + código individual
function inventariadoEq(codigo9, id) {
  if (!EQ.inv || !EQ.invSel.size) return null;
  const regs = EQ.inv.chaves[`${semZeros(codigo9)}|${semZeros(id)}`] || {};
  const achados = [...EQ.invSel].filter(n => regs[n]).map(n => ({ numInv: n, row: regs[n] }));
  return achados;
}

// Abre a Consulta ítem com Código 9 + código individual e já consulta
function abrirConsultaPecaEq(codigo9, id) {
  showScreen("consulta");
  document.getElementById("campo1").value = String(codigo9);
  document.getElementById("campo2").value = String(id);
  const cc = document.getElementById("codigo-c-input");
  if (cc) cc.value = "";
  syncCampo1ToCadastro();
  syncCampo2ToCadastro();
  window.scrollTo(0, 0);
  consultarDados();
}

/* =========================
   2.1) CADASTRO ACESSÓRIOS → VIGA
   Monta V.TIPO.SEÇÃO.DIÂMETRO.COMPRIMENTO.FURO_E.FURO_D-SEQ campo a campo e passa para o Cadastro
   (código no campo 1, sequencial sem zeros à esquerda no individual). Sequencial sugerido = maior já usado + 1.
========================= */

const VC = { seqUsados: new Map(), sugerido: "" }; // seqUsados: nº → código já registrado com ele
const VC_NUM = ["vc-diam", "vc-comp", "vc-furoe", "vc-furod", "vc-seq"];

async function carregarCadAcess() {
  const dica = document.getElementById("vc-seq-dica");
  try {
    const j = await buscarInvResumo();
    VC.seqUsados = new Map();
    Object.keys(j.chaves || {}).filter(k => /^V\./i.test(k)).forEach(k => {
      const i = k.lastIndexOf("|");
      const codigo = k.slice(0, i), id = k.slice(i + 1);
      const m = codigo.match(/-(\d+)\s*$/);
      [m && m[1], id].forEach(s => {
        const n = parseInt(s, 10);
        if (n > 0 && !VC.seqUsados.has(n)) VC.seqUsados.set(n, codigo);
      });
    });
    const maior = Math.max(0, ...VC.seqUsados.keys());
    VC.sugerido = String(Math.min(maior + 1, 99)).padStart(2, "0");
    const seq = document.getElementById("vc-seq");
    if (seq) seq.value = VC.sugerido;
    if (dica) dica.textContent = `Nº sequencial (sugerido ${VC.sugerido}; último usado ${String(maior).padStart(2, "0")})`;
  } catch (err) {
    logDebug("Erro inv_resumo (Cadastro Acessórios): " + err);
    if (dica) dica.textContent = "Nº sequencial (não foi possível sugerir; ver Debug)";
  }
  atualizarCodigoViga();
}

function codigoVigaAtual() {
  const v = id => (document.getElementById(id)?.value || "").trim();
  const seq = v("vc-seq");
  return {
    tipo: v("vc-tipo"), secao: v("vc-secao"), diam: v("vc-diam"), comp: v("vc-comp"),
    furoE: v("vc-furoe"), furoD: v("vc-furod"), seq: seq ? seq.padStart(2, "0") : "",
  };
}

// Atualiza a prévia e a mensagem; devolve o código quando pode ser usado (senão "")
function atualizarCodigoViga() {
  const c = codigoVigaAtual();
  const q = s => s === "" ? "?" : s;
  const codigo = `V.${q(c.tipo)}.${q(c.secao)}.${q(c.diam)}.${q(c.comp)}.${q(c.furoE)}.${q(c.furoD)}-${q(c.seq)}`;
  document.getElementById("vc-codigo").textContent = codigo;

  const faltam = [];
  if (!c.tipo) faltam.push("tipo");
  if (!c.secao) faltam.push("seção");
  if (!Number(c.diam)) faltam.push("diâmetro");
  if (!Number(c.comp)) faltam.push("comprimento");
  if (!c.furoE) faltam.push("furo esquerdo");
  if (!c.furoD) faltam.push("furo direito");
  if (!Number(c.seq)) faltam.push("sequencial");

  let texto = "", classe = "", ok = !faltam.length;
  if (!ok) texto = "Falta: " + faltam.join(", ") + ".";
  else {
    const usado = VC.seqUsados.get(Number(c.seq));
    if (usado && usado.toUpperCase() === codigo.toUpperCase()) {
      texto = "Essa viga já está no inventário: será um novo registro dela (ex.: outro inventário).";
      classe = "vc-aviso";
    } else if (usado) {
      texto = `O sequencial ${c.seq} já é da viga ${usado}. Use outro (sugerido ${VC.sugerido}).`;
      classe = "vc-erro"; ok = false;
    }
  }
  const msg = document.getElementById("vc-msg");
  msg.textContent = texto;
  msg.className = "secao-info " + classe;
  document.getElementById("vc-usar").disabled = !ok;
  return ok ? codigo : "";
}

function usarCodigoViga() {
  const codigo = atualizarCodigoViga();
  if (!codigo) return;
  const individual = String(Number(codigoVigaAtual().seq));
  document.getElementById("campo1_cad").value = codigo;
  document.getElementById("campo2_cad").value = individual;
  syncCadastroToMaster();
  showScreen("cadastro");
  window.scrollTo(0, 0);
  setStatusCadastro(`Viga ${codigo} (individual ${individual}) preenchida. Complete inventário, pátio, rua e andar e toque em Registrar.`);
}

/* =========================
   ACESSÓRIOS → VIGAS: peças do inventário com código "V." (V.TIPO.SEÇÃO.DIÂMETRO.COMPRIMENTO.FURO_E.FURO_D-SEQ)
   A lista vem do inv_resumo (código|individual → {NumInv: linha}); códigos fora do padrão também aparecem.
========================= */

const VG = { inv: null, sel: new Set(), vigas: [] };
const VG_TIPOS = { V: "Viga completa", I: "Intermediária", R: "Regulável", P: "Ponta simples" };
const VG_SECOES = { T: "Tubular", P: "Perfil I" };
const VG_FILTROS = ["tipo", "secao", "diametro", "comprimento"];

function partesViga(codigo) {
  const [, tipo = "", secao = "", diametro = "", comprimento = "", furoE = "", resto = ""] =
    String(codigo || "").toUpperCase().split(".");
  const [furoD = "", seq = ""] = resto.split("-");
  return { tipo, secao, diametro, comprimento, furoE, furoD, seq };
}

function descricaoViga(p) {
  const t = [];
  if (p.tipo) t.push(VG_TIPOS[p.tipo] || p.tipo);
  if (p.secao) t.push(VG_SECOES[p.secao] || p.secao);
  if (p.diametro) t.push(`Ø ${p.diametro} mm`);
  if (p.comprimento) t.push(`${p.comprimento} mm`);
  if (p.furoE || p.furoD) t.push(`furos ${p.furoE || "?"}/${p.furoD || "?"}`);
  return t.join(" · ");
}

async function carregarVigas() {
  const resumo = document.getElementById("vg-inv-resumo");
  if (resumo && !VG.inv) resumo.textContent = "Carregando…";
  const st = document.getElementById("vg-status");
  if (st && !VG.inv) st.textContent = "Carregando vigas…";
  try {
    const j = await buscarInvResumo();
    VG.inv = j;
    podarSelecaoInv(VG.sel, j.numinvs);
    renderOpcoesInv("vg-inv-opcoes", "vg-inv-resumo", j.numinvs, VG.sel, renderVigas);
    VG.vigas = Object.keys(j.chaves || {})
      .filter(k => /^V\./i.test(k))
      .map(k => {
        const i = k.lastIndexOf("|");
        const codigo = k.slice(0, i), id = k.slice(i + 1);
        const regs = j.chaves[k] || {};
        const linha = Math.max(0, ...Object.values(regs).map(Number).filter(n => n > 0)); // registro mais recente
        return { codigo, id, regs, linha, p: partesViga(codigo) };
      })
      .sort((a, b) => (b.linha - a.linha) || a.codigo.localeCompare(b.codigo, "pt", { numeric: true }));
    preencherFiltrosVigas();
    renderVigas();
  } catch (err) {
    logDebug("Erro inv_resumo (Acessórios): " + err);
    if (resumo) resumo.textContent = "Erro ao carregar os inventários (ver Debug)";
    if (st) st.textContent = "Não foi possível carregar as vigas (ver Debug). Abra a tela de novo para tentar.";
  }
}

function preencherFiltrosVigas() {
  const rotulo = {
    tipo: v => VG_TIPOS[v] ? `${v} – ${VG_TIPOS[v]}` : v,
    secao: v => VG_SECOES[v] ? `${v} – ${VG_SECOES[v]}` : v,
  };
  VG_FILTROS.forEach(f => {
    const sel = document.getElementById("vg-" + f);
    if (!sel) return;
    const atual = sel.value;
    const valores = [...new Set(VG.vigas.map(v => v.p[f]).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "pt", { numeric: true }));
    sel.replaceChildren();
    const todos = document.createElement("option");
    todos.value = ""; todos.textContent = "Todos";
    sel.appendChild(todos);
    valores.forEach(v => {
      const o = document.createElement("option");
      o.value = v; o.textContent = rotulo[f] ? rotulo[f](v) : v;
      sel.appendChild(o);
    });
    sel.value = valores.includes(atual) ? atual : "";
  });
}

function renderVigas() {
  const box = document.getElementById("vg-lista");
  const st = document.getElementById("vg-status");
  if (!box) return;
  box.replaceChildren();
  if (!VG.inv) return;
  if (!VG.vigas.length) {
    if (st) st.textContent = 'Nenhuma viga (código começando por "V.") no inventário.';
    return;
  }

  const filtro = {};
  VG_FILTROS.forEach(f => { filtro[f] = document.getElementById("vg-" + f)?.value || ""; });
  const lista = VG.vigas.filter(v => VG_FILTROS.every(f => !filtro[f] || v.p[f] === filtro[f]));
  const sel = ordenarNumInv(VG.sel);
  let registradas = 0;

  lista.forEach(v => {
    const achados = sel.filter(n => v.regs[n]);
    if (achados.length) registradas++;
    const card = document.createElement("div");
    card.className = "eq-item" + (sel.length ? (achados.length ? " eq-item-ok" : " eq-item-falta") : "");

    const t = document.createElement("div");
    t.className = "eq-item-titulo eq-item-codigo";
    t.textContent = v.codigo;
    card.appendChild(t);

    const d = document.createElement("div");
    d.textContent = descricaoViga(v.p);
    card.appendChild(d);

    const ids = document.createElement("div");
    ids.className = "eq-item-ids";
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "eq-id vg-id" + (sel.length ? (achados.length ? " eq-id-ok" : " eq-id-falta") : "");
    chip.textContent = `Individual ${v.id}`;
    chip.title = "Abrir na Consulta ítem";
    chip.addEventListener("click", () => abrirConsultaPecaEq(v.codigo, v.id));
    ids.appendChild(chip);
    const invs = Object.keys(v.regs);
    if (invs.length) {
      const s = document.createElement("span");
      s.textContent = `Inventário(s): ${ordenarNumInv(invs).join(", ")}` + (v.linha ? ` · linha ${v.linha}` : "");
      ids.appendChild(s);
    }
    card.appendChild(ids);
    box.appendChild(card);
  });

  if (st) {
    const total = lista.length === VG.vigas.length ? `${lista.length} viga(s)` : `${lista.length} de ${VG.vigas.length} viga(s)`;
    st.textContent = total + (sel.length ? ` · ${registradas} registrada(s) no(s) inventário(s) ${sel.join(", ")}` : "");
  }
}

async function onGruaEq() {
  const grua = document.getElementById("eq-grua")?.value || "";
  const seq = ++EQ.seq;
  eqSelect("eq-gt", [], grua ? "Carregando…" : "Escolha a grua");
  eqSelect("eq-lanca", [], grua ? "Carregando…" : "Escolha a grua");
  document.getElementById("eq-lista")?.replaceChildren();
  eqStatus("");
  if (!grua) return;

  try {
    const [jGt, jL] = await Promise.all([
      eqGetJson(`${ENDPOINT_CONSULTA}?mode=gts_por_grua&grua=${encodeURIComponent(grua)}&t=${Date.now()}`),
      EQ.lancasPorGrua[grua]
        ? Promise.resolve(EQ.lancasPorGrua[grua])
        : eqGetJson(`${ENDPOINT_CONSULTA}?mode=lancas_grua&grua=${encodeURIComponent(grua)}&t=${Date.now()}`)
    ]);
    if (seq !== EQ.seq) return;
    if (!(jGt && jGt.ok) || !(jL && jL.ok)) throw new Error((jGt && jGt.error) || (jL && jL.error) || "resposta inválida");
    EQ.lancasPorGrua[grua] = jL;

    const gts = jGt.gts || [];
    eqSelect("eq-gt", gts, gts.length ? "Selecione o GT…" : "Nenhum GT na Validação");
    eqSelect("eq-lanca", jL.lancas || [], (jL.lancas || []).length ? "Selecione o comprimento…" : "Sem dados de lança");

    const avisos = [];
    if (!jL.encontrado) avisos.push(`Sem dados de lança para "${grua}" (a planilha Lanças e tirantes não tem aba com esse nome).`);
    if (!gts.length) avisos.push(`Nenhum GT cadastrado para "${grua}" na aba Validação.`);
    eqStatus(avisos.join(" "));

    if (gts.length === 1) {               // só um GT: já seleciona
      document.getElementById("eq-gt").value = gts[0];
      onGtEq();
    }
  } catch (err) {
    if (seq !== EQ.seq) return;
    logDebug("Erro Equipamento (grua): " + err);
    eqSelect("eq-gt", [], "Erro ao carregar");
    eqSelect("eq-lanca", [], "Erro ao carregar");
    eqStatus("Erro ao carregar os dados da grua (ver Debug).");
  }
}

async function onGtEq() {
  const gt = document.getElementById("eq-gt")?.value || "";
  if (!gt || EQ.mcPorGt[gt]) { renderListaEq(); return; }
  const seq = EQ.seq;
  eqStatus(`Buscando machine cards do ${gt}…`);
  try {
    const j = await eqGetJson(`${ENDPOINT_CONSULTA}?mode=machinecards_por_gt&gt=${encodeURIComponent(gt)}&t=${Date.now()}`);
    if (!(j && j.ok)) throw new Error(j && j.error || "resposta inválida");
    EQ.mcPorGt[gt] = j.mapa || {};
    if (seq !== EQ.seq) return;
    eqStatus("");
  } catch (err) {
    logDebug("Erro machinecards_por_gt: " + err);
    eqStatus(`Não foi possível buscar os machine cards do ${gt} (ver Debug). A lista sai sem IDs.`);
  }
  renderListaEq();
}

// Monta a lista: peças com quantidade no comprimento escolhido, GT vazio ou = GT escolhido
function renderListaEq() {
  const ul = document.getElementById("eq-lista");
  if (!ul) return;
  ul.replaceChildren();

  const grua = document.getElementById("eq-grua")?.value || "";
  const gt = document.getElementById("eq-gt")?.value || "";
  const lanca = document.getElementById("eq-lanca")?.value || "";
  const dados = EQ.lancasPorGrua[grua];
  if (!grua || !gt || !lanca || !dados) return;

  const itens = (dados.itens || []).filter(it => it.qtd && it.qtd[lanca] > 0 && (!it.gt || eqNorm(it.gt) === eqNorm(gt)));
  const mapa = EQ.mcPorGt[gt] || null;

  const titulo = document.createElement("p");
  titulo.className = "lista-inv-titulo";
  ul.appendChild(titulo);
  const conferindo = !!(mapa && EQ.inv && EQ.invSel.size);
  let idsTotal = 0, idsOk = 0;

  let grupoAtual = null;
  itens.forEach(it => {
    if (it.grupo !== grupoAtual) {
      grupoAtual = it.grupo;
      const h = document.createElement("h3");
      h.className = "eq-grupo";
      h.textContent = grupoAtual || "Outros";
      ul.appendChild(h);
    }
    const qtd = it.qtd[lanca];
    const card = document.createElement("div");
    card.className = "eq-item";

    const t = document.createElement("div");
    t.className = "eq-item-titulo";
    t.textContent = `${it.descricao}${qtd > 1 ? `  ×${qtd}` : ""}${it.tamanho ? ` · ${it.tamanho}` : ""}`;
    card.appendChild(t);

    const c = document.createElement("div");
    c.className = "eq-item-codigo";
    c.textContent = it.codigo + (it.compat && it.compat.length ? `  (compatível: ${it.compat.join(", ")})` : "");
    card.appendChild(c);

    const ids = document.createElement("div");
    ids.className = "eq-item-ids";
    let okNoItem = 0, totalNoItem = 0;
    if (!mapa) {
      ids.textContent = "Machine card: —";
    } else {
      // IDs do próprio código; depois dos compatíveis
      const achados = [];
      [it.codigo].concat(it.compat || []).forEach((cod, i) => {
        (mapa[eqChaveC(cod)] || []).forEach(mc => achados.push({ id: mc.id, codigo9: mc.codigo9, compat: i > 0 ? cod : "", ajuste: mc.ajuste || null, inclusao: mc.inclusao || null }));
      });
      if (!achados.length) {
        const a = document.createElement("span");
        a.className = "eq-aviso";
        a.textContent = `Sem machine card no ${gt}`;
        ids.appendChild(a);
      } else {
        achados.forEach(fab => {
          // Com ajuste: o ID de fábrica fica em cinza riscado e a conferência usa a peça nova
          if (fab.ajuste) {
            const velho = document.createElement("span");
            velho.className = "eq-id eq-id-antigo";
            velho.textContent = `[ID = ${fab.id}]`;
            velho.title = `ID de fábrica substituído em ${fab.ajuste.data} por ${fab.ajuste.usuario} (aba AJUSTE, linha ${fab.ajuste.linha})`;
            ids.appendChild(velho);
          }
          const mc = fab.ajuste ? { id: fab.ajuste.id, codigo9: fab.ajuste.codigo9, compat: fab.compat, ajuste: fab.ajuste }
                                : fab;
          const inv = inventariadoEq(mc.codigo9, mc.id);   // null = sem conferência
          const chip = document.createElement(inv && inv.length ? "button" : "span");
          chip.className = "eq-id" + (inv === null ? "" : (inv.length ? " eq-id-ok" : " eq-id-falta"));
          chip.textContent = `[ID = ${mc.id}]` + (mc.compat ? ` (compatível ${mc.compat})` : "");
          if (mc.ajuste || mc.inclusao) {
            const tag = document.createElement("span");
            tag.className = "eq-tag-ajuste";
            tag.textContent = mc.ajuste ? "AJUSTE" : "INCLUSÃO";
            chip.appendChild(tag);
          }
          if (inv && inv.length) {
            chip.type = "button";
            chip.title = "Inventariado: " + inv.map(x => `inv. ${x.numInv} (linha ${x.row})`).join(", ") + ". Toque para consultar.";
            chip.addEventListener("click", () => abrirConsultaPecaEq(mc.codigo9, mc.id));
            okNoItem++;
          } else if (inv) {
            chip.title = "Sem registro nos inventários selecionados";
          }
          totalNoItem++;
          ids.appendChild(chip);
        });
        if (achados.length < qtd) {
          const a = document.createElement("span");
          a.className = "eq-aviso";
          a.textContent = `faltam ${qtd - achados.length}`;
          ids.appendChild(a);
        }
      }
      if (conferindo) {
        const completo = totalNoItem > 0 && okNoItem === totalNoItem && totalNoItem >= qtd;
        card.classList.add(completo ? "eq-item-ok" : "eq-item-falta");
      }
    }
    idsTotal += Math.max(totalNoItem, qtd); idsOk += okNoItem;
    card.appendChild(ids);

    if (!ehUsuarioConsulta()) {
      const btnCompat = document.createElement("button");
      btnCompat.type = "button";
      btnCompat.className = "eq-compat-btn";
      btnCompat.textContent = "+ Inserir compatível";
      btnCompat.addEventListener("click", () => abrirCompatEq(card, it, grua, gt));
      card.appendChild(btnCompat);
    }
    ul.appendChild(card);
  });

  titulo.textContent = `${grua} · ${gt} · ${lanca}: ${itens.length} itens` +
    (conferindo ? ` · inventariados ${idsOk} de ${idsTotal} peças` : "");
}

/* =========================
   EQUIPAMENTO: inserir compatível (painel dentro do item, em 2 passos)
   1) código 9 ou C → valida formato e busca na MachineCards (compat_previa)
   2) mostra a descrição (coluna I) do original e do novo para conferir → grava (compat_inserir)
========================= */

function formatoCodigoOk(entrada) {
  const d = String(entrada || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  return /^\d{8,9}$/.test(d) || /^C?\d{12}$/.test(d);
}

function eqEl(tag, cls, texto) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (texto != null) e.textContent = texto;
  return e;
}

function abrirCompatEq(card, it, grua, gt) {
  document.querySelectorAll(".eq-compat-painel").forEach(p => p.remove());
  const painel = eqEl("div", "eq-compat-painel");
  card.appendChild(painel);
  const titulo = `${it.descricao}${it.tamanho ? ` · ${it.tamanho}` : ""}`;

  const passo1 = (valor) => {
    painel.replaceChildren();
    painel.appendChild(eqEl("label", "campo-label", `Código 9 ou Código C compatível com ${titulo}`));
    const inp = eqEl("input"); inp.type = "text"; inp.value = valor || "";
    inp.placeholder = "ex.: 146000099 ou C051.001-631.111"; inp.autocapitalize = "characters";
    painel.appendChild(inp);
    const msg = eqEl("p", "eq-compat-msg");
    const acoes = eqEl("div", "eq-compat-acoes");
    const bIns = eqEl("button", "eq-compat-ok", "Inserir"); bIns.type = "button";
    const bCan = eqEl("button", "", "Cancelar"); bCan.type = "button";
    acoes.append(bIns, bCan);
    painel.append(msg, acoes);
    inp.focus();
    bCan.addEventListener("click", () => painel.remove());
    bIns.addEventListener("click", async () => {
      const entrada = inp.value.trim();
      if (!formatoCodigoOk(entrada)) {
        msg.textContent = "Formato inválido: código 9 = 8 ou 9 dígitos; Código C = C + 12 dígitos (ex.: C051.001-631.111).";
        return;
      }
      bIns.disabled = true; msg.textContent = "Buscando na MachineCards…";
      try {
        const j = await eqGetJson(`${ENDPOINT_CONSULTA}?mode=compat_previa&grua=${encodeURIComponent(grua)}&gt=${encodeURIComponent(gt)}` +
          `&codigo=${encodeURIComponent(it.codigo)}&entrada=${encodeURIComponent(entrada)}&t=${Date.now()}`);
        if (!(j && j.ok)) { msg.textContent = (j && j.error) || "Erro ao consultar (ver Debug)."; bIns.disabled = false; return; }
        passo2(entrada, j);
      } catch (err) {
        logDebug("Erro compat_previa: " + err);
        msg.textContent = "Erro ao consultar (ver Debug)."; bIns.disabled = false;
      }
    });
  };

  const bloco = (rotulo, linha1, info) => {
    const b = eqEl("div", "eq-compat-bloco");
    b.appendChild(eqEl("div", "eq-compat-rotulo", rotulo));
    if (linha1) b.appendChild(eqEl("div", "", linha1));
    b.appendChild(eqEl("div", "", "Descrição (machine card): " + (info && info.descricao ? info.descricao : "—")));
    b.appendChild(eqEl("div", "eq-item-codigo", info ? `Código 9: ${info.codigo9 || "—"} · Código C: ${info.codigoC || "—"}`
                                                      : "Sem machine card para esta peça"));
    return b;
  };

  const passo2 = (entrada, j) => {
    painel.replaceChildren();
    painel.appendChild(eqEl("p", "eq-compat-titulo", "Confira se a descrição de machine card é compatível"));
    painel.appendChild(bloco("Original", "Descrição português: " + titulo, j.original || { codigoC: it.codigo }));
    painel.appendChild(bloco("Novo", "Você digitou: " + entrada, j.novo));
    let conf = null;
    if (j.alerta) {
      const al = eqEl("div", "aj-alerta");
      al.appendChild(eqEl("p", "", "⚠ " + j.alerta + ". A intercambiabilidade entre modelos é baixa. Tem certeza?"));
      al.appendChild(eqEl("label", "campo-label", "Para continuar, digite CONFIRMO"));
      conf = eqEl("input"); conf.type = "text"; conf.autocapitalize = "characters";
      al.appendChild(conf);
      painel.appendChild(al);
    }
    const msg = eqEl("p", "eq-compat-msg");
    const acoes = eqEl("div", "eq-compat-acoes");
    const bIns = eqEl("button", "eq-compat-ok", "Inserir"); bIns.type = "button";
    const bCan = eqEl("button", "", "Cancelar"); bCan.type = "button";
    acoes.append(bIns, bCan);
    painel.append(msg, acoes);
    const habilita = () => { bIns.disabled = !!conf && conf.value.trim().toUpperCase() !== "CONFIRMO"; };
    if (conf) conf.addEventListener("input", habilita);
    habilita();
    bCan.addEventListener("click", () => painel.remove());
    bIns.addEventListener("click", async () => {
      bIns.disabled = true; msg.textContent = "Gravando na RELAÇÃO…";
      try {
        const r = await eqGetJson(`${ENDPOINT_CONSULTA}?mode=compat_inserir&grua=${encodeURIComponent(grua)}&gt=${encodeURIComponent(gt)}` +
          `&codigo=${encodeURIComponent(it.codigo)}&entrada=${encodeURIComponent(entrada)}` +
          `&confirmacao=${encodeURIComponent(conf ? conf.value.trim() : "")}&t=${Date.now()}`);
        if (r && r.ok && r.gravado) {
          espelhar("compat", { grua, gt, linha: r.linha, coluna: r.coluna, codigoC: r.codigoC, entrada,
                               alerta: (j && j.alerta) || "" });
          it.compat = (it.compat || []).concat(r.codigoC);   // vale na hora (mesmo objeto da lista em cache)
          renderListaEq();
          eqStatus(`✓ ${r.codigoC} incluído como compatível de ${titulo} (RELAÇÃO, linha ${r.linha}).`);
          return;
        }
        msg.textContent = (r && (r.error || r.alerta)) || "Não gravado (ver Debug).";
      } catch (err) {
        logDebug("Erro compat_inserir: " + err);
        msg.textContent = "Erro ao gravar (ver Debug).";
      }
      habilita();
    });
  };

  passo1("");
}

/* =========================
   AJUSTE DE MACHINE CARD
   Após Registrar: código 9 + ID existe na MachineCards (ou num ajuste)? Se não, oferece o ajuste:
   GT → peça (posição) → ID de fábrica substituído → grava na aba AJUSTE (script do Consolidado).
========================= */

const AJ = {
  c9: "", id: "",          // peça física registrada
  conhecido: [],           // onde o código 9 já é conhecido (MachineCards / ajustes)
  gts: null,               // [{gt, modelo}] da Validação
  gt: "", modelo: "",
  posicao: null,           // {codigo, descricao, compat}
  fab: null,               // ID substituído {id, codigo9} ou {inclusao:true} (peça adicional)
  compat: null,            // substituição: {resposta:"sim"|"nao"|null, codigoC} — peça de outro desenho?
  codigoCConhecido: "",    // Código C da peça nova, quando a MachineCards/AJUSTE já o conhece
  pecasModelo: {}          // modelo -> itens da RELAÇÃO (todas as peças)
};

function mostrarMcCadastro(estado) {
  const box = document.getElementById("cad-mc");
  if (!box) return;
  box.replaceChildren();
  box.className = "cad-mc";
  box.hidden = !estado;
  if (!estado) return;
  const p = document.createElement("div");
  p.textContent = estado.texto;
  box.appendChild(p);
  box.classList.add(estado.ok ? "cad-mc-ok" : "cad-mc-falta");
  if (estado.botao) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "Criar ajuste de machine card";
    b.addEventListener("click", estado.botao);
    box.appendChild(b);
  }
}

async function verificarPecaCadastro(c9, id) {
  if (!c9 || !id) return;
  if (/^V\./i.test(String(c9))) { // acessório (viga): não existe na MachineCards
    mostrarMcCadastro({ ok: true, texto: "Acessório (código V.): não é conferido na MachineCards." });
    return;
  }
  try {
    const j = await eqGetJson(`${ENDPOINT_CONSULTA}?mode=verificar_peca&codigo9=${encodeURIComponent(c9)}&id=${encodeURIComponent(id)}&t=${Date.now()}`);
    if (!(j && j.ok)) throw new Error(j && j.error || "resposta inválida");
    if (j.existe) {
      mostrarMcCadastro({ ok: true, texto: `✓ Machine card encontrado: ${c9} / ID ${id} (${j.gt}${j.origem === "ajuste" ? ", por ajuste" : ""}).` });
    } else {
      mostrarMcCadastro({
        ok: false,
        texto: `⚠ A peça ${c9} / ID ${id} não consta na MachineCards. Se ela substituiu uma peça de fábrica, crie um ajuste.`,
        botao: () => abrirAjuste(c9, id, j.conhecido || [])
      });
    }
  } catch (err) {
    logDebug("Erro verificar_peca: " + err);
    mostrarMcCadastro({ ok: false, texto: "Não foi possível conferir a peça na MachineCards (ver Debug)." });
  }
}

function ajStatus(msg) {
  const el = document.getElementById("aj-status");
  if (el) el.textContent = msg || "";
}

async function abrirAjuste(c9, id, conhecido) {
  Object.assign(AJ, { voltar: "", c9: String(c9), id: String(id), conhecido, gt: "", modelo: "", posicao: null, fab: null, compat: null, codigoCConhecido: "" });
  showScreen("ajuste");
  window.scrollTo(0, 0);
  document.getElementById("aj-peca").textContent = `Peça registrada: código 9 ${c9} · ID ${id}`;
  document.getElementById("aj-obs").value = "";
  document.getElementById("aj-confirmo").value = "";
  document.getElementById("aj-alerta").hidden = true;
  document.getElementById("aj-posicao").replaceChildren();
  document.getElementById("aj-ids").replaceChildren();
  renderCompatAjuste();
  ajStatus(conhecido.length
    ? "Código 9 já conhecido: " + [...new Set(conhecido.map(x => x.modelo || x.gt))].join(", ") + "."
    : "Código 9 inédito: escolha a peça na lista do modelo.");
  atualizarBotaoAjuste();

  const sel = document.getElementById("aj-gt");
  try {
    if (!AJ.gts) {
      sel.disabled = true;
      const j = await eqGetJson(`${ENDPOINT_CONSULTA}?mode=gts_todos&t=${Date.now()}`);
      if (!(j && j.ok && Array.isArray(j.gts))) throw new Error(j && j.error || "resposta inválida");
      AJ.gts = j.gts;
    }
    sel.replaceChildren();
    const ph = document.createElement("option"); ph.value = ""; ph.textContent = "Selecione o GT…"; sel.appendChild(ph);
    AJ.gts.forEach(g => { const o = document.createElement("option"); o.value = g.gt; o.textContent = `${g.gt} · ${g.modelo}`; sel.appendChild(o); });
    sel.disabled = false;
  } catch (err) {
    logDebug("Erro gts_todos: " + err);
    ajStatus("Erro ao carregar os GTs (ver Debug).");
  }
}

async function onGtAjuste() {
  const gt = document.getElementById("aj-gt").value;
  const g = (AJ.gts || []).find(x => x.gt === gt);
  Object.assign(AJ, { gt, modelo: g ? g.modelo : "", posicao: null, fab: null });
  document.getElementById("aj-posicao").replaceChildren();
  document.getElementById("aj-ids").replaceChildren();
  document.getElementById("aj-alerta").hidden = true;
  atualizarBotaoAjuste();
  if (!gt) return;

  // Peças do modelo (RELAÇÃO): descrições para as posições conhecidas e lista para escolha
  let pecas = AJ.pecasModelo[AJ.modelo];
  if (!pecas) {
    ajStatus("Carregando as peças do " + AJ.modelo + "…");
    try {
      const j = await eqGetJson(`${ENDPOINT_CONSULTA}?mode=lancas_grua&todas=1&grua=${encodeURIComponent(AJ.modelo)}&t=${Date.now()}`);
      if (!(j && j.ok)) throw new Error(j && j.error || "resposta inválida");
      pecas = AJ.pecasModelo[AJ.modelo] = j.itens || [];
      ajStatus(j.encontrado ? "" : `A RELAÇÃO não tem aba "${AJ.modelo}".`);
    } catch (err) {
      logDebug("Erro peças do modelo: " + err);
      ajStatus("Erro ao carregar as peças do modelo (ver Debug).");
      return;
    }
  }
  if (gt !== AJ.gt) return; // trocou de GT enquanto carregava

  const doModelo = AJ.conhecido.filter(x => eqNorm(x.modelo) === eqNorm(AJ.modelo));
  if (doModelo.length) {
    // Código 9 conhecido neste modelo: posição(ões) já identificadas
    const pos = [];
    doModelo.forEach(x => {
      const k = eqChaveC(x.posicao || x.codigoC);
      if (pos.some(p => eqChaveC(p.codigo) === k)) return;
      const it = pecas.find(p => eqChaveC(p.codigo) === k || (p.compat || []).some(c => eqChaveC(c) === k));
      pos.push(it ? { codigo: it.codigo, descricao: it.descricao, compat: it.compat || [], grupo: it.grupo }
                  : { codigo: x.posicao || x.codigoC, descricao: x.descricao || "(peça não encontrada na RELAÇÃO)", compat: [], grupo: "" });
    });
    renderPosicoesAjuste(pos, pos.length === 1 ? "Peça identificada pelo código 9:" : "O código 9 aparece em mais de uma peça; escolha:", false);
    if (pos.length === 1) escolherPosicaoAjuste(pos[0]);
  } else {
    if (AJ.conhecido.length) {
      // Trava contra engano: código 9 só conhecido em outro modelo
      const outros = [...new Set(AJ.conhecido.map(x => `${x.modelo || "?"} (${x.gt})`))].join(", ");
      document.getElementById("aj-alerta-texto").textContent =
        `⚠ Este código 9 pertence a outro modelo de grua: ${outros}. A intercambiabilidade estrutural entre modelos é baixa. ` +
        `Tem certeza absoluta de que a peça está no ${AJ.gt} (${AJ.modelo})?`;
      document.getElementById("aj-alerta").hidden = false;
    }
    renderPosicoesAjuste(pecas, "Qual é esta peça? (lista do " + AJ.modelo + ")", true);
  }
}

// Lista de posições (peças da RELAÇÃO) para escolher; com busca quando é a lista completa
function renderPosicoesAjuste(pecas, titulo, comBusca) {
  const box = document.getElementById("aj-posicao");
  box.replaceChildren();
  const h = document.createElement("p"); h.className = "campo-label"; h.textContent = titulo; box.appendChild(h);
  let busca = null;
  if (comBusca) {
    busca = document.createElement("input");
    busca.type = "search"; busca.placeholder = "Buscar (ex.: lança 1, tirante 8756, C051…)";
    box.appendChild(busca);
  }
  const lista = document.createElement("div"); lista.className = "aj-bloco"; box.appendChild(lista);
  const desenhar = () => {
    lista.replaceChildren();
    const termo = eqNorm(busca ? busca.value : "");
    let grupo = null;
    pecas.filter(p => !termo || eqNorm(`${p.grupo} ${p.descricao} ${p.codigo}`).includes(termo)).forEach(p => {
      if (comBusca && p.grupo !== grupo) {
        grupo = p.grupo;
        const g = document.createElement("p"); g.className = "aj-grupo"; g.textContent = grupo || "Outros"; lista.appendChild(g);
      }
      const b = document.createElement("button");
      b.type = "button";
      b.className = "aj-opcao" + (AJ.posicao && eqChaveC(AJ.posicao.codigo) === eqChaveC(p.codigo) ? " aj-opcao-sel" : "");
      b.textContent = `${p.descricao} · ${p.codigo}`;
      b.addEventListener("click", () => { escolherPosicaoAjuste(p); desenhar(); });
      lista.appendChild(b);
    });
    if (!lista.children.length) { const v = document.createElement("p"); v.className = "secao-info"; v.textContent = "Nenhuma peça encontrada."; lista.appendChild(v); }
  };
  if (busca) busca.addEventListener("input", desenhar);
  desenhar();
}

// Posição escolhida: lista os IDs de fábrica daquele GT nessa posição (código ou compatíveis)
async function escolherPosicaoAjuste(p) {
  AJ.posicao = { codigo: p.codigo, descricao: p.descricao, compat: p.compat || [] };
  AJ.fab = null;
  AJ.compat = null;
  // Desenho da peça nova, se já conhecido (de preferência no mesmo modelo)
  const conh = AJ.conhecido.filter(x => eqNorm(x.modelo) === eqNorm(AJ.modelo)).concat(AJ.conhecido);
  AJ.codigoCConhecido = (conh.find(x => eqChaveC(x.codigoC)) || {}).codigoC || "";
  renderCompatAjuste();
  atualizarBotaoAjuste();
  const box = document.getElementById("aj-ids");
  box.replaceChildren();
  const gt = AJ.gt;
  let mapa = EQ.mcPorGt[gt];
  if (!mapa) {
    try {
      const j = await eqGetJson(`${ENDPOINT_CONSULTA}?mode=machinecards_por_gt&gt=${encodeURIComponent(gt)}&t=${Date.now()}`);
      if (!(j && j.ok)) throw new Error(j && j.error || "resposta inválida");
      mapa = EQ.mcPorGt[gt] = j.mapa || {};
    } catch (err) {
      logDebug("Erro machinecards_por_gt (ajuste): " + err);
      ajStatus("Erro ao buscar os machine cards do " + gt + " (ver Debug).");
      return;
    }
  }
  if (gt !== AJ.gt || !AJ.posicao || AJ.posicao.codigo !== p.codigo) return;

  const fabs = [];
  [p.codigo].concat(p.compat || []).forEach(c => (mapa[eqChaveC(c)] || []).forEach(mc => fabs.push(mc)));
  const h = document.createElement("p"); h.className = "campo-label";
  h.textContent = fabs.length
    ? `Qual ID do ${gt} esta peça substitui? Se é uma peça a mais (opcional comprado), escolha "inclusão".`
    : `Nenhum machine card do ${gt} nesta posição. Se é uma peça a mais (opcional comprado), registre como inclusão.`;
  box.appendChild(h);
  const desenhar = () => {
    box.querySelectorAll(".aj-opcao").forEach(b => b.remove());
    fabs.forEach(mc => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "aj-opcao" + (AJ.fab && !AJ.fab.inclusao && AJ.fab.id === mc.id && AJ.fab.codigo9 === mc.codigo9 ? " aj-opcao-sel" : "");
      b.textContent = `ID ${mc.id} · código 9 ${mc.codigo9}` + (mc.inclusao ? ` (incluída em ${mc.inclusao.data})` : "") +
        (mc.ajuste ? ` (já ajustado para ID ${mc.ajuste.id} em ${mc.ajuste.data})` : "");
      b.addEventListener("click", () => { AJ.fab = { id: mc.id, codigo9: mc.codigo9 }; desenhar(); renderCompatAjuste(); });
      box.appendChild(b);
    });
    const inc = document.createElement("button");
    inc.type = "button";
    inc.className = "aj-opcao aj-opcao-inclusao" + (AJ.fab && AJ.fab.inclusao ? " aj-opcao-sel" : "");
    inc.textContent = `➕ Inclusão: peça adicional no ${gt} (não substitui nenhum ID)`;
    inc.addEventListener("click", () => { AJ.fab = { inclusao: true }; desenhar(); renderCompatAjuste(); });
    box.appendChild(inc);
  };
  desenhar();
}

// Substituição: "Esta peça é de outro desenho, compatível com a posição?" (Sim → Código C da peça nova)
function renderCompatAjuste() {
  const box = document.getElementById("aj-compat");
  if (!box) return;
  box.replaceChildren();
  box.hidden = true;
  if (!AJ.fab || AJ.fab.inclusao || !AJ.posicao) { AJ.compat = null; atualizarBotaoAjuste(); return; }

  const conhecido = AJ.codigoCConhecido;
  if (conhecido && eqChaveC(conhecido) === eqChaveC(AJ.posicao.codigo)) {
    AJ.compat = { resposta: "nao", codigoC: conhecido };     // mesmo desenho: nada a perguntar
    atualizarBotaoAjuste();
    return;
  }
  AJ.compat = AJ.compat || { resposta: null, codigoC: conhecido };
  box.hidden = false;
  box.appendChild(eqEl("p", "campo-label",
    `Esta peça é de outro desenho, compatível com ${AJ.posicao.descricao} · ${AJ.posicao.codigo}?`));
  const desenhar = () => {
    box.querySelectorAll(".aj-opcao, .aj-compat-campo").forEach(e => e.remove());
    [["sim", "Sim: é de outro desenho (gravar também como compatível)"], ["nao", "Não: é o mesmo desenho da posição"]].forEach(([v, txt]) => {
      const b = eqEl("button", "aj-opcao" + (AJ.compat.resposta === v ? " aj-opcao-sel" : ""), txt);
      b.type = "button";
      b.addEventListener("click", () => { AJ.compat.resposta = v; desenhar(); atualizarBotaoAjuste(); });
      box.appendChild(b);
    });
    if (AJ.compat.resposta === "sim") {
      const campo = eqEl("div", "aj-compat-campo");
      campo.appendChild(eqEl("label", "campo-label", "Código C da peça nova" + (conhecido ? " (conhecido pela MachineCards)" : " (da plaqueta ou do manual)")));
      const inp = eqEl("input"); inp.type = "text"; inp.id = "aj-compat-codigo";
      inp.placeholder = "ex.: C051.001-631.111"; inp.autocapitalize = "characters"; inp.value = AJ.compat.codigoC || "";
      inp.addEventListener("input", () => { AJ.compat.codigoC = inp.value.trim(); atualizarBotaoAjuste(); });
      campo.appendChild(inp);
      campo.appendChild(eqEl("p", "eq-compat-msg"));
      box.appendChild(campo);
    }
  };
  desenhar();
  atualizarBotaoAjuste();
}

// Código C válido para o compatível do ajuste: C + 12 dígitos e diferente da posição
function erroCompatAjuste() {
  if (!AJ.compat || AJ.compat.resposta !== "sim") return "";
  const d = String(AJ.compat.codigoC || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (!/^C?\d{12}$/.test(d)) return "Código C: C + 12 dígitos (ex.: C051.001-631.111).";
  if (eqChaveC("C" + d.replace(/^C/, "")) === eqChaveC(AJ.posicao.codigo)) return "É o mesmo desenho da posição: responda \"Não\".";
  return "";
}

function atualizarBotaoAjuste() {
  const btn = document.getElementById("aj-gravar");
  if (!btn) return;
  const alerta = !document.getElementById("aj-alerta").hidden;
  const confirmado = document.getElementById("aj-confirmo").value.trim().toUpperCase() === "CONFIRMO";
  const erroC = erroCompatAjuste();
  const msg = document.querySelector("#aj-compat .eq-compat-msg");
  if (msg) msg.textContent = AJ.compat && AJ.compat.codigoC ? erroC : "";
  const compatOk = !AJ.compat || (AJ.compat.resposta && !erroC);
  btn.disabled = !(AJ.gt && AJ.posicao && AJ.fab && compatOk && (!alerta || confirmado));
}

async function gravarAjuste() {
  const btn = document.getElementById("aj-gravar");
  if (btn.disabled) return;
  btn.disabled = true;
  ajStatus("Gravando ajuste…");
  const inclusao = !!AJ.fab.inclusao;
  const p = new URLSearchParams({
    mode: "gravar_ajuste", tipo: inclusao ? "inclusao" : "substituicao",
    gt: AJ.gt, posicao: AJ.posicao.codigo, descricao: AJ.posicao.descricao,
    c9_antigo: inclusao ? "" : AJ.fab.codigo9, id_antigo: inclusao ? "" : AJ.fab.id, c9_novo: AJ.c9, id_novo: AJ.id,
    compat: AJ.compat && AJ.compat.resposta === "sim" ? "1" : "0",
    codigo_c_novo: AJ.compat && AJ.compat.resposta === "sim" ? AJ.compat.codigoC : (AJ.codigoCConhecido || ""),
    obs: document.getElementById("aj-obs").value.trim(),
    confirmacao: document.getElementById("aj-confirmo").value.trim(), t: String(Date.now())
  });
  try {
    const j = await eqGetJson(`${ENDPOINT_CONSULTA}?${p.toString()}`);
    if (j && j.ok && j.gravado) {
      espelhar("ajuste", {
        linha: j.linha, gt: AJ.gt, modelo: AJ.modelo, posicao: p.get("posicao"), descricao: p.get("descricao"),
        c9_antigo: p.get("c9_antigo"), id_antigo: p.get("id_antigo"), c9_novo: AJ.c9, id_novo: AJ.id,
        alerta: j.alerta || "", obs: p.get("obs"), codigo_c_novo: j.codigoCNovo || "",
        compat: j.compat && j.compat.gravado ? { linha: j.compat.linha, codigoC: j.compat.codigoC } : null
      });
      delete EQ.mcPorGt[AJ.gt];          // Equipamento passa a mostrar o ajuste
      const oque = inclusao ? `incluída como peça adicional` : `substitui o ID ${AJ.fab.id}`;
      const comp = j.compat ? (j.compat.gravado ? ` Compatível ${j.compat.codigoC} gravado na RELAÇÃO.`
                                                : ` ${j.compat.codigoC} já era compatível desta peça.`) : "";
      ajStatus(`Ajuste gravado (aba AJUSTE, linha ${j.linha}): ${AJ.gt}, ${AJ.posicao.descricao}, ID ${AJ.id} ${oque}.${comp}`);
      mostrarMcCadastro({ ok: true, texto: `✓ Ajuste gravado: ${AJ.c9} / ID ${AJ.id} ${oque} no ${AJ.gt}.${comp}` });
      AJ.conhecido = [{ modelo: AJ.modelo, gt: AJ.gt, codigoC: j.codigoCNovo || AJ.posicao.codigo, posicao: AJ.posicao.codigo, origem: "ajuste" }];
      if (j.compat && j.compat.gravado) {   // listas em cache passam a ver o compatível novo
        Object.keys(EQ.lancasPorGrua).filter(g => eqNorm(g) === eqNorm(AJ.modelo)).forEach(g => delete EQ.lancasPorGrua[g]);
        delete AJ.pecasModelo[AJ.modelo];
      }
      return; // botão fica travado: ajuste concluído
    }
    if (j && j.precisaConfirmar) {
      document.getElementById("aj-alerta-texto").textContent = "⚠ " + j.alerta;
      document.getElementById("aj-alerta").hidden = false;
      ajStatus("Confirme digitando CONFIRMO.");
    } else {
      ajStatus("Não gravado: " + ((j && j.error) || "resposta inválida (ver Debug)"));
    }
  } catch (err) {
    logDebug("Erro gravar_ajuste: " + err);
    ajStatus("Erro ao gravar o ajuste (ver Debug).");
  }
  atualizarBotaoAjuste();
}

/* =========================
   DADOS COMPLETOS: todas as ocorrências de inventário do Código 9
========================= */

function atualizarBotaoBuscaCompleta() {
  const btn = document.getElementById("btn-busca-completa");
  if (!btn) return;
  const c9 = (document.getElementById("campo1")?.value || "").trim();
  const cc = (document.getElementById("codigo-c-input")?.value || "").trim();
  btn.disabled = !(c9 || cc);
}

function limparListaInventario(msg) {
  const ul = document.getElementById("lista-inv");
  if (ul) ul.replaceChildren();
  const tit = document.getElementById("lista-inv-titulo");
  if (tit) tit.innerText = msg || "";
}

// Compara códigos sem zeros à esquerda (a planilha pode guardar como número)
function semZeros(v) {
  const s = String(v == null ? "" : v).trim().replace(/^0+/, "");
  return s === "" ? "0" : s;
}

async function buscaCompletaUI() {
  let c9 = (document.getElementById("campo1")?.value || "").trim();
  const codigoC = (document.getElementById("codigo-c-input")?.value || "").trim();

  if (!c9 && !codigoC) { limparListaInventario("Informe o Código 9 ou o Código C."); return; }

  if (!c9) {
    limparListaInventario("Convertendo Código C...");
    const urlHporL = `${ENDPOINT_CONSULTA}?mode=h_por_l&l=${encodeURIComponent(formatarCodigoC(codigoC))}&t=${Date.now()}`;
    logDebug("GET Busca completa (L->H): " + urlHporL);
    try {
      const raw = await apiGet(urlHporL);
      logDebug("Resposta Busca completa (L->H) raw: " + raw);
      let j=null; try{ j=JSON.parse(raw); }catch{}
      c9 = (j && j.ok) ? String(j.h || "").trim() : "";
    } catch (err) {
      logDebug("Erro Busca completa (L->H): " + err);
    }
    if (!c9) { limparListaInventario("Código C não encontrado."); return; }

    document.getElementById("campo1").value = c9;
    syncCampo1ToCadastro();
  }

  await listarInventario(c9);
}

async function listarInventario(c9) {
  limparListaInventario("Buscando ocorrências de inventário...");

  const urlLista = `${ENDPOINT_REGISTRO}?mode=lista_inv&campo1=${encodeURIComponent(c9)}&t=${Date.now()}`;
  const urlPat = `${ENDPOINT_CONSULTA}?mode=patrimonio_por_h&h=${encodeURIComponent(c9)}&t=${Date.now()}`;
  logDebug("GET Lista inventário (lista_inv): " + urlLista);
  logDebug("GET Patrimônio (patrimonio_por_h): " + urlPat);

  let j = null, mapa = {};
  try {
    const [rawLista, rawPat] = await Promise.all([
      apiGet(urlLista),
      apiGet(urlPat).catch(err => { logDebug("Erro patrimonio_por_h: " + err); return ""; })
    ]);
    logDebug("Resposta lista_inv raw: " + rawLista);
    logDebug("Resposta patrimonio_por_h raw: " + rawPat);
    try { j = JSON.parse(rawLista); } catch {}
    try {
      const p = JSON.parse(rawPat);
      if (p && p.ok && p.mapa) Object.keys(p.mapa).forEach(k => { mapa[semZeros(k)] = p.mapa[k]; });
    } catch {}
  } catch (err) {
    logDebug("Erro lista_inv: " + err);
    limparListaInventario("Erro ao buscar ocorrências (ver debug).");
    return;
  }

  if (!(j && j.ok && Array.isArray(j.itens))) {
    limparListaInventario("Falha ao buscar ocorrências (ver debug).");
    return;
  }
  if (!j.itens.length) {
    limparListaInventario(`Nenhuma ocorrência de inventário para o código ${c9}.`);
    return;
  }

  const extra = j.truncado ? ` (mostrando ${j.itens.length} de ${j.total})` : "";
  limparListaInventario(`Ocorrências de inventário para código ${c9}${extra}`);

  const ul = document.getElementById("lista-inv");
  j.itens.forEach(d => {
    const gt = mapa[semZeros(d.campo2)] || "GT-?";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "item-inv";
    btn.textContent =
      `[${d.numInv || "—"}] Inventário – Código 9 ${d.campo1 || ""} – Código individual ${d.campo2 || ""} – ` +
      `${gt} – Pátio ${d.loc || ""} – Rua ${d.rua || ""} – Andar ${d.andar || ""} – Linha inventário: ${d.row}`;
    btn.addEventListener("click", () => abrirLinhaInventario(d.row));
    const li = document.createElement("li");
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

/* =========================
   CONSULTAR INVENTÁRIO: itens por inventário (vários NumInv → todas as linhas, em ordem de linha)
========================= */

const INVSEL = { numinvs: null, sel: new Set(), seq: 0 };

async function carregarInvSel() {
  const resumo = document.getElementById("invsel-resumo");
  if (resumo && !INVSEL.numinvs) resumo.textContent = "Carregando…";
  try {
    const j = await buscarInvResumo();
    INVSEL.numinvs = j.numinvs;
    podarSelecaoInv(INVSEL.sel, j.numinvs);
    renderOpcoesInv("invsel-opcoes", "invsel-resumo", j.numinvs, INVSEL.sel, listarLinhasInvSel);
    if (INVSEL.sel.size) listarLinhasInvSel();
  } catch (err) {
    logDebug("Erro inv_resumo (Consultar Inventário): " + err);
    if (resumo) resumo.textContent = "Erro ao carregar os inventários (ver Debug)";
  }
}

async function listarLinhasInvSel() {
  const ul = document.getElementById("invsel-lista");
  const st = document.getElementById("invsel-status");
  const seq = ++INVSEL.seq;
  ul?.replaceChildren();
  const sel = ordenarNumInv(INVSEL.sel);
  if (!sel.length) { if (st) st.textContent = ""; return; }
  if (st) st.textContent = `Buscando as linhas do(s) inventário(s) ${sel.join(", ")}…`;

  let j = null;
  try {
    j = await eqGetJson(`${ENDPOINT_REGISTRO}?mode=linhas_inv&numinvs=${encodeURIComponent(sel.join(","))}&t=${Date.now()}`);
  } catch (err) {
    logDebug("Erro linhas_inv: " + err);
  }
  if (seq !== INVSEL.seq) return; // a seleção mudou enquanto buscava

  if (!(j && j.ok && Array.isArray(j.itens))) {
    if (st) st.textContent = "Falha ao buscar as linhas (ver Debug)." + (j && j.error ? ` ${j.error}` : "");
    return;
  }
  if (!j.itens.length) {
    if (st) st.textContent = `Nenhuma linha no(s) inventário(s) ${sel.join(", ")}.`;
    return;
  }
  const extra = j.truncado ? ` (mostrando ${j.itens.length} de ${j.total})` : "";
  if (st) st.textContent = `${j.total} linha(s) no(s) inventário(s) ${sel.join(", ")}${extra}`;

  [...j.itens].sort((a, b) => a.row - b.row).forEach(d => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "item-inv";
    btn.textContent =
      `Linha ${d.row} – [${d.numInv || "—"}] – ${d.campo1 || ""} – Individual ${d.campo2 || ""} – ` +
      `Pátio ${d.loc || ""} – Rua ${d.rua || ""} – Andar ${d.andar || ""} – ${d.dataHora || ""}` +
      (d.usuario ? ` – ${d.usuario}` : "");
    btn.addEventListener("click", () => abrirLinhaInventario(d.row));
    const li = document.createElement("li");
    li.appendChild(btn);
    ul?.appendChild(li);
  });
}

function abrirLinhaInventario(row) {
  showScreen("inventario");
  const inp = document.getElementById("linha_consulta");
  if (inp) inp.value = String(row);
  window.scrollTo(0, 0);
  consultarLinhaInventario(Number(row));
}

// GPS gravado por obterGpsString ("lat=..., lon=..., acc_m=..., ts=...") ou "lat, lon" -> link do Google Maps
function gpsParaMapsUrl(gps) {
  const s = String(gps || "").trim();
  if (!s) return "";
  let m = s.match(/lat\s*=\s*(-?\d+(?:\.\d+)?)[\s\S]*?lon\s*=\s*(-?\d+(?:\.\d+)?)/i);
  if (!m) m = s.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return "";
  const lat = Number(m[1]), lon = Number(m[2]);
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return "";
  if (lat === 0 && lon === 0) return "";
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

function atualizarBotaoLocalUlt(gps) {
  ULT_GPS_URL = gpsParaMapsUrl(gps);
  const btn = document.getElementById("btn-ult-local");
  if (!btn) return;
  btn.disabled = !ULT_GPS_URL;
  btn.title = ULT_GPS_URL ? "Abrir no Google Maps" : "Sem GPS neste registro";
}

function abrirLocalizacaoUlt() {
  if (!ULT_GPS_URL) return;
  window.open(ULT_GPS_URL, "_blank", "noopener,noreferrer");
}

/* =========================
   CADASTRO: último NumInv (coluna H) ao lado do campo Inventário
========================= */

async function carregarUltimoNumInv() {
  const el = document.getElementById("ult-numinv");
  if (!el) return;
  el.textContent = "Último inventário: …";

  const url = `${ENDPOINT_REGISTRO}?mode=ultimo_numinv&t=${Date.now()}`;
  logDebug("GET Último NumInv (ultimo_numinv): " + url);
  try {
    const raw = await apiGet(url);
    logDebug("Resposta ultimo_numinv raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}
    if (j && j.ok) el.textContent = `Último inventário: ${String(j.numInv || "").trim() || "—"}`;
    else el.textContent = "Último inventário: ?";
  } catch (err) {
    logDebug("Erro ultimo_numinv: " + err);
    el.textContent = "Último inventário: ?";
  }
}

function limparUltimoInventario(msg) {
  ["ult-data","ult-patio","ult-rua","ult-andar"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  atualizarBotoesFotosUlt({ fotoUrl:"", fotoUrl2:"", fotoUrl3:"", fotoUrl4:"" });
  atualizarBotaoLocalUlt("");
  const st = document.getElementById("ult-status");
  if (st) st.innerText = msg || "";
}

async function consultarUltimoInventario(campo1, campo2) {
  const st = document.getElementById("ult-status");
  if (st) st.innerText = "Buscando último inventário...";

  const url =
    `${ENDPOINT_REGISTRO}?mode=ultimo_inv` +
    `&campo1=${encodeURIComponent(campo1)}` +
    `&campo2=${encodeURIComponent(campo2)}` +
    `&t=${Date.now()}`;
  logDebug("GET Último inventário (ultimo_inv): " + url);

  try {
    const raw = await apiGet(url);
    logDebug("Resposta ultimo_inv raw: " + raw);

    let j=null; try{ j=JSON.parse(raw); }catch{}
    if (!(j && j.ok)) {
      limparUltimoInventario("Falha ao buscar último inventário (ver debug).");
      return;
    }
    if (!j.data) {
      limparUltimoInventario("Nenhum registro de inventário para este ítem.");
      return;
    }

    const d = j.data;
    document.getElementById("ult-data").value  = d.dataHora || "";
    document.getElementById("ult-patio").value = d.loc || "";
    document.getElementById("ult-rua").value   = d.rua || "";
    document.getElementById("ult-andar").value = d.andar || "";
    atualizarBotoesFotosUlt(d);
    atualizarBotaoLocalUlt(d.gps);

    const quem = d.usuario ? ` Registrado por ${d.usuario}.` : "";
    if (st) st.innerText = j.row ? `Linha ${j.row} da tabela de inventário.${quem}` : quem.trim();
  } catch (err) {
    logDebug("Erro ultimo_inv: " + err);
    limparUltimoInventario("Erro ao buscar último inventário (ver debug).");
  }
}

function formatarCodigoC(apenasNumeros) {
  const raw = String(apenasNumeros || "").trim();
  const s = raw.replace(/\s+/g, "");
  if (s.length >= 12) {
    const a = s.substring(0,3);
    const b = s.substring(3,6);
    const c = s.substring(6,9);
    const d = s.substring(9,12);
    return `C${a}.${b}-${c}.${d}`;
  }
  return `C${s}`;
}

/* =========================
   GPS
========================= */

function obterGpsString() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation não suportado neste navegador."));
      return;
    }
    const options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const acc = pos.coords.accuracy;
        const ts = new Date(pos.timestamp).toISOString();
        resolve(`lat=${lat}, lon=${lon}, acc_m=${acc}, ts=${ts}`);
      },
      (err) => reject(new Error(`Falha ao obter GPS: ${err.message}`)),
      options
    );
  });
}

/* =========================
   REGISTRAR (Inventário)
========================= */

// Tempos limite das gravações (ms)
const REGISTRO_TIMEOUT_MS = 30000;
const FOTO_TIMEOUT_MS = 60000;

// Registrar fica travado do toque até o fim do registro e das fotos daquele ítem
let REGISTRO_EM_CURSO = false;

function travarRegistro(on) {
  REGISTRO_EM_CURSO = !!on;
  const btn = document.getElementById("btn-registrar");
  if (!btn) return;
  btn.disabled = REGISTRO_EM_CURSO;
  btn.textContent = REGISTRO_EM_CURSO ? "Gravando…" : "Registrar";
}

function setStatusCadastro(msg) {
  const status = document.getElementById("status-msg");
  if (status) status.innerText = msg || "";
}

async function registrarMovimentacaoUI() {
  if (REGISTRO_EM_CURSO) return;
  travarRegistro(true);
  mostrarMcCadastro(null);
  let liberar = true; // vira false quando o ciclo de fotos assume a liberação
  try {
    liberar = await registrarMovimentacao();
  } finally {
    if (liberar) travarRegistro(false);
  }
}

// Retorna true se o botão pode ser liberado já; false se o ciclo de fotos vai liberar depois
async function registrarMovimentacao() {
  const status = document.getElementById("status-msg");

  const campo1 = (document.getElementById("campo1")?.value || "").trim();
  let campo2 = (document.getElementById("campo2")?.value || "").trim();

  const loc   = (document.getElementById("loc-select")?.value || "").trim();
  const rua   = (document.getElementById("rua-input")?.value || "").trim();
  const andar = (document.getElementById("andar-input")?.value || "").trim();
  const numInv = (document.getElementById("numinv-input")?.value || "").trim();

  const obs = (document.getElementById("obs-input")?.value || "").trim();

  const gpsOn = !!document.getElementById("gps-check")?.checked;

  campo2 = campo2.replace(/^0+/, "");
  if (campo2 === "") campo2 = "0";
  if (document.getElementById("campo2")) document.getElementById("campo2").value = campo2;

  setCampo1CorPorTamanho(campo1);

  if (!campo1) {
    logDebug("Registrar: campo1 vazio. Cancelando.");
    if (status) status.innerText = "Preencha o campo1 antes de registrar.";
    return true;
  }

  gpsString = "";
  if (status) status.innerText = gpsOn ? "Obtendo GPS..." : "Registrando...";

  if (gpsOn) {
    try {
      gpsString = await obterGpsString();
      logDebug("GPS capturado: " + gpsString);
    } catch (e) {
      logDebug("Erro GPS: " + e);
      gpsString = "";
    }
  }

  const urlLog =
    `${ENDPOINT_REGISTRO}?mode=log_mov` +
    `&campo1=${encodeURIComponent(campo1)}` +
    `&campo2=${encodeURIComponent(campo2)}` +
    `&loc=${encodeURIComponent(loc)}` +
    `&rua=${encodeURIComponent(rua)}` +
    `&andar=${encodeURIComponent(andar)}` +
    `&gpsString=${encodeURIComponent(gpsString)}` +
    `&numInv=${encodeURIComponent(numInv)}` +
    `&obs=${encodeURIComponent(obs)}`;

  logDebug("GET Registrar (log_mov): " + urlLog);

  try {
    const raw = await apiGet(urlLog, REGISTRO_TIMEOUT_MS);
    logDebug("Resposta Registrar raw: " + raw);

    let j = null;
    try { j = JSON.parse(raw); } catch {}

    if (j && j.ok && j.appended) {
      if (status) status.innerText = `Registrado com sucesso (linha ${j.row} em ${j.sheet} às ${j.dataHora}).`;
      logDebug(`Registro OK: row=${j.row} dataHora=${j.dataHora}`);
      espelhar("log_mov", { row: j.row, dataHora: j.dataHora, campo1, campo2, loc, rua, andar, gps: gpsString, numInv, obs });
      carregarUltimoNumInv();

      const inpLinha = document.getElementById("linha_consulta");
      if (inpLinha) inpLinha.value = String(j.row);

      verificarPecaCadastro(campo1, campo2); // em paralelo: a peça existe na MachineCards?
      limparCamposAposRegistroOK();

      // Registrar => começa pela Foto 1; depois de cada envio a janela oferece a próxima (até 4)
      const querFoto = confirm(`Deseja adicionar fotos para a linha ${j.row}?`);
      if (querFoto) {
        abrirModalFoto(j.row, 1, "registrar");
        return false; // o botão Registrar só destrava ao Concluir/Cancelar as fotos
      }
      return true;
    } else {
      const ocupado = j && /ocupado/i.test(String(j.error || ""));
      if (status) status.innerText = ocupado
        ? "Servidor ocupado, nada foi gravado. Tente de novo."
        : "Falha ao registrar (ver debug).";
      logDebug("Registrar: resposta inválida/sem ok.");
    }
  } catch (err) {
    // Sem resposta: a linha pode ter sido gravada mesmo assim
    if (status) status.innerText = (erroTempoEsgotado(err)
      ? `Tempo esgotado (${REGISTRO_TIMEOUT_MS / 1000}s). `
      : "Erro de rede. ") + "Sem confirmação do servidor. Confira em 'Último inventário' antes de registrar de novo.";
    logDebug("Erro Registrar: " + err);
  }
  return true;
}

function limparCamposAposRegistroOK() {
  // limpa itens por item
  const ids = ["campo1","codigo-c-input","campo2","rua-input","andar-input","obs-input","codigo-lido","codigo-lido-cad"];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  setCampo1CorPorTamanho("");
  syncCampo1ToCadastro();
  syncCampo2ToCadastro();
}


/* =========================
   LINHA: consultar / deletar (clear)
========================= */

async function consultarLinhaInventarioUI() {
  const inp = document.getElementById("linha_consulta");
  const row = parseInt(String(inp?.value || "").trim(), 10);
  await consultarLinhaInventario(row);
}

async function consultarLinhaInventario(row) {
  const txt = document.getElementById("txt-lin");

  if (!row || row < 2) {
    logDebug("Consultar linha: informe um número de linha válido (>=2).");
    if (txt) txt.value = "Linha inválida (>=2).";
    atualizarBotoesFotos({ fotoUrl:"", fotoUrl2:"", fotoUrl3:"", fotoUrl4:"" });
    return;
  }

  const url = `${ENDPOINT_REGISTRO}?mode=get_lin&row=${row}&t=${Date.now()}`;
  logDebug("GET Consultar linha (get_lin): " + url);

  try {
    const raw = await apiGet(url);
    logDebug("Resposta get_lin raw: " + raw);

    let j=null; try{ j=JSON.parse(raw); }catch{}
    if (!(j && j.ok && j.data)) {
      if (txt) txt.value = "Não encontrado";
      atualizarBotoesFotos({ fotoUrl:"", fotoUrl2:"", fotoUrl3:"", fotoUrl4:"" });
      return;
    }

    const d = j.data;

    const resumo =
      `Linha ${row} | NumInv=${d.numInv || ""} | Campo1=${d.campo1 || ""} | Campo2=${d.campo2 || ""} | ` +
      `Pátio=${d.loc || ""} | Rua=${d.rua || ""} | Andar=${d.andar || ""} | OBS=${d.obs || ""} | DataHora=${d.dataHora || ""} | Usuário=${d.usuario || ""}`;

    if (txt) txt.value = resumo;

    atualizarBotoesFotos({
      fotoUrl: d.fotoUrl || "",
      fotoUrl2: d.fotoUrl2 || "",
      fotoUrl3: d.fotoUrl3 || "",
      fotoUrl4: d.fotoUrl4 || ""
    });

  } catch (err) {
    logDebug("Erro get_lin: " + err);
    if (txt) txt.value = "Erro ao consultar (ver debug).";
    atualizarBotoesFotos({ fotoUrl:"", fotoUrl2:"", fotoUrl3:"", fotoUrl4:"" });
  }
}

async function deletarLinhaInventarioUI() {
  const inp = document.getElementById("linha_consulta");
  const txt = document.getElementById("txt-lin");

  const row = parseInt(String(inp?.value || "").trim(), 10);
  if (!row || row < 2) {
    logDebug("Deletar linha: informe um número de linha válido (>=2).");
    if (txt) txt.value = "Linha inválida (>=2).";
    return;
  }

  const ok = confirm(`Deseja deletar (limpar) a linha ${row}?`);
  if (!ok) return;

  const urlClear = `${ENDPOINT_REGISTRO}?mode=clear_lin&row=${row}&t=${Date.now()}`;
  logDebug("GET clear_lin: " + urlClear);

  try {
    const raw = await apiGet(urlClear);
    logDebug("Resposta clear_lin raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}

    if (j && j.ok && j.cleared) {
      espelhar("clear_lin", { row });
      if (txt) txt.value = `Linha ${row} limpa com sucesso.`;
      atualizarBotoesFotos({ fotoUrl:"", fotoUrl2:"", fotoUrl3:"", fotoUrl4:"" });
    } else {
      if (txt) txt.value = "Falha ao limpar linha (ver debug).";
    }
  } catch (err) {
    logDebug("Erro clear_lin: " + err);
    if (txt) txt.value = "Erro ao limpar (ver debug).";
  }
}

/* =========================
   FOTO: substituir (slot 1..4)
========================= */

function perguntarSlotFoto() {
  const ans = prompt("Qual foto deseja usar/substituir? Digite 1, 2, 3 ou 4:", "1");
  if (ans == null) return 0;
  const slot = parseInt(String(ans).trim(), 10);
  if (![1,2,3,4].includes(slot)) {
    alert("Valor inválido. Digite 1, 2, 3 ou 4.");
    return 0;
  }
  return slot;
}

async function substituirFotoLinhaUI() {
  const inp = document.getElementById("linha_consulta");
  const row = parseInt(String(inp?.value || "").trim(), 10);
  if (!row || row < 2) {
    logDebug("Substituir foto: informe linha válida (>=2).");
    alert("Informe uma linha válida (>=2) em linha_consulta.");
    return;
  }

  const slot = perguntarSlotFoto();
  if (!slot) return;

  abrirModalFoto(row, slot, "substituir");
}

/* =========================
   Upload Foto (POST text/plain)
========================= */

// Foto maior que Full HD: reduz no próprio celular para FOTO_LADO_MENOR no lado menor, mesma proporção, JPEG.
// O navegador já aplica a rotação EXIF ao desenhar. Qualquer falha → envia o arquivo original (como antes).
const FOTO_LADO_MENOR = 1080;
const FOTO_QUALIDADE = 0.85;

async function reduzirFoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight;
    const escala = FOTO_LADO_MENOR / Math.min(w, h);
    if (!w || !h || escala >= 1) return file;   // já é Full HD ou menor

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * escala);
    canvas.height = Math.round(h * escala);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", FOTO_QUALIDADE));
    canvas.width = canvas.height = 0;            // libera a memória (iPhone/Android fraco)
    if (!blob || blob.size >= file.size) return file;

    logDebug(`Foto reduzida: ${w}x${h} ${file.size} B → ${Math.round(w * escala)}x${Math.round(h * escala)} ${blob.size} B`);
    return blob;
  } catch (e) {
    logDebug("Redução da foto falhou, enviando o original: " + e);
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function uploadFotoParaLinha(row, slot, file) {
  file = await reduzirFoto(file);
  const base64 = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const s = String(fr.result || "");
      const idx = s.indexOf("base64,");
      resolve(idx >= 0 ? s.substring(idx + 7) : s);
    };
    fr.onerror = () => reject(fr.error || new Error("Falha ao ler arquivo"));
    fr.readAsDataURL(file);
  });

  const payload = {
    mode: "upload_foto",
    row: Number(row),
    slot: Number(slot),
    mime: file.type || "image/jpeg",
    base64,
    user: AUTH.user,
    pass: AUTH.pass
  };

  logDebug(`POST upload_foto: row=${payload.row}, slot=${payload.slot}, mime=${payload.mime}, base64_len=${base64.length}`);

  const { resp, raw } = await netFetch(ENDPOINT_REGISTRO, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  }, FOTO_TIMEOUT_MS);

  logDebug("Resposta upload_foto raw: " + raw);
  logDebug(`upload_foto HTTP status: ${resp.status}`);

  if (respostaNegada(raw)) {
    sair("Acesso negado. Entre novamente.");
    throw new Error("upload_foto: acesso negado");
  }

  let j = null;
  try { j = JSON.parse(raw); } catch {}

  if (!(j && j.ok && j.fotoUrl)) {
    throw new Error("upload_foto: resposta inválida/sem ok");
  }
  espelhar("foto_link", { row: j.row, slot: j.slot, fotoUrl: j.fotoUrl }); // a foto fica no Drive: só o link
  return j;
}

/* =========================
   ENVIO DE GRUA (Supabase, função "romaneio")
   Lista por cliente – GT → novo envio (configuração → prévia → salvar) → veículos → romaneio (conferência por QR
   ou digitada, mover peça, fotos, dados da carreta, confirmar). Não usa o Google. Permissões pelos papéis.
========================= */

const ENV = { papeis: null, usuario: "", opcoes: null, view: "lista", envioId: null, romaneioId: null,
              previa: null, rom: null, leitorAtivo: false };
const ROMANEIO_TIMEOUT_MS = 30000;

async function romPost(modo, dados) {
  const enviar = async () => {
    if (!SB.token || Date.now() > SB.expira) await sbEntrar();
    const { raw } = await netFetch(`${SUPABASE_URL}/functions/v1/romaneio`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SB.token}`, apikey: SUPABASE_CHAVE, "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ modo }, dados || {}))
    }, ROMANEIO_TIMEOUT_MS);
    let j = null; try { j = JSON.parse(raw); } catch {}
    return j || { ok: false, error: "resposta inválida: " + String(raw).slice(0, 200) };
  };
  try {
    let j = await enviar();
    if (j.auth === false) { SB.token = ""; j = await enviar(); }   // token vencido: entra de novo
    if (!j.ok) logDebug(`romaneio ${modo}: ${j.error || "ok:false"}`);
    return j;
  } catch (e) {
    logDebug(`romaneio ${modo} FALHOU: ${(e && e.message) || e}`);
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

const envPode = (...p) => !!ENV.papeis && (ENV.papeis.includes("admin") || p.some(x => ENV.papeis.includes(x)));
const envEl = (id) => document.getElementById(id);
function envStatus(msg) { const e = envEl("env-status"); if (e) e.textContent = msg || ""; }
function envOpcao(sel, valor, texto) { const o = document.createElement("option"); o.value = valor; o.textContent = texto ?? valor; sel.appendChild(o); }
const fmtNum = (n, casas = 1) => (n == null || isNaN(n)) ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: casas });
const ROM_FECHADO = ["confirmado", "nf_solicitada"];

function envView(nome) {
  ENV.view = nome;
  ["lista", "novo", "detalhe", "romaneio"].forEach(v => { const e = envEl("env-" + v); if (e) e.hidden = v !== nome; });
  if (nome !== "romaneio") { ENV.leitorAtivo = false; pararLeitor(); }
  window.scrollTo(0, 0);
}

async function abrirEnvio() {
  envView("lista");
  envEl("env-envios").replaceChildren();
  envStatus("Conectando ao Supabase…");
  const me = await romPost("me");
  if (!me.ok) { envStatus("Sem acesso ao Supabase: " + (me.error || "acesso negado")); return; }
  ENV.papeis = me.papeis || []; ENV.usuario = me.usuario;
  if (!ENV.papeis.length) {
    envStatus(`Usuário ${me.usuario} sem papel no envio de grua: peça a um admin (Cadastros → Usuários e papéis).`);
    return;
  }
  const op = await romPost("opcoes");
  if (!op.ok) { envStatus("Erro: " + op.error); return; }
  ENV.opcoes = op;
  envEl("env-btn-novo").hidden = !envPode("expedicao");
  envStatus(`Papéis: ${ENV.papeis.join(", ")}`);
  await carregarEnvios();
}

// ---------- Lista ----------
async function carregarEnvios() {
  const box = envEl("env-envios");
  box.replaceChildren(eqEl("p", "secao-info", "Carregando envios…"));
  const j = await romPost("envios", { todos: envEl("env-todos").checked });
  box.replaceChildren();
  if (!j.ok) { box.appendChild(eqEl("p", "eq-aviso", "Erro: " + j.error)); return; }
  if (!j.envios.length) { box.appendChild(eqEl("p", "secao-info", "Nenhum envio em aberto.")); return; }
  let grupo = null;
  j.envios.forEach(e => {
    const g = `${e.cliente} – ${e.gt}`;
    if (g !== grupo) { grupo = g; box.appendChild(eqEl("h3", "eq-grupo", g)); }
    const card = eqEl("button", "env-card");
    card.type = "button";
    card.appendChild(eqEl("div", "eq-item-titulo", `${e.obra || "Envio"} #${e.id} · ${e.modelo}`));
    card.appendChild(eqEl("div", "", `${e.romaneios} veículo(s), ${e.confirmados} confirmado(s) · peças ${e.lidas}/${e.previstas}`));
    card.appendChild(eqEl("div", "env-sub", `${e.status} · criado por ${e.criado_por} em ${new Date(e.criado_em).toLocaleDateString("pt-BR")}`));
    card.addEventListener("click", () => abrirEnvioDetalhe(e.id));
    box.appendChild(card);
  });
}

// ---------- Novo envio ----------
function novoEnvio() {
  const op = ENV.opcoes;
  ENV.previa = null;
  envEl("env-previa").hidden = true;
  const dl = envEl("env-clientes"); dl.replaceChildren();
  envClientes().forEach(c => envOpcao(dl, c.rotulo));
  const gt = envEl("env-gt"); gt.replaceChildren();
  envOpcao(gt, "", op.gts.length ? "Selecione o GT…" : "Sem GTs (carga da Validação)");
  op.gts.forEach(g => envOpcao(gt, g.gt, `${g.gt} · ${g.modelo || ""}`));
  const mod = envEl("env-modelo"); mod.replaceChildren(); envOpcao(mod, "", "Selecione o modelo…");
  op.modelos.forEach(m => envOpcao(mod, m.nome));
  envModeloMudou();
  envView("novo");
}

function envModeloMudou() {
  const op = ENV.opcoes, modelo = envEl("env-modelo").value;
  const m = op.modelos.find(x => x.nome === modelo);
  const lan = envEl("env-lanca"); lan.replaceChildren();
  const lancas = (m && m.lancas) || [];
  if (!lancas.length) envOpcao(lan, "", modelo ? "Sem lanças (RELAÇÃO não carregada?)" : "Escolha o modelo");
  lancas.forEach(l => envOpcao(lan, l));
  const bas = envEl("env-base"); bas.replaceChildren(); envOpcao(bas, "", "Selecione a base…");
  // Bases sem regra de torre (aba Altura da Base de Dados) ficam marcadas: não há altura para escolher
  const comTorre = new Set(op.torres.filter(t => eqNorm(t.modelo) === eqNorm(modelo)).map(t => eqNorm(t.base)));
  const temTorreSemBase = op.torres.some(t => eqNorm(t.modelo) === eqNorm(modelo) && !t.base);
  op.bases.filter(b => eqNorm(b.modelo) === eqNorm(modelo))
    .forEach(b => envOpcao(bas, b.base, b.base + (comTorre.has(eqNorm(b.base)) || temTorreSemBase ? "" : " (sem alturas cadastradas)")));
  envBaseMudou();
}

function envBaseMudou() {
  const op = ENV.opcoes, modelo = envEl("env-modelo").value, base = envEl("env-base").value;
  const telesc = envEl("env-telesc").value === "sim";
  const doModelo = x => eqNorm(x.modelo) === eqNorm(modelo) && (!x.base || eqNorm(x.base) === eqNorm(base));
  const alt = envEl("env-altura"); alt.replaceChildren();
  const alturas = [...new Set(op.torres.filter(t => doModelo(t) && (t.telescopagem == null || t.telescopagem === telesc)).map(t => t.altura_m))]
    .sort((a, b) => a - b);
  const aviso = envEl("env-altura-aviso");
  if (alturas.length || !modelo || !base) {
    envOpcao(alt, "", "Selecione a altura…");
    if (aviso) aviso.textContent = "";
  } else {
    envOpcao(alt, "", "Sem altura cadastrada");
    // Onde há altura para este modelo (base/telescopagem), para o usuário saber o que falta na Base de Dados
    const combos = [...new Set(op.torres.filter(t => eqNorm(t.modelo) === eqNorm(modelo))
      .map(t => `${t.base || "qualquer base"} (telescopagem ${t.telescopagem ? "sim" : "não"})`))];
    if (aviso) aviso.textContent = combos.length
      ? `Sem regra de torre para ${base} / telescopagem ${telesc ? "sim" : "não"}. Há alturas para: ${combos.join("; ")}.`
      : `O modelo ${modelo} não tem nenhuma regra de torre (aba Altura da Base de Dados Grua): a torre fica fora da lista; inclua-a à mão na prévia ou cadastre as regras.`;
  }
  alturas.forEach(a => envOpcao(alt, a, fmtNum(a, 2) + " m"));
  const las = envEl("env-lastro"); las.replaceChildren(); envOpcao(las, "", "Sem lastro");
  [...new Set(op.lastros.filter(doModelo).map(l => l.lastro_t))].sort((a, b) => a - b).forEach(l => envOpcao(las, l, fmtNum(l, 2) + " t"));
}

function envCfg() {
  return {
    gt: envEl("env-gt").value, modelo: envEl("env-modelo").value, lanca_m: envEl("env-lanca").value.replace(/m$/i, ""),
    base: envEl("env-base").value, telescopagem: envEl("env-telesc").value === "sim",
    altura_m: envEl("env-altura").value || null, lastro_t: envEl("env-lastro").value || null,
  };
}

async function gerarPrevia(redistribuir) {
  const cfg = envCfg();
  if (!cfg.gt || !cfg.modelo || !cfg.lanca_m) { envStatus("Escolha GT, modelo e lança."); return; }
  const dados = { cfg };
  if (redistribuir && ENV.previa) {
    dados.itens = ENV.previa.itens.map((it, i) => ({ ...it, qtd: Number(envEl("env-qtd-" + i)?.value) || 0 }));
  }
  envStatus("Montando os romaneios…");
  const j = await romPost("previa", dados);
  if (!j.ok) { envStatus("Erro: " + j.error); return; }
  ENV.previa = j;
  envStatus("");
  renderPrevia();
}

function renderPrevia() {
  const p = ENV.previa;
  envEl("env-previa").hidden = false;
  const av = envEl("env-avisos"); av.replaceChildren();
  [...(p.avisos || []), ...(p.avisosDistribuicao || [])].forEach(a => av.appendChild(eqEl("li", "", a)));
  const it = envEl("env-itens"); it.replaceChildren();
  let grupo = null;
  p.itens.forEach((x, i) => {
    if (x.grupo !== grupo) { grupo = x.grupo; it.appendChild(eqEl("h4", "eq-grupo", grupo || "Outros")); }
    const linha = eqEl("div", "env-item-linha");
    linha.appendChild(eqEl("span", "", `${x.descricao || ""} · ${x.codigoExib}`));
    const q = document.createElement("input");
    q.type = "number"; q.min = "0"; q.step = "1"; q.value = x.qtd; q.id = "env-qtd-" + i; q.className = "env-qtd";
    linha.appendChild(q);
    it.appendChild(linha);
  });
  const vs = envEl("env-veiculos"); vs.replaceChildren();
  p.veiculos.forEach(v => {
    const card = eqEl("div", "eq-item");
    const comp = v.comp_util_m ? `${fmtNum(v.comp_usado, 2)}/${fmtNum(v.comp_util_m, 2)} m` : `${fmtNum(v.comp_usado, 2)} m`;
    const peso = v.carga_max_kg ? `${fmtNum(v.peso_kg, 0)}/${fmtNum(v.carga_max_kg, 0)} kg` : `${fmtNum(v.peso_kg, 0)} kg`;
    card.appendChild(eqEl("div", "eq-item-titulo", `${v.n}) ${v.tipo} · ${comp} · forro ${fmtNum(v.forro_usado, 2)} m · ${peso}`));
    v.itens.forEach(x => card.appendChild(eqEl("div", "", `${x.qtd} × ${x.descricao || x.codigoExib}${x.forro ? " (forro)" : ""}${x.filha ? " (junto do pai)" : ""}`)));
    vs.appendChild(card);
  });
}

// Clientes do envio: obra aparece como "Obra (Construtora)"; a empresa sozinha também pode ser escolhida
function envClientes() {
  const cl = ENV.opcoes?.clientes || [];
  const porId = Object.fromEntries(cl.map(c => [c.id, c]));
  return cl.map(c => ({ ...c, rotulo: c.tipo === "obra" && porId[c.pai_id] ? `${c.nome} (${porId[c.pai_id].nome})` : c.nome }));
}

async function salvarEnvio() {
  if (!ENV.previa) return;
  const cliente = envEl("env-cliente").value.trim();
  if (!cliente) { envStatus("Informe o cliente."); return; }
  const btn = envEl("env-btn-salvar"); btn.disabled = true;
  envStatus("Salvando o envio…");
  const cli = envClientes().find(c => eqNorm(c.rotulo) === eqNorm(cliente));
  const j = await romPost("salvar_envio", { cfg: ENV.previa.cfg, cliente, cliente_id: cli ? cli.id : null, endereco_envio: envEl("env-endereco").value,
                                            obra: envEl("env-obra").value, veiculos: ENV.previa.veiculos });
  btn.disabled = false;
  if (!j.ok) { envStatus("Não salvo: " + j.error); return; }
  envStatus(`Envio #${j.id} salvo com ${j.romaneios} romaneio(s).`);
  abrirEnvioDetalhe(j.id);
}

// ---------- Detalhe do envio ----------
async function abrirEnvioDetalhe(id) {
  ENV.envioId = id;
  envView("detalhe");
  const box = envEl("env-romaneios"); box.replaceChildren(eqEl("p", "secao-info", "Carregando…"));
  const j = await romPost("envio", { id });
  box.replaceChildren();
  if (!j.ok) { box.appendChild(eqEl("p", "eq-aviso", "Erro: " + j.error)); return; }
  const e = j.envio;
  envEl("env-det-titulo").textContent = `${e.cliente} – ${e.gt}`;
  envEl("env-det-info").textContent = `Envio #${e.id} · ${e.obra || "sem obra"} · ${e.modelo} · lança ${fmtNum(e.lanca_m)} m` +
    (e.altura_m ? ` · altura ${fmtNum(e.altura_m, 2)} m` : "") + (e.base ? ` · ${e.base}` : "") +
    (e.lastro_t ? ` · lastro ${fmtNum(e.lastro_t, 2)} t` : "") + ` · ${e.status}`;
  j.romaneios.forEach(r => {
    const card = eqEl("button", "env-card env-st-" + r.status);
    card.type = "button";
    card.appendChild(eqEl("div", "eq-item-titulo", `Romaneio ${r.numero} · ${r.veiculo || "veículo a definir"}`));
    card.appendChild(eqEl("div", "", `peças ${r.lidas}/${r.previstas} · ${fmtNum(r.comp_m, 2)} m · ${fmtNum(r.peso_kg, 0)} kg`));
    card.appendChild(eqEl("div", "env-sub", `${r.status}${r.placa_cavalo ? " · " + r.placa_cavalo : ""}${r.motorista ? " · " + r.motorista : ""}`));
    card.addEventListener("click", () => abrirRomaneio(r.id));
    box.appendChild(card);
  });
  const sel = envEl("env-novo-veiculo"); sel.replaceChildren();
  (ENV.opcoes?.frota || []).forEach(v => envOpcao(sel, v.nome));
  envEl("env-btn-novo-veiculo").disabled = !envPode("expedicao", "operacional");
}

async function novoVeiculoEnvio() {
  const j = await romPost("novo_romaneio", { envio_id: ENV.envioId, veiculo: envEl("env-novo-veiculo").value });
  if (!j.ok) { envStatus("Erro: " + j.error); return; }
  abrirEnvioDetalhe(ENV.envioId);
}

// ---------- Romaneio ----------
async function abrirRomaneio(id) {
  ENV.romaneioId = id;
  envView("romaneio");
  envEl("env-leitura").hidden = true;
  envEl("env-just").value = "";
  await recarregarRomaneio();
}

async function recarregarRomaneio() {
  const j = await romPost("romaneio", { id: ENV.romaneioId });
  if (!j.ok) { envStatus("Erro: " + j.error); return; }
  ENV.rom = j;
  const r = j.romaneio;
  const fechado = ROM_FECHADO.includes(r.status);
  const podeConferir = envPode("operacional", "expedicao");
  envEl("env-rom-titulo").textContent = `Romaneio ${r.numero} · ${r.cliente} – ${r.gt}`;
  envEl("env-rom-info").textContent = `${r.modelo} · ${r.veiculo || "veículo a definir"} · ${r.status}` +
    (r.confirmado_por ? ` por ${r.confirmado_por}` : "") + (r.justificativa ? ` · justificativa: ${r.justificativa}` : "");

  // Itens: previsto × lido
  const box = envEl("env-rom-itens"); box.replaceChildren();
  const prev = j.itens.reduce((s, i) => s + i.qtd, 0), lid = j.itens.reduce((s, i) => s + Math.min(i.lidos, i.qtd), 0);
  box.appendChild(eqEl("p", "lista-inv-titulo", `${lid}/${prev} peças conferidas`));
  j.itens.filter(i => i.qtd > 0 || i.lidos > 0).forEach(i => {
    const st = i.lidos >= i.qtd ? "ok" : (i.lidos ? "parcial" : "falta");
    const card = eqEl("div", "eq-item env-it-" + st);
    card.appendChild(eqEl("div", "eq-item-titulo", `${i.lidos}/${i.qtd} · ${i.descricao || i.codigo_exibicao}` +
      (i.forro ? " (forro)" : "") + (i.filha ? " (junto do pai)" : "") + (i.origem === "manual" ? " (fora do plano)" : "")));
    card.appendChild(eqEl("div", "eq-item-codigo", `${i.codigo_exibicao || i.codigo}` +
      (i.comp_m != null ? ` · ${fmtNum(i.comp_m, 2)} m` : "") + (i.peso_kg != null ? ` · ${fmtNum(i.peso_kg, 0)} kg` : "")));
    const livres = i.qtd - i.lidos;
    const destinos = j.outros.filter(o => !ROM_FECHADO.includes(o.status));
    if (!fechado && livres > 0 && destinos.length && podeConferir) {
      const mv = eqEl("div", "env-mover");
      const q = document.createElement("input"); q.type = "number"; q.min = "1"; q.max = String(livres); q.value = "1"; q.className = "env-qtd";
      const dest = document.createElement("select");
      destinos.forEach(o => envOpcao(dest, o.id, `→ romaneio ${o.numero}${o.veiculo ? " (" + o.veiculo + ")" : ""}`));
      const b = eqEl("button", "", "Mover"); b.type = "button";
      b.addEventListener("click", async () => {
        const k = await romPost("mover_item", { de: r.id, para: Number(dest.value), codigo: i.codigo, qtd: Number(q.value) });
        envStatus(k.ok ? "Peça movida." : "Não movida: " + k.error);
        recarregarRomaneio();
      });
      mv.append(q, dest, b);
      card.appendChild(mv);
    }
    box.appendChild(card);
  });

  // Fotos
  const fotos = envEl("env-fotos"); fotos.replaceChildren();
  j.fotos.forEach(f => {
    const a = document.createElement("a"); a.href = f.url; a.target = "_blank"; a.rel = "noopener";
    const img = document.createElement("img"); img.src = f.url; img.alt = "foto do carregamento";
    a.appendChild(img); fotos.appendChild(a);
  });
  envEl("env-foto").disabled = fechado || !podeConferir;

  // Dados da carreta
  const vs = envEl("env-veiculo"); vs.replaceChildren(); envOpcao(vs, "", "A definir");
  (ENV.opcoes?.frota || []).forEach(v => envOpcao(vs, v.nome));
  vs.value = r.veiculo || "";
  const dt = envEl("env-transps"); dt.replaceChildren(); (ENV.opcoes?.transportadoras || []).forEach(t => envOpcao(dt, t.nome));
  const dm = envEl("env-motoristas"); dm.replaceChildren(); (ENV.opcoes?.motoristas || []).forEach(m => envOpcao(dm, m.nome));
  Object.entries(ENV_CAMPOS_ROM).forEach(([id, k]) => { envEl(id).value = r[k] || ""; envEl(id).disabled = fechado; });
  vs.disabled = fechado;
  ["env-btn-dados", "env-btn-confirmar", "env-btn-ler", "env-btn-registrar"].forEach(id => envEl(id).disabled = fechado || !podeConferir);

  // Leituras e histórico
  const lb = envEl("env-leituras"); lb.replaceChildren();
  if (!j.leituras.length) lb.appendChild(eqEl("p", "secao-info", "Nenhuma peça conferida ainda."));
  j.leituras.forEach(l => {
    const linha = eqEl("div", "env-item-linha");
    linha.appendChild(eqEl("span", "", `${l.quando} · ${l.codigo9} / ID ${l.id_individual}${l.manual ? " (digitado)" : ""}` +
      `${l.fora_do_plano ? " (fora do plano)" : ""} · ${l.usuario}`));
    if (!fechado && podeConferir) {
      const b = eqEl("button", "env-mini", "desfazer"); b.type = "button";
      b.addEventListener("click", async () => {
        const k = await romPost("desfazer_leitura", { leitura_id: l.id });
        envStatus(k.ok ? "Leitura desfeita." : "Erro: " + k.error);
        recarregarRomaneio();
      });
      linha.appendChild(b);
    }
    lb.appendChild(linha);
  });
  const hb = envEl("env-historico"); hb.replaceChildren();
  j.historico.forEach(h => hb.appendChild(eqEl("div", "env-sub", `${h.quando} · ${h.usuario} · ${h.acao}`)));
}

const ENV_CAMPOS_ROM = { "env-transp": "transportadora", "env-motorista": "motorista", "env-cpf": "cpf_motorista",
  "env-placa-cavalo": "placa_cavalo", "env-placa-c1": "placa_carreta1", "env-placa-c2": "placa_carreta2",
  "env-nf": "nota_fiscal", "env-resp": "responsavel", "env-obs": "obs" };

// Leitura (QR ou digitada). opcoes: { manual, mover, confirmo }
async function lerPecaEnvio(c9, id, opcoes) {
  const o = opcoes || {};
  const msg = envEl("env-leitura-msg"), acoes = envEl("env-leitura-acoes");
  envEl("env-leitura").hidden = false;
  acoes.replaceChildren();
  msg.className = "";
  msg.textContent = `Conferindo ${c9} / ID ${id}…`;
  const j = await romPost("ler_peca", { romaneio_id: ENV.romaneioId, codigo9: c9, id_individual: id,
                                        manual: !!o.manual, mover: !!o.mover, confirmo: o.confirmo || "" });
  const botao = (texto, fn) => { const b = eqEl("button", "", texto); b.type = "button"; b.addEventListener("click", fn); acoes.appendChild(b); };
  if (j.ok) {
    msg.className = "env-msg-ok";
    msg.textContent = `OK: ${j.descricao || j.codigo}` + (j.fora ? " (fora do plano)" : "") + (j.movidoDe ? " (movida de outro romaneio)" : "");
    await recarregarRomaneio();
    if (ENV.leitorAtivo) setTimeout(() => { if (ENV.leitorAtivo && ENV.view === "romaneio") iniciarLeitor("env-qr"); }, 900);
    return;
  }
  msg.className = "env-msg-erro";
  msg.textContent = j.error || "Não conferida.";
  if (j.pedeMover) botao("Mover para este romaneio", () => lerPecaEnvio(c9, id, { ...o, mover: true }));
  if (j.pedeConfirmo) {
    const inp = document.createElement("input"); inp.placeholder = "Digite CONFIRMO"; inp.className = "env-confirmo";
    acoes.appendChild(inp);
    botao("Incluir mesmo assim", () => lerPecaEnvio(c9, id, { ...o, confirmo: inp.value }));
  }
  if (j.naoEncontrada) {
    botao("Registrar ajuste", () => { ENV.leitorAtivo = false; abrirAjuste(c9, id, []); AJ.voltar = "envio"; });
  }
  botao("Continuar lendo", () => { envEl("env-leitura").hidden = true; if (ENV.leitorAtivo) iniciarLeitor("env-qr"); });
}

async function salvarDadosRomaneio() {
  const d = { id: ENV.romaneioId };
  Object.entries(ENV_CAMPOS_ROM).forEach(([id, k]) => { d[k] = envEl(id).value; });
  if (envEl("env-veiculo").value) d.veiculo = envEl("env-veiculo").value;
  const j = await romPost("editar_romaneio", d);
  envStatus(j.ok ? "Dados do romaneio salvos." : "Não salvo: " + j.error);
  if (j.ok) recarregarRomaneio();
}

async function enviarFotoRomaneio(file) {
  if (!file) return;
  envStatus("Enviando foto…");
  try {
    const blob = await reduzirFoto(file);
    const j = await romPost("foto_upload", { romaneio_id: ENV.romaneioId });
    if (!j.ok) throw new Error(j.error);
    const { resp } = await netFetch(j.url, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob }, 60000);
    if (!resp.ok) throw new Error(`upload HTTP ${resp.status}`);
    const k = await romPost("foto_registrar", { romaneio_id: ENV.romaneioId, caminho: j.caminho });
    if (!k.ok) throw new Error(k.error);
    envStatus("Foto enviada.");
  } catch (e) {
    envStatus("Foto não enviada: " + (e.message || e));
  }
  envEl("env-foto").value = "";
  recarregarRomaneio();
}

async function confirmarRomaneio() {
  if (!confirm("Confirmar este romaneio? Depois só um admin reabre.")) return;
  const j = await romPost("confirmar", { id: ENV.romaneioId, justificativa: envEl("env-just").value });
  if (!j.ok) {
    envStatus("Não confirmado: " + j.error + (j.faltas ? " — " + j.faltas.join("; ") : ""));
    return;
  }
  envStatus("Romaneio confirmado." + (j.envioConcluido ? " Todos os romaneios do envio estão confirmados." : ""));
  recarregarRomaneio();
}

/* ---------- Cadastros ---------- */
const CAD = { tabela: "", colunas: [], linhas: [], podeEditar: false, empresas: [], todosClientes: [] };
const CAD_ROTULOS = { codigo: "Código", codigo_exibicao: "Código (como escrito)", descricao: "Descrição", peso_kg: "Peso (kg)",
  comp_m: "Comprimento (m)", larg_m: "Largura (m)", alt_m: "Altura (m)", preco_padrao: "Preço padrão", valor_unitario: "Valor unitário (NF)",
  sapiens_produto: "Sapiens produto", sapiens_derivacao: "Sapiens derivação", veiculo_exigido: "Veículo exigido",
  vai_embaixo: "Vai embaixo (forro)", obs: "Observação", pendencias: "Pendências de cadastro", nome: "Nome",
  comp_util_m: "Comprimento útil (m)", carga_max_kg: "Carga máxima (kg)", padrao: "Veículo padrão", ordem: "Ordem", ativo: "Ativo",
  endereco_envio: "Endereço de envio", cnpj: "CNPJ", cpf: "CPF", transportadora_id: "Transportadora (id)", placa: "Placa",
  tipo: "Tipo", pai_id: "Empresa (construtora)", razao_social: "Razão social", nome_fantasia: "Nome fantasia",
  cidade: "Cidade", uf: "UF", cep: "CEP", placa_cavalo: "Última placa do cavalo", placa_carreta1: "Última placa da carreta 1",
  placa_carreta2: "Última placa da carreta 2", usuario: "Usuário", papel: "Papel", id: "Id" };
const CAD_BOOL = new Set(["vai_embaixo", "padrao", "ativo"]);
const PAPEIS = ["admin", "cadastro", "expedicao", "operacional", "consulta"];

function cadStatus(m) { envEl("cad-status").textContent = m || ""; }

async function abrirCadastros() {
  cadStatus("Conectando ao Supabase…");
  const me = await romPost("me");
  if (!me.ok) { cadStatus("Sem acesso ao Supabase: " + (me.error || "acesso negado")); return; }
  ENV.papeis = me.papeis || [];
  if (!ENV.opcoes && ENV.papeis.length) { const op = await romPost("opcoes"); if (op.ok) ENV.opcoes = op; }
  cadStatus(`Usuário ${me.usuario} · papéis: ${ENV.papeis.join(", ") || "nenhum"}`);
  carregarCadastro();
}

async function carregarCadastro() {
  const tabela = envEl("cad-tabela").value;
  envEl("cad-form").hidden = true;
  const lista = envEl("cad-lista"); lista.replaceChildren(eqEl("p", "secao-info", "Carregando…"));
  const j = await romPost("cad_listar", { tabela, busca: envEl("cad-busca").value });
  lista.replaceChildren();
  if (!j.ok) { lista.appendChild(eqEl("p", "eq-aviso", "Erro: " + j.error)); envEl("cad-total").textContent = ""; return; }
  // Clientes: a lista completa (sem a busca) dá o cliente de cada obra e as obras de cada cliente
  let todos = j.linhas;
  if (tabela === "clientes" && envEl("cad-busca").value) {
    const k = await romPost("cad_listar", { tabela, busca: "" });
    if (k.ok) todos = k.linhas;
  }
  Object.assign(CAD, { colunas: j.colunas, linhas: j.linhas, podeEditar: j.podeEditar, tabela,
    todosClientes: tabela === "clientes" ? todos : [],
    empresas: tabela === "clientes" ? todos.filter(l => l.tipo !== "obra").sort((a, b) => a.nome.localeCompare(b.nome)) : [] });
  envEl("cad-btn-novo").hidden = !j.podeEditar;
  envEl("cad-total").textContent = `${j.total} registro(s)` + (j.total > j.linhas.length ? ` (mostrando ${j.linhas.length}; use a busca)` : "");
  j.linhas.forEach(l => {
    const card = eqEl("button", "env-card" + (l.pendencias ? " cad-pendente" : ""));
    card.type = "button";
    const chave = j.colunas[0];
    const titulo = tabela === "pecas" ? `${l.codigo_exibicao} · ${l.descricao || ""}`
                 : tabela === "usuario_papeis" ? `${l.usuario} · ${l.papel}`
                 : tabela === "clientes" ? (l.tipo === "obra"
                     ? `Obra ${l.nome} · de ${(CAD.todosClientes.find(c => String(c.id) === String(l.pai_id)) || {}).nome || "cliente não encontrado"}`
                     : `${l.nome}${l.cnpj ? " · " + fmtCnpj(l.cnpj) : ""}`)
                 : `${l[chave]}${l.nome && chave !== "nome" ? " · " + l.nome : ""}`;
    card.appendChild(eqEl("div", "eq-item-titulo", titulo));
    const resumo = j.colunas.slice(1).filter(k => l[k] != null && l[k] !== "" && !["descricao", "nome", "pendencias", "codigo_exibicao"].includes(k))
      .slice(0, 5).map(k => `${CAD_ROTULOS[k] || k}: ${l[k]}`).join(" · ");
    if (resumo) card.appendChild(eqEl("div", "env-sub", resumo));
    if (l.pendencias) card.appendChild(eqEl("div", "eq-aviso", l.pendencias));
    card.addEventListener("click", () => editarCadastro(l));
    lista.appendChild(card);
  });
}

// padrao: valores iniciais de um registro novo (ex.: obra já ligada ao cliente: { tipo: "obra", pai_id })
function editarCadastro(linha, padrao) {
  const f = envEl("cad-form"); f.replaceChildren(); f.hidden = false;
  const novo = !linha, tabela = CAD.tabela;
  if (novo && padrao) linha = null;
  const ini = k => (linha ? linha[k] : padrao?.[k]);
  f.appendChild(eqEl("h3", "", novo ? (padrao?.tipo === "obra" ? "Nova obra" : "Novo registro") : "Editar"));
  if (tabela === "usuario_papeis") {
    const u = document.createElement("input"); u.id = "cad-f-usuario"; u.value = linha?.usuario || ""; u.placeholder = "usuário (e-mail antes do @)";
    const p = document.createElement("select"); p.id = "cad-f-papel"; PAPEIS.forEach(x => envOpcao(p, x)); if (linha) p.value = linha.papel;
    f.append(eqEl("label", "campo-label", "Usuário"), u, eqEl("label", "campo-label", "Papel"), p);
    const add = eqEl("button", "", "Adicionar papel"); add.type = "button";
    const del = eqEl("button", "", "Remover papel"); del.type = "button";
    add.addEventListener("click", () => salvarCadastro({ usuario: u.value, papel: p.value }, false));
    del.addEventListener("click", () => salvarCadastro({ usuario: u.value, papel: p.value }, true));
    const ac = eqEl("div", "env-acoes"); ac.append(add, del); f.appendChild(ac);
    f.scrollIntoView({ behavior: "smooth" });
    return;
  }
  const campos = {};
  const chave = CAD.colunas[0];
  CAD.colunas.forEach(k => {
    if (k === "id" && novo) return;
    let inp;
    if (CAD_BOOL.has(k)) { inp = document.createElement("select"); envOpcao(inp, "false", "Não"); envOpcao(inp, "true", "Sim"); inp.value = String(!!linha?.[k]); }
    else if (k === "veiculo_exigido") { inp = document.createElement("select"); envOpcao(inp, "", "Nenhum"); (ENV.opcoes?.frota || []).forEach(v => envOpcao(inp, v.nome)); inp.value = linha?.[k] || ""; }
    else if (k === "pendencias" || k === "obs") { inp = document.createElement("textarea"); inp.rows = 3; inp.value = linha?.[k] ?? ""; }
    else if (k === "tipo" && tabela === "clientes") { inp = document.createElement("select"); envOpcao(inp, "empresa", "Cliente (escritório/empresa)"); envOpcao(inp, "obra", "Obra de um cliente"); inp.value = ini("tipo") || "empresa"; }
    else if (k === "pai_id") {
      inp = document.createElement("select"); envOpcao(inp, "", "—");
      CAD.empresas.filter(e => !linha || e.id !== linha.id).forEach(e => envOpcao(inp, e.id, `${e.nome}${e.cnpj ? " · " + fmtCnpj(e.cnpj) : ""}`));
      inp.value = ini("pai_id") ? String(ini("pai_id")) : "";
    }
    else if (k === "cnpj") { inp = document.createElement("input"); inp.inputMode = "numeric"; inp.value = linha?.cnpj ? fmtCnpj(linha.cnpj) : ""; }
    else { inp = document.createElement("input"); inp.value = ini(k) ?? ""; }
    inp.id = "cad-f-" + k;
    inp.disabled = !CAD.podeEditar || k === "id" || (k === chave && !novo);
    campos[k] = inp;
    f.append(eqEl("label", "campo-label", CAD_ROTULOS[k] || k), inp);
    if (k === "cnpj" && tabela === "clientes" && CAD.podeEditar) {
      const b = eqEl("button", "", "Buscar CNPJ"); b.type = "button"; b.id = "cad-btn-cnpj";
      b.addEventListener("click", () => buscarCnpj(campos));
      f.appendChild(b);
    }
  });
  const filhas = tabela === "clientes" && linha ? CAD.todosClientes.filter(c => c.tipo === "obra" && String(c.pai_id) === String(linha.id)) : [];
  if (tabela === "clientes") {
    // Obra: mostra o cliente (pai); o CNPJ é opcional (obra SPE tem o próprio). Cliente: CNPJ obrigatório.
    const aviso = eqEl("p", "env-aviso"); aviso.id = "cad-tipo-aviso";
    campos.tipo.after(aviso);
    const ajusta = () => {
      const obra = campos.tipo.value === "obra";
      campos.pai_id.hidden = !obra; campos.pai_id.previousSibling.hidden = !obra;
      campos.cnpj.previousSibling.textContent = obra ? "CNPJ (opcional: obra SPE com CNPJ próprio)" : "CNPJ";
      aviso.textContent = obra && filhas.length
        ? `Este cliente tem ${filhas.length} obra(s). Se virar obra, elas continuam ligadas a ele: troque o cliente delas antes.` : "";
      validarCnpjCampo(campos.cnpj, !obra);
    };
    campos.tipo.addEventListener("change", ajusta);
    campos.cnpj.addEventListener("input", () => validarCnpjCampo(campos.cnpj, campos.tipo.value !== "obra"));
    ajusta();
  }
  if (CAD.podeEditar) {
    const b = eqEl("button", "", "Salvar"); b.type = "button"; b.id = "cad-btn-salvar";
    b.addEventListener("click", () => {
      const d = {};
      Object.entries(campos).forEach(([k, el]) => { if (k !== "id") d[k] = el.value; });
      if (!novo) d[chave] = linha[chave];
      if (tabela === "clientes") {
        if (d.tipo === "empresa") d.pai_id = "";          // virou cliente: sai da construtora
        else if (!d.pai_id) { cadStatus("Escolha o cliente ao qual a obra pertence."); return; }
        const n = String(d.cnpj || "").replace(/\D/g, "");
        if (d.tipo === "empresa" && n.length !== 14) { cadStatus("CNPJ do cliente precisa ter 14 dígitos."); return; }
        if (n && n.length !== 14) { cadStatus("CNPJ da obra incompleto (deixe vazio se ela não tiver)."); return; }
      }
      salvarCadastro(d, false);
    });
    const ac = eqEl("div", "env-acoes"); ac.appendChild(b); f.appendChild(ac);
    if (!novo) {
      const x = eqEl("button", "env-perigo", "Excluir"); x.type = "button"; x.id = "cad-btn-excluir";
      x.addEventListener("click", () => excluirCadastro(linha[chave]));
      ac.appendChild(x);
    }
  }
  // Cliente salvo: as obras dele e o botão para cadastrar uma nova já ligada a ele
  if (tabela === "clientes" && linha && linha.tipo !== "obra") {
    const sec = eqEl("div", "cad-obras"); sec.id = "cad-obras";
    sec.appendChild(eqEl("h4", "", `Obras de ${linha.nome} (${filhas.length})`));
    if (!filhas.length) sec.appendChild(eqEl("p", "secao-info", "Nenhuma obra cadastrada para este cliente."));
    filhas.sort((a, b) => a.nome.localeCompare(b.nome)).forEach(o => {
      const c = eqEl("button", "env-card"); c.type = "button";
      c.appendChild(eqEl("div", "eq-item-titulo", o.nome + (o.ativo === false ? " (inativa)" : "")));
      const sub = [o.cnpj ? "CNPJ " + fmtCnpj(o.cnpj) : "", o.endereco_envio, [o.cidade, o.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ");
      if (sub) c.appendChild(eqEl("div", "env-sub", sub));
      c.addEventListener("click", () => editarCadastro(o));
      sec.appendChild(c);
    });
    if (CAD.podeEditar) {
      const nb = eqEl("button", "", "+ Cadastrar obra"); nb.type = "button"; nb.id = "cad-btn-nova-obra";
      nb.addEventListener("click", () => editarCadastro(null, { tipo: "obra", pai_id: linha.id, cidade: linha.cidade, uf: linha.uf }));
      sec.appendChild(nb);
    }
    f.appendChild(sec);
  }
  f.scrollIntoView({ behavior: "smooth" });
}

// CNPJ incompleto fica vermelho (obrigatório só para o cliente; obra pode ficar vazia)
function validarCnpjCampo(el, obrigatorio) {
  const n = el.value.replace(/\D/g, "").length;
  el.classList.toggle("campo-invalido", n ? n !== 14 : obrigatorio);
}

const fmtCnpj = c => String(c || "").replace(/\D/g, "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

// Dados públicos da Receita pela BrasilAPI (sem chave). Preenche só o que vier.
async function buscarCnpj(campos) {
  const cnpj = campos.cnpj.value.replace(/\D/g, "");
  if (cnpj.length !== 14) { cadStatus("CNPJ precisa ter 14 dígitos."); return; }
  campos.cnpj.value = fmtCnpj(cnpj);   // já mostra 00.000.000/0000-00 antes de consultar
  validarCnpjCampo(campos.cnpj, false);
  cadStatus("Consultando o CNPJ na Receita (BrasilAPI)…");
  try {
    const { resp, raw } = await netFetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, undefined, 20000);
    const j = JSON.parse(raw);
    if (!resp.ok) throw new Error(j.message || `HTTP ${resp.status}`);
    const end = [[j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(" "), j.numero, j.complemento, j.bairro]
      .filter(x => x && String(x).trim()).join(", ");
    const set = (k, v) => { if (campos[k] && v) campos[k].value = v; };
    set("cnpj", fmtCnpj(cnpj));
    set("razao_social", j.razao_social);
    set("nome_fantasia", j.nome_fantasia);
    if (campos.nome && !campos.nome.value) set("nome", j.nome_fantasia || j.razao_social);
    set("endereco_envio", end);
    set("cidade", j.municipio); set("uf", j.uf); set("cep", j.cep);
    cadStatus(`CNPJ encontrado: ${j.razao_social || ""}${j.descricao_situacao_cadastral ? " · situação " + j.descricao_situacao_cadastral : ""}. Confira e salve.`);
  } catch (e) {
    cadStatus("CNPJ não encontrado: " + (e.message || e));
  }
}

async function excluirCadastro(chave) {
  if (!confirm("Excluir este registro? Se ele já foi usado em algum envio, ele só fica desativado.")) return;
  cadStatus("Excluindo…");
  const j = await romPost("cad_excluir", { tabela: CAD.tabela, chave });
  cadStatus(j.ok ? `Registro ${j.acao}.` : "Não excluído: " + j.error);
  if (j.ok) { carregarCadastro(); ENV.opcoes = null; }
}

async function salvarCadastro(dados, excluir) {
  cadStatus("Salvando…");
  const j = await romPost("cad_salvar", { tabela: CAD.tabela, dados, excluir });
  cadStatus(j.ok ? "Salvo." : "Não salvo: " + j.error);
  if (j.ok) { carregarCadastro(); ENV.opcoes = null; }   // listas do envio recarregam na próxima vez
}

window.addEventListener("DOMContentLoaded", () => {
  envEl("env-btn-novo")?.addEventListener("click", novoEnvio);
  envEl("env-todos")?.addEventListener("change", carregarEnvios);
  document.querySelectorAll(".env-voltar").forEach(b => b.addEventListener("click", () => {
    if (b.dataset.voltar === "detalhe" && ENV.envioId) abrirEnvioDetalhe(ENV.envioId);
    else { envView("lista"); carregarEnvios(); }
  }));
  envEl("env-gt")?.addEventListener("change", () => {
    const g = (ENV.opcoes?.gts || []).find(x => x.gt === envEl("env-gt").value);
    const m = g && ENV.opcoes.modelos.find(x => eqNorm(x.nome) === eqNorm(g.modelo));
    if (m) { envEl("env-modelo").value = m.nome; envModeloMudou(); }
  });
  envEl("env-modelo")?.addEventListener("change", envModeloMudou);
  envEl("env-base")?.addEventListener("change", envBaseMudou);
  envEl("env-telesc")?.addEventListener("change", envBaseMudou);
  envEl("env-cliente")?.addEventListener("change", () => {
    const c = envClientes().find(x => eqNorm(x.rotulo) === eqNorm(envEl("env-cliente").value));
    if (c && c.endereco_envio && !envEl("env-endereco").value) envEl("env-endereco").value = c.endereco_envio;
    if (c && c.tipo === "obra" && !envEl("env-obra").value) envEl("env-obra").value = c.nome;
    if (envEl("env-obra-cliente").checked) envEl("env-obra").value = envEl("env-cliente").value;
  });
  envEl("env-obra-cliente")?.addEventListener("change", e => {
    const obra = envEl("env-obra");
    obra.disabled = e.target.checked;
    if (e.target.checked) obra.value = envEl("env-cliente").value;
  });
  envEl("env-btn-previa")?.addEventListener("click", () => gerarPrevia(false));
  envEl("env-btn-redistribuir")?.addEventListener("click", () => gerarPrevia(true));
  envEl("env-btn-salvar")?.addEventListener("click", salvarEnvio);
  envEl("env-btn-novo-veiculo")?.addEventListener("click", novoVeiculoEnvio);
  envEl("env-btn-ler")?.addEventListener("click", () => { ENV.leitorAtivo = true; envEl("env-leitura").hidden = true; iniciarLeitor("env-qr"); });
  envEl("env-btn-parar")?.addEventListener("click", () => { ENV.leitorAtivo = false; pararLeitor(); });
  envEl("env-btn-registrar")?.addEventListener("click", () => {
    const c9 = envEl("env-c9").value.trim(), id = envEl("env-id").value.trim();
    if (!c9 || !id) { envStatus("Digite código 9 e ID."); return; }
    lerPecaEnvio(c9, id, { manual: true });
    envEl("env-c9").value = ""; envEl("env-id").value = "";
  });
  envEl("env-btn-dados")?.addEventListener("click", salvarDadosRomaneio);
  envEl("env-btn-confirmar")?.addEventListener("click", confirmarRomaneio);
  envEl("env-foto")?.addEventListener("change", e => enviarFotoRomaneio(e.target.files && e.target.files[0]));
  envEl("env-motorista")?.addEventListener("change", () => {
    const m = (ENV.opcoes?.motoristas || []).find(x => eqNorm(x.nome) === eqNorm(envEl("env-motorista").value));
    if (!m) return;
    // Últimas placas usadas por este motorista (pode trocar: a ligação do dia fica no romaneio)
    [["env-cpf", "cpf"], ["env-placa-cavalo", "placa_cavalo"], ["env-placa-c1", "placa_carreta1"], ["env-placa-c2", "placa_carreta2"]]
      .forEach(([id, k]) => { if (m[k] && !envEl(id).value) envEl(id).value = m[k]; });
  });
  envEl("cad-tabela")?.addEventListener("change", carregarCadastro);
  envEl("cad-btn-buscar")?.addEventListener("click", carregarCadastro);
  envEl("cad-busca")?.addEventListener("keydown", e => { if (e.key === "Enter") carregarCadastro(); });
  envEl("cad-btn-novo")?.addEventListener("click", () => editarCadastro(null));
});
