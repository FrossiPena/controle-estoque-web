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

const APP_VERSION = "v5.9.0";

const ENDPOINT_CONSULTA =
  "https://script.google.com/a/macros/realguindastes.com/s/AKfycbxE5uwmWek7HDPlBh1cD52HPDsIREptl31j-BTt2wXWaoj2KxOYQiVXmHMAP0PiDjeT/exec";

const ENDPOINT_REGISTRO =
  "https://script.google.com/a/macros/realguindastes.com/s/AKfycbxClcs2PLsAt7RjwMxV-ThLMVevpPesjnyH1rDrse6ORbPNgbP4-xAOSuq5O1xIWZ2j/exec";

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
    inventario: { id: "screen-inventario", name: "Consultar Inventário" },
    debug: { id: "screen-debug", name: "Debug" },
  };

  // Só uma câmera por vez: trocar de tela para o leitor
  if (key !== CURRENT_SCREEN) pararLeitor();

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
}

/* =========================
   UI: Binding (campo1/campo2 duplicados no Cadastro)
========================= */

function setCampo1Classes(el, valor) {
  if (!el) return;
  el.classList.remove("campo1-ok", "campo1-bad");
  const len = (String(valor || "").trim()).length;
  if (len === 9) el.classList.add("campo1-ok");
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

function atualizarUsuarioUI() {
  const el = document.getElementById("user-info");
  if (el) el.textContent = (AUTH.user ? `Usuário: ${AUTH.user} · ` : "") + APP_VERSION;
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
async function netFetch(url, opts, tempoMs) {
  netInicio();
  let ok = false, prazo = 0, timer = null;
  const ctrl = tempoMs ? new AbortController() : null;
  if (ctrl) {
    prazo = prazoInicio(tempoMs);
    timer = setTimeout(() => ctrl.abort(), tempoMs);
  }
  try {
    const resp = await fetch(url, Object.assign({}, opts, ctrl ? { signal: ctrl.signal } : {}));
    const raw = await resp.text();
    ok = respostaOk(resp, raw);
    return { resp, raw };
  } catch (err) {
    if (ctrl && ctrl.signal.aborted) {
      NET.tempoEsgotado = true;
      const e = new Error(`Tempo esgotado (${Math.round(tempoMs / 1000)}s)`);
      e.name = "TempoEsgotado";
      throw e;
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
    if (prazo) prazoFim(prazo);
    netFim(ok);
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

// Rodapé: mostra a versão do app.js; se o index.html for de outra versão, há arquivo antigo em cache
function atualizarRodapeVersao() {
  const el = document.getElementById("app-footer");
  if (!el) return;
  const versaoHtml = document.querySelector('meta[name="app-version"]')?.content || "";
  if (versaoHtml && versaoHtml !== APP_VERSION) {
    el.textContent = `Controle de Estoque · ${APP_VERSION} · página ${versaoHtml}: recarregue para atualizar`;
    el.classList.add("app-footer-aviso");
    logDebug(`Versões diferentes: index.html=${versaoHtml}, app.js=${APP_VERSION}`);
  } else {
    el.textContent = `Controle de Estoque · ${APP_VERSION}`;
  }
}

logDebug(`Carregado app.js versão ${APP_VERSION}`);
logDebug(`ENDPOINT_CONSULTA: ${ENDPOINT_CONSULTA}`);
logDebug(`ENDPOINT_REGISTRO: ${ENDPOINT_REGISTRO}`);

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
      const texto = linhas.length ? linhas.join("\n") : "Não encontrado";
      document.getElementById("gruas-aplicaveis").value = texto;
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
      carregarUltimoNumInv();

      const inpLinha = document.getElementById("linha_consulta");
      if (inpLinha) inpLinha.value = String(j.row);

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

async function uploadFotoParaLinha(row, slot, file) {
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
  return j;
}
