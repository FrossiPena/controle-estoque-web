// v5.1 - 4 fotos por linha (I..L): abrir foto 1..4, substituir com escolha 1..4, upload grava row_slot.ext
// Mantém: QR, consulta consolidado, registro inventário, limpar campos após registrar OK, get_lin/clear_lin

const APP_VERSION = "v5.1";

// ENDPOINTS (com domínio)
const ENDPOINT_CONSULTA =
  "https://script.google.com/a/macros/realguindastes.com/s/AKfycbxE5uwmWek7HDPlBh1cD52HPDsIREptl31j-BTt2wXWaoj2KxOYQiVXmHMAP0PiDjeT/exec";

const ENDPOINT_REGISTRO =
  "https://script.google.com/a/macros/realguindastes.com/s/AKfycbxClcs2PLsAt7RjwMxV-ThLMVevpPesjnyH1rDrse6ORbPNgbP4-xAOSuq5O1xIWZ2j/exec";

let html5QrCode;
let scannerRunning = false;
let leituraProcessada = false;
let lastHandledAt = 0;

let gpsString = "";

function logDebug(msg) {
  const el = document.getElementById("debug-log");
  const ts = new Date().toLocaleTimeString();
  if (el) { el.value += `[${ts}] ${msg}\n`; el.scrollTop = el.scrollHeight; }
}

logDebug(`Carregado app.js versão ${APP_VERSION}`);
logDebug(`ENDPOINT_CONSULTA: ${ENDPOINT_CONSULTA}`);
logDebug(`ENDPOINT_REGISTRO: ${ENDPOINT_REGISTRO}`);

window.addEventListener("DOMContentLoaded", () => {
  const rua = document.getElementById("rua-input");
  const andar = document.getElementById("andar-input");
  const campo1 = document.getElementById("campo1");
  const codigoC = document.getElementById("codigo-c-input");
  const numInv = document.getElementById("numinv-input");

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

  if (campo1) campo1.addEventListener("input", () => setCampo1CorPorTamanho(campo1.value.trim()));

  // Substituir foto (pede slot 1..4)
  const btnSub = document.getElementById("btn-substfoto");
  if (btnSub) btnSub.addEventListener("click", () => substituirFotoLinhaUI());

  atualizarLinksFotos({ fotoUrl: "", fotoUrl2: "", fotoUrl3: "", fotoUrl4: "" });
});

function setCampo1CorPorTamanho(valor) {
  const el = document.getElementById("campo1");
  if (!el) return;
  el.classList.remove("campo1-ok", "campo1-bad");
  const len = (valor || "").length;
  if (len === 9) el.classList.add("campo1-ok");
  else el.classList.add("campo1-bad");
}

function limparDebug() { const el = document.getElementById("debug-log"); if (el) el.value = ""; }
function copiarDebug() { const el = document.getElementById("debug-log"); if (!el) return; el.select(); document.execCommand("copy"); }

/* =========================
   Helpers - Links de fotos
========================= */

function setLink(id, url) {
  const a = document.getElementById(id);
  if (!a) return;
  const u = String(url || "").trim();
  if (u) {
    a.href = u;
    a.style.display = "block";
  } else {
    a.href = "#";
    a.style.display = "none";
  }
}

function atualizarLinksFotos(data) {
  setLink("foto-link1", data.fotoUrl || "");
  setLink("foto-link2", data.fotoUrl2 || "");
  setLink("foto-link3", data.fotoUrl3 || "");
  setLink("foto-link4", data.fotoUrl4 || "");
}

/* =========================
   QR / Scanner
========================= */

function iniciarLeitor() {
  if (scannerRunning) return;
  logDebug("Iniciando leitor...");
  html5QrCode = new Html5Qrcode("qr-reader");

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
  document.getElementById("campo1").value = parte0;
  document.getElementById("campo2").value = parte1Limpo;

  setCampo1CorPorTamanho(parte0);
  logDebug(`Parte[1] original: ${parte1Original} | limpa: ${parte1Limpo}`);

  consultarDados();
}

/* =========================
   CONSULTA (Consolidado)
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

  // Campo1 vazio => h_por_l via Codigo C
  if (!parte0) {
    if (!codigoC) {
      if (elI) elI.value = "Não encontrado";
      if (elGruas) elGruas.value = "Não encontrado";
      if (elExata) elExata.value = "Não encontrado";
      if (elDescPT) elDescPT.value = "Não encontrado";
      logDebug("ConsultarUI: campo1 e Codigo C vazios. Nada a fazer.");
      return;
    }

    const chaveL = formatarCodigoC(codigoC);
    logDebug(`ConsultarUI: campo1 vazio -> buscando H por L usando chave "${chaveL}".`);

    const urlHporL = `${ENDPOINT_CONSULTA}?mode=h_por_l&l=${encodeURIComponent(chaveL)}&t=${Date.now()}`;
    logDebug("GET Buscar H por L (L->H): " + urlHporL);

    fetch(urlHporL).then(r=>r.text()).then(raw=>{
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
      }
    });

    return;
  }

  // Fluxo normal
  parte1 = parte1.replace(/^0+/, "");
  if (parte1 === "") parte1 = "0";
  if (document.getElementById("campo2")) document.getElementById("campo2").value = parte1;

  setCampo1CorPorTamanho(parte0);

  const urlI = `${ENDPOINT_CONSULTA}?mode=i_por_h&codigo=${encodeURIComponent(parte0)}`;
  logDebug("GET Resultado da consulta (H->I): " + urlI);
  fetch(urlI).then(r=>r.text()).then(raw=>{
    logDebug("Resposta (H->I) raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}
    if (j && j.ok) { const v=(j.resultado||"").trim(); if (elI) elI.value = v || "Não encontrado"; }
    else { if (elI) elI.value = "Não encontrado"; }
  });

  const urlGruas = `${ENDPOINT_CONSULTA}?mode=gruas&h=${encodeURIComponent(parte0)}`;
  logDebug("GET Gruas aplicáveis (H->C[] & M[]): " + urlGruas);
  fetch(urlGruas).then(r=>r.text()).then(raw=>{
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
  fetch(urlExata).then(r=>r.text()).then(raw=>{
    logDebug("Resposta Exata raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}
    document.getElementById("correspondencia-exata").value =
      (j && j.ok && (j.exata||"").trim()) ? (j.exata||"").trim() : "Não encontrado";
  });

  const urlDescPT = `${ENDPOINT_CONSULTA}?mode=desc_pt&h=${encodeURIComponent(parte0)}`;
  logDebug("GET Descrição Português (H->...): " + urlDescPT);
  fetch(urlDescPT).then(r=>r.text()).then(raw=>{
    logDebug("Resposta Descrição PT raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}
    document.getElementById("descricao-pt").value =
      (j && j.ok && (j.descricao||"").trim()) ? (j.descricao||"").trim() : "Não encontrado";
  });
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

async function registrarMovimentacaoUI() {
  const status = document.getElementById("status-msg");

  const campo1 = (document.getElementById("campo1")?.value || "").trim();
  let campo2 = (document.getElementById("campo2")?.value || "").trim();

  const loc   = (document.getElementById("loc-select")?.value || "").trim();
  const rua   = (document.getElementById("rua-input")?.value || "").trim();
  const andar = (document.getElementById("andar-input")?.value || "").trim();
  const numInv = (document.getElementById("numinv-input")?.value || "").trim();

  const gpsOn = !!document.getElementById("gps-check")?.checked;

  campo2 = campo2.replace(/^0+/, "");
  if (campo2 === "") campo2 = "0";
  if (document.getElementById("campo2")) document.getElementById("campo2").value = campo2;

  setCampo1CorPorTamanho(campo1);

  if (!campo1) {
    logDebug("Registrar: campo1 vazio. Cancelando.");
    if (status) status.innerText = "Preencha o campo1 antes de registrar.";
    return;
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
    `&numInv=${encodeURIComponent(numInv)}`;

  logDebug("GET Registrar (log_mov): " + urlLog);

  try {
    const raw = await (await fetch(urlLog)).text();
    logDebug("Resposta Registrar raw: " + raw);

    let j = null;
    try { j = JSON.parse(raw); } catch {}

    if (j && j.ok && j.appended) {
      if (status) status.innerText = `Registrado com sucesso (linha ${j.row} em ${j.sheet} às ${j.dataHora}).`;
      logDebug(`Registro OK: row=${j.row} dataHora=${j.dataHora}`);

      // Mantém a linha no campo linha_consulta (ajuda para abrir foto/consultar depois)
      const inpLinha = document.getElementById("linha_consulta");
      if (inpLinha) inpLinha.value = String(j.row);

      const querFoto = confirm(`Deseja adicionar uma foto para a linha ${j.row}?`);
      if (querFoto) {
        const slot = perguntarSlotFoto();
        if (slot) {
          await selecionarEEnviarFotoParaLinha(j.row, slot, "registrar");
          await consultarLinhaInventario(j.row); // atualiza txt-lin + links
        }
      }

      limparCamposAposRegistroOK();
    } else {
      if (status) status.innerText = "Falha ao registrar (ver debug).";
      logDebug("Registrar: resposta inválida/sem ok.");
    }
  } catch (err) {
    if (status) status.innerText = "Erro de rede ao registrar (ver debug).";
    logDebug("Erro Registrar: " + err);
  }
}

function limparCamposAposRegistroOK() {
  const ids = ["campo1","codigo-c-input","campo2","rua-input","andar-input"];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  setCampo1CorPorTamanho("");
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
    atualizarLinksFotos({ fotoUrl:"", fotoUrl2:"", fotoUrl3:"", fotoUrl4:"" });
    return;
  }

  const url = `${ENDPOINT_REGISTRO}?mode=get_lin&row=${row}&t=${Date.now()}`;
  logDebug("GET Consultar linha (get_lin): " + url);

  try {
    const raw = await (await fetch(url)).text();
    logDebug("Resposta get_lin raw: " + raw);

    let j=null; try{ j=JSON.parse(raw); }catch{}
    if (!(j && j.ok && j.data)) {
      if (txt) txt.value = "Não encontrado";
      atualizarLinksFotos({ fotoUrl:"", fotoUrl2:"", fotoUrl3:"", fotoUrl4:"" });
      return;
    }

    const d = j.data;

    const resumo =
      `Linha ${row} | NumInv=${d.numInv || ""} | Campo1=${d.campo1 || ""} | Campo2=${d.campo2 || ""} | ` +
      `Pátio=${d.loc || ""} | Rua=${d.rua || ""} | Andar=${d.andar || ""} | DataHora=${d.dataHora || ""}`;

    if (txt) txt.value = resumo;

    atualizarLinksFotos({
      fotoUrl: d.fotoUrl || "",
      fotoUrl2: d.fotoUrl2 || "",
      fotoUrl3: d.fotoUrl3 || "",
      fotoUrl4: d.fotoUrl4 || ""
    });

  } catch (err) {
    logDebug("Erro get_lin: " + err);
    if (txt) txt.value = "Erro ao consultar (ver debug).";
    atualizarLinksFotos({ fotoUrl:"", fotoUrl2:"", fotoUrl3:"", fotoUrl4:"" });
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

  // Consulta antes para exibir resumo
  const urlGet = `${ENDPOINT_REGISTRO}?mode=get_lin&row=${row}&t=${Date.now()}`;
  logDebug("GET (pré-delete) get_lin: " + urlGet);

  let resumo = `linha ${row}`;
  try {
    const rawGet = await (await fetch(urlGet)).text();
    logDebug("Resposta (pré-delete) raw: " + rawGet);
    const j = JSON.parse(rawGet);
    if (j && j.ok && j.data) {
      const d = j.data;
      resumo = `linha ${row} | campo1=${d.campo1 || ""} | campo2=${d.campo2 || ""} | numInv=${d.numInv || ""}`;
    }
  } catch {}

  const ok = confirm(`Deseja deletar (limpar) a ${resumo}?`);
  if (!ok) return;

  const urlClear = `${ENDPOINT_REGISTRO}?mode=clear_lin&row=${row}&t=${Date.now()}`;
  logDebug("GET clear_lin: " + urlClear);

  try {
    const raw = await (await fetch(urlClear)).text();
    logDebug("Resposta clear_lin raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}

    if (j && j.ok && j.cleared) {
      if (txt) txt.value = `Linha ${row} limpa com sucesso.`;
      atualizarLinksFotos({ fotoUrl:"", fotoUrl2:"", fotoUrl3:"", fotoUrl4:"" });
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

  await selecionarEEnviarFotoParaLinha(row, slot, "substituir");
  await consultarLinhaInventario(row);
}

async function selecionarEEnviarFotoParaLinha(row, slot, origem) {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.capture = "environment"; // ajuda no mobile

  return new Promise((resolve) => {
    fileInput.onchange = async () => {
      try {
        const file = fileInput.files && fileInput.files[0];
        if (!file) { resolve(); return; }

        logDebug(`Foto selecionada (${origem}). row=${row}, slot=${slot}, name=${file.name}, type=${file.type}, size=${file.size}`);

        const j = await uploadFotoParaLinha(row, slot, file);

        logDebug(`Foto OK: row=${j.row} slot=${j.slot} url=${j.fotoUrl}`);

      } catch (e) {
        logDebug("Erro ao processar/enviar foto: " + e);
      }
      resolve();
    };

    fileInput.click();
  });
}

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
    base64
  };

  logDebug(`POST upload_foto: row=${payload.row}, slot=${payload.slot}, mime=${payload.mime}, base64_len=${base64.length}`);

  const resp = await fetch(ENDPOINT_REGISTRO, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });

  const raw = await resp.text();
  logDebug("Resposta upload_foto raw: " + raw);
  logDebug(`upload_foto HTTP status: ${resp.status}`);

  let j = null;
  try { j = JSON.parse(raw); } catch {}

  if (!(j && j.ok && j.fotoUrl)) {
    throw new Error("upload_foto: resposta inválida/sem ok");
  }
  return j;
}
