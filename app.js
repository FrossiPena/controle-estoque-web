// v3.9 - Foto por linha (Registrar pergunta; salva #linha.jpg no Drive via Apps Script Inventário; grava URL na col I; preview na consulta de linha; substituir foto)

const APP_VERSION = "v3.9";

const ENDPOINT_CONSULTA =
  "https://script.google.com/macros/s/AKfycbxE5uwmWek7HDPlBh1cD52HPDsIREptl31j-BTt2wXWaoj2KxOYQiVXmHMAP0PiDjeT/exec";

const ENDPOINT_REGISTRO =
  "https://script.google.com/macros/s/AKfycbwFTBzg19Oehw0rQxFi1oVm31st0MouechBMMhNAHnJrj4nrWJKnikI9vAino2E8a_Q/exec";

let html5QrCode;
let scannerRunning = false;
let leituraProcessada = false;
let lastHandledAt = 0;

let gpsString = "";

// controle do fluxo de foto
let pendingPhotoRow = null;     // linha a salvar/substituir foto
let pendingPhotoReason = "";    // "registrar" | "substituir"

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
  const numInv = document.getElementById("numinv-input");
  const codigoC = document.getElementById("codigo-c-input");
  const linhaConsulta = document.getElementById("linha_consulta");

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
  onlyDigits(linhaConsulta, "Linha");

  if (campo1) {
    campo1.addEventListener("input", () => setCampo1CorPorTamanho(campo1.value.trim()));
  }

  // listener do input de foto (camera)
  const fotoInput = document.getElementById("foto-input");
  if (fotoInput) {
    fotoInput.addEventListener("change", async () => {
      if (!fotoInput.files || !fotoInput.files.length) return;

      const file = fotoInput.files[0];
      const row = pendingPhotoRow;

      // reseta seleção para permitir selecionar o mesmo arquivo novamente
      fotoInput.value = "";

      if (!row) {
        logDebug("Foto selecionada, mas pendingPhotoRow está null. Ignorando.");
        return;
      }

      try {
        logDebug(`Foto selecionada (${pendingPhotoReason}). row=${row}, name=${file.name}, type=${file.type}, size=${file.size}`);
        const base64 = await fileToBase64(file);
        const mime = file.type || "image/jpeg";
        await enviarFotoParaInventario(row, base64, mime);
      } catch (err) {
        logDebug("Erro ao processar/enviar foto: " + err);
        setStatus("Erro ao enviar foto (ver debug).");
      } finally {
        pendingPhotoRow = null;
        pendingPhotoReason = "";
      }
    });
  }
});

function setStatus(msg) {
  const status = document.getElementById("status-msg");
  if (status) status.innerText = msg || "";
}

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

// ---------- QR ----------
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

// ---------- CONSULTA (já existente no seu fluxo) ----------
function consultarDados() {
  const parte0 = (document.getElementById("campo1")?.value || "").trim();
  let parte1 = (document.getElementById("campo2")?.value || "").trim();

  parte1 = parte1.replace(/^0+/, "");
  if (parte1 === "") parte1 = "0";
  if (document.getElementById("campo2")) document.getElementById("campo2").value = parte1;

  const elI = document.getElementById("resultado-google");
  const elGruas = document.getElementById("gruas-aplicaveis");
  const elExata = document.getElementById("correspondencia-exata");
  const elDescPT = document.getElementById("descricao-pt");

  if (elI) elI.value = "";
  if (elGruas) elGruas.value = "";
  if (elExata) elExata.value = "";
  if (elDescPT) elDescPT.value = "";

  if (!parte0) {
    if (elI) elI.value = "Não encontrado";
    if (elGruas) elGruas.value = "Não encontrado";
    if (elExata) elExata.value = "Não encontrado";
    if (elDescPT) elDescPT.value = "Não encontrado";
    return;
  }

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
  logDebug("GET Descrição Português (H->L[16]->Relação[H]->B): " + urlDescPT);
  fetch(urlDescPT).then(r=>r.text()).then(raw=>{
    logDebug("Resposta Descrição PT raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}
    document.getElementById("descricao-pt").value =
      (j && j.ok && (j.descricao||"").trim()) ? (j.descricao||"").trim() : "Não encontrado";
  });
}

// ---------- GPS ----------
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

// ---------- REGISTRAR + FOTO ----------
async function registrarMovimentacaoUI() {
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
    setStatus("Preencha o campo1 antes de registrar.");
    return;
  }

  gpsString = "";
  setStatus(gpsOn ? "Obtendo GPS..." : "Registrando...");

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
      setStatus(`Registrado com sucesso (linha ${j.row} em ${j.sheet} às ${j.dataHora}).`);
      logDebug(`Registro OK: row=${j.row} dataHora=${j.dataHora}`);

      // limpa campos após registrar OK (conforme pedido)
      limparCamposAposRegistrarOK();

      // pergunta se quer tirar foto
      const querFoto = window.confirm(`Registro OK na linha ${j.row}. Deseja tirar uma foto do item?`);
      if (querFoto) {
        pendingPhotoRow = j.row;
        pendingPhotoReason = "registrar";
        abrirCameraParaFoto();
      }

    } else {
      setStatus("Falha ao registrar (ver debug).");
      logDebug("Registrar: resposta inválida/sem ok.");
    }
  } catch (err) {
    setStatus("Erro de rede ao registrar (ver debug).");
    logDebug("Erro Registrar: " + err);
  }
}

function limparCamposAposRegistrarOK() {
  const ids = ["campo1","codigo-c-input","campo2","rua-input","andar-input"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  setCampo1CorPorTamanho("");

  // também limpa alguns campos de exibição se você quiser
  // (mantenho conservador para não atrapalhar o fluxo)
}

// abre câmera traseira via input file
function abrirCameraParaFoto() {
  const fotoInput = document.getElementById("foto-input");
  if (!fotoInput) {
    logDebug("foto-input não encontrado no HTML.");
    setStatus("Erro: foto-input não encontrado.");
    pendingPhotoRow = null;
    pendingPhotoReason = "";
    return;
  }
  setStatus("Abrindo câmera...");
  fotoInput.click();
}

// converte arquivo -> base64 sem prefixo data:
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const res = String(fr.result || "");
      // res = "data:image/jpeg;base64,...."
      const idx = res.indexOf("base64,");
      if (idx >= 0) resolve(res.substring(idx + 7));
      else reject(new Error("Não foi possível extrair base64 do arquivo."));
    };
    fr.onerror = () => reject(fr.error || new Error("Falha ao ler arquivo."));
    fr.readAsDataURL(file);
  });
}

// POST para Apps Script Inventário: mode=upload_foto {row, base64, mime}
async function enviarFotoParaInventario(row, base64, mime) {
  setStatus(`Enviando foto da linha ${row}...`);
  const payload = { mode: "upload_foto", row, base64, mime };

  logDebug(`POST upload_foto: row=${row}, mime=${mime}, base64_len=${base64.length}`);

  // IMPORTANTE: usar Content-Type simples para evitar preflight (CORS)
  const resp = await fetch(ENDPOINT_REGISTRO, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });

  const raw = await resp.text();
  logDebug("Resposta upload_foto raw: " + raw);

  let j = null;
  try { j = JSON.parse(raw); } catch {}

  if (j && j.ok && j.uploaded && (j.fotoUrl || "").trim()) {
    setStatus(`Foto salva com sucesso (linha ${row}).`);
    atualizarPreviewFoto(j.fotoUrl);
    logDebug(`Foto OK: row=${row}, url=${j.fotoUrl}`);
  } else {
    setStatus("Falha ao salvar foto (ver debug).");
    logDebug("upload_foto: resposta inválida/sem ok.");
  }
}

function atualizarPreviewFoto(url) {
  const img = document.getElementById("foto-preview");
  if (!img) return;

  if (url && String(url).trim()) {
    // cache buster
    img.src = `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
    img.style.display = "block";
  } else {
    img.src = "";
    img.style.display = "none";
  }
}

// ---------- CONSULTAR LINHA + PREVIEW + SUBSTITUIR FOTO ----------
async function consultarLinhaInventarioUI() {
  const linhaStr = (document.getElementById("linha_consulta")?.value || "").trim();
  const row = parseInt(linhaStr, 10);

  if (!row || row < 2) {
    logDebug("Consultar linha: informe um número de linha válido (>=2).");
    setStatus("Informe um número de linha válido (>=2).");
    return;
  }

  const url = `${ENDPOINT_REGISTRO}?mode=get_lin&row=${encodeURIComponent(row)}&t=${Date.now()}`;
  logDebug("GET Consultar linha (get_lin): " + url);
  setStatus("Consultando linha...");

  try {
    const raw = await (await fetch(url)).text();
    logDebug("Resposta get_lin raw: " + raw);

    let j = null;
    try { j = JSON.parse(raw); } catch {}

    if (j && j.ok && j.data) {
      const d = j.data;
      const txt = `Linha ${row}: campo1=${d.campo1} | campo2=${d.campo2} | loc=${d.loc} | rua=${d.rua} | andar=${d.andar} | numInv=${d.numInv} | dataHora=${d.dataHora}`;
      const out = document.getElementById("txt-lin");
      if (out) out.value = txt;

      atualizarPreviewFoto(d.fotoUrl || "");
      setStatus(`Linha ${row} carregada.`);
    } else {
      setStatus("Linha não encontrada/erro (ver debug).");
      const out = document.getElementById("txt-lin");
      if (out) out.value = "Não encontrado";
      atualizarPreviewFoto("");
    }
  } catch (err) {
    setStatus("Erro ao consultar linha (ver debug).");
    logDebug("Erro get_lin: " + err);
  }
}

async function deletarLinhaInventarioUI() {
  const linhaStr = (document.getElementById("linha_consulta")?.value || "").trim();
  const row = parseInt(linhaStr, 10);

  if (!row || row < 2) {
    setStatus("Informe um número de linha válido (>=2).");
    logDebug("Deletar linha: row inválido.");
    return;
  }

  // Busca conteúdo antes para confirmar
  const urlGet = `${ENDPOINT_REGISTRO}?mode=get_lin&row=${encodeURIComponent(row)}&t=${Date.now()}`;
  logDebug("GET get_lin (pré-delete): " + urlGet);

  try {
    const rawGet = await (await fetch(urlGet)).text();
    logDebug("Resposta get_lin (pré-delete) raw: " + rawGet);

    let jGet=null; try{ jGet=JSON.parse(rawGet);}catch{}

    const resumo = (jGet && jGet.ok && jGet.data)
      ? `campo1=${jGet.data.campo1} | campo2=${jGet.data.campo2} | loc=${jGet.data.loc} | rua=${jGet.data.rua} | andar=${jGet.data.andar} | numInv=${jGet.data.numInv}`
      : "(conteúdo indisponível)";

    const ok = window.confirm(`Deseja limpar a linha ${row}?\n\n${resumo}`);
    if (!ok) return;

    const urlClear = `${ENDPOINT_REGISTRO}?mode=clear_lin&row=${encodeURIComponent(row)}&t=${Date.now()}`;
    logDebug("GET clear_lin: " + urlClear);
    setStatus("Limpando linha...");

    const rawClear = await (await fetch(urlClear)).text();
    logDebug("Resposta clear_lin raw: " + rawClear);

    let j=null; try{ j=JSON.parse(rawClear);}catch{}
    if (j && j.ok && j.cleared) {
      setStatus(`Linha ${row} limpa com sucesso.`);
      const out = document.getElementById("txt-lin");
      if (out) out.value = "";
      atualizarPreviewFoto("");
    } else {
      setStatus("Falha ao limpar linha (ver debug).");
    }

  } catch (err) {
    setStatus("Erro ao limpar linha (ver debug).");
    logDebug("Erro clear_lin: " + err);
  }
}

function substituirFotoLinhaUI() {
  const linhaStr = (document.getElementById("linha_consulta")?.value || "").trim();
  const row = parseInt(linhaStr, 10);

  if (!row || row < 2) {
    setStatus("Informe um número de linha válido (>=2).");
    logDebug("Substituir foto: row inválido.");
    return;
  }

  const ok = window.confirm(`Deseja substituir a foto da linha ${row}?`);
  if (!ok) return;

  pendingPhotoRow = row;
  pendingPhotoReason = "substituir";
  abrirCameraParaFoto();
}

