// v0.1 - Debug reforçado das chamadas ao Apps Script (início, status, headers, corpo, erros)

let html5QrCode;
let scannerAtivo = false;
let lastScannedCode = "";

// ===== CONFIG =====
const ENDPOINT_GAS = "https://script.google.com/macros/s/AKfycbyJG6k8tLiwSo7wQuWEsS03ASb3TYToR-HBMjOGmUja6b6lJ9rhDNNjcOwWcwvb1MfD/exec";
// ==================

// ===== DEBUG =====
function logDebug(...msgs) {
  const el = document.getElementById("debug-log");
  const ts = new Date().toLocaleTimeString();
  const line = `[${ts}] ` + msgs.map(m => {
    try { return (typeof m === "string") ? m : JSON.stringify(m); }
    catch { return String(m); }
  }).join(" ");
  if (el) { el.value += line + "\n"; el.scrollTop = el.scrollHeight; }
}

function limparDebug() {
  const el = document.getElementById("debug-log");
  if (el) el.value = "";
}

async function copiarDebug() {
  const el = document.getElementById("debug-log");
  if (!el) return;
  try {
    await navigator.clipboard.writeText(el.value);
    logDebug("✅ Log copiado");
  } catch (e) {
    logDebug("❌ Falha ao copiar log:", e);
  }
}
// =================

// Helper para fazer fetch com logs detalhados
async function fetchComDebug(url, options = {}) {
  logDebug("→ GET/POST (ini):", { url, method: options.method || "GET" });

  try {
    const res = await fetch(url, options);

    // Status + headers
    const headersObj = {};
    res.headers.forEach((v, k) => headersObj[k] = v);
    logDebug("← Resposta HTTP:", { ok: res.ok, status: res.status, headers: headersObj });

    // Corpo bruto (texto)
    const raw = await res.text();
    logDebug("← Corpo (raw):", raw);

    // Tentar JSON
    let json = null;
    try { json = JSON.parse(raw); }
    catch { /* mantém null */ }

    if (!res.ok) {
      logDebug("⚠️ HTTP não-OK. Corpo já acima. Pode ser permissão/implantação.");
    }
    if (!headersObj["content-type"] || !headersObj["content-type"].includes("application/json")) {
      logDebug("⚠️ Content-Type não é JSON. O Apps Script pode estar retornando HTML/erro.");
    }

    return { res, raw, json };
  } catch (err) {
    // Erros de rede/CORS normalmente aparecem como TypeError
    logDebug("❌ Erro de rede/CORS no fetch:", String(err));
    logDebug("💡 Dica: verifique se a implantação está ATIVA, com acesso 'Qualquer pessoa', e se a URL termina com /exec.");
    return { res: null, raw: null, json: null, error: err };
  }
}

// Inicia a leitura
function iniciarLeitor() {
  if (scannerAtivo) {
    logDebug("Scanner já ativo; ignorando start.");
    return;
  }

  logDebug("Iniciando leitor...");
  html5QrCode = new Html5Qrcode("qr-reader");

  const config = { fps: 10, qrbox: { width: 250, height: 250 } };

  html5QrCode.start(
    { facingMode: "environment" },
    config,
    async (qrCodeMessage) => {
      lastScannedCode = qrCodeMessage;
      document.getElementById("qr-result").innerText = `QR lido: ${qrCodeMessage}`;
      document.getElementById("codigo-lido").value = qrCodeMessage;
      logDebug("QR bruto lido:", qrCodeMessage);

      // Normaliza e separa (remove vazios finais se terminar com "|")
      const partes = qrCodeMessage.split("|").filter(Boolean);
      logDebug("Partes após split('|') e filter(Boolean):", partes);

      if (partes.length !== 4) {
        document.getElementById("campo1").value = "";
        document.getElementById("campo2").value = "";
        document.getElementById("campo3").value = "";
        document.getElementById("campo4").value = "";
        document.getElementById("resultado-google").value = "";
        document.getElementById("status-msg").innerText = "❌ QR inválido: formato incorreto";
        logDebug("⛔ Pulando consultas: esperado 4 partes, obtido:", partes.length);
        return;
      }

      // Preenche campos
      document.getElementById("campo1").value = partes[0];
      document.getElementById("campo2").value = partes[1];
      document.getElementById("campo3").value = partes[2];
      document.getElementById("campo4").value = partes[3];

      // Limpa campos das consultas antes de buscar
      const elGruas = document.getElementById("gruas-aplicaveis");
      const elExata = document.getElementById("correspondencia-exata");
      if (elGruas) elGruas.value = "";
      if (elExata) elExata.value = "";

      // -------- Consulta 1: Gruas aplicáveis (mode=gruas, H = partes[0] -> retorna C[])
      const urlGruas = `${ENDPOINT_GAS}?mode=gruas&h=${encodeURIComponent(String(partes[0]).trim())}`;
      logDebug("GET Gruas (URL):", urlGruas);

      const r1 = await fetchComDebug(urlGruas);
      if (r1.error) {
        if (elGruas) elGruas.value = "Erro na consulta";
      } else {
        const lista = (r1.json && r1.json.ok && Array.isArray(r1.json.gruas)) ? r1.json.gruas : [];
        const texto = lista.length ? lista.join("\n") : "Não encontrado";
        if (elGruas) elGruas.value = texto;
        logDebug("Gruas aplicáveis preenchido:", texto);
      }

      // -------- Consulta 2: Correspondência exata (mode=exata, H = partes[0] AND K = partes[1] -> retorna M)
      const urlExata = `${ENDPOINT_GAS}?mode=exata&h=${encodeURIComponent(String(partes[0]).trim())}&k=${encodeURIComponent(String(partes[1]).trim())}`;
      logDebug("GET Exata (URL):", urlExata);

      const r2 = await fetchComDebug(urlExata);
      if (r2.error) {
        if (elExata) elExata.value = "Erro na consulta";
      } else {
        const valor = (r2.json && r2.json.ok && (r2.json.exata || "").trim()) || "";
        if (elExata) elExata.value = valor || "Não encontrado";
        logDebug("Correspondência exata preenchido:", valor || "Não encontrado");
      }
    },
    // erros de frame de leitura (comuns); deixe silencioso para não poluir
    () => {}
  ).then(() => {
    scannerAtivo = true;
    logDebug("Leitor iniciado com sucesso.");
  }).catch(err => {
    document.getElementById("qr-result").innerText = `Erro ao iniciar câmera: ${err}`;
    logDebug("Erro ao iniciar câmera:", err);
  });
}

// Para a leitura
function pararLeitor() {
  if (!scannerAtivo || !html5QrCode) {
    logDebug("pararLeitor: scanner não ativo.");
    return;
  }

  logDebug("Parando leitor...");
  html5QrCode.stop().then(() => {
    html5QrCode.clear();
    scannerAtivo = false;
    document.getElementById("qr-result").innerText = "Leitura pausada.";
    logDebug("Leitor parado e área limpa.");
  }).catch(err => {
    document.getElementById("qr-result").innerText = `Erro ao parar câmera: ${err}`;
    logDebug("Erro ao parar câmera:", err);
  });
}

// Envia a movimentação (mantido)
async function registrarMovimentacao(tipo) {
  const codigoLido = document.getElementById("codigo-lido").value.trim();
  const manualInput = document.getElementById("manual-input").value.trim();
  const codigo = manualInput || codigoLido;

  if (!codigo) {
    alert("Nenhum código informado ou lido.");
    logDebug("Registrar sem código: abortado.");
    return;
  }

  const data = { tipo, codigo, timestamp: new Date().toISOString() };
  const options = {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" }
  };

  const r = await fetchComDebug(ENDPOINT_GAS, options);
  if (r.error) {
    document.getElementById("status-msg").innerText = `❌ Erro ao registrar`;
    return;
  }

  document.getElementById("status-msg").innerText = `✅ ${tipo} registrada com sucesso`;
  document.getElementById("manual-input").value = "";
  document.getElementById("codigo-lido").value = "";
  document.getElementById("qr-result").innerText = "Aguardando leitura...";
  lastScannedCode = "";

  document.getElementById("campo1").value = "";
  document.getElementById("campo2").value = "";
  document.getElementById("campo3").value = "";
  document.getElementById("campo4").value = "";
  // Mantemos os campos de consulta preenchidos para referência
  logDebug("Registro concluído.");
}
