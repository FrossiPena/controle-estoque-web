let html5QrCode;
let scannerAtivo = false;
let lastScannedCode = "";

// ===== DEBUG =====
function logDebug(...msgs) {
  const el = document.getElementById("debug-log");
  const ts = new Date().toLocaleTimeString();
  const line = `[${ts}] ` + msgs.map(m => {
    try {
      if (typeof m === "string") return m;
      return JSON.stringify(m);
    } catch {
      return String(m);
    }
  }).join(" ");
  if (el) {
    el.value += line + "\n";
    el.scrollTop = el.scrollHeight;
  }
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
    logDebug("✅ Log copiado para a área de transferência");
  } catch (e) {
    logDebug("❌ Falha ao copiar log:", e);
  }
}
// =================

// Inicia a leitura
function iniciarLeitor() {
  if (scannerAtivo) {
    logDebug("Scanner já estava ativo; ignorando novo start.");
    return;
  }

  logDebug("Iniciando leitor...");
  html5QrCode = new Html5Qrcode("qr-reader");

  const config = { fps: 10, qrbox: { width: 250, height: 250 } };

  html5QrCode.start(
    { facingMode: "environment" },
    config,
    qrCodeMessage => {
      lastScannedCode = qrCodeMessage;
      document.getElementById("qr-result").innerText = `QR lido: ${qrCodeMessage}`;
      document.getElementById("codigo-lido").value = qrCodeMessage;
      logDebug("QR bruto lido:", qrCodeMessage);

      // Normaliza e separa (remove vazios finais se terminar com "|")
      const partes = qrCodeMessage.split("|").filter(Boolean);
      logDebug("Partes após split('|') e filter(Boolean):", partes);

      if (partes.length === 4) {
        document.getElementById("campo1").value = partes[0];
        document.getElementById("campo2").value = partes[1];
        document.getElementById("campo3").value = partes[2];
        document.getElementById("campo4").value = partes[3];

        // Consulta campo2 no Google Sheets
        const endpoint = "https://script.google.com/macros/s/AKfycbyJG6k8tLiwSo7wQuWEsS03ASb3TYToR-HBMjOGmUja6b6lJ9rhDNNjcOwWcwvb1MfD/exec";
        const url = `${endpoint}?codigo=${encodeURIComponent(partes[0])}`;
        logDebug("Consultando Google Sheets (GET):", url);

        fetch(url)
          .then(async res => {
            const raw = await res.text();
            logDebug("Resposta bruta do Apps Script:", raw);

            // Tenta parsear JSON; se não der, loga e trata como não encontrado
            let dado;
            try {
              dado = JSON.parse(raw);
            } catch (e) {
              logDebug("⚠️ Não foi possível parsear JSON. Conteúdo recebido não-JSON.");
              dado = null;
            }
            return dado;
          })
          .then(dado => {
            if (dado && dado.resultado) {
              document.getElementById("resultado-google").value = dado.resultado;
              document.getElementById("status-msg").innerText = "✅ Referência encontrada";
              logDebug("Resultado encontrado:", dado.resultado);
            } else {
              document.getElementById("resultado-google").value = "Não encontrado";
              document.getElementById("status-msg").innerText = "⚠️ Código não encontrado na planilha";
              logDebug("Código não encontrado na planilha (resultado nulo/indefinido).");
            }
          })
          .catch((err) => {
            document.getElementById("resultado-google").value = "Erro na consulta";
            document.getElementById("status-msg").innerText = "❌ Erro ao acessar planilha";
            logDebug("Erro no fetch para Apps Script:", err);
          });

      } else {
        document.getElementById("campo1").value = "";
        document.getElementById("campo2").value = "";
        document.getElementById("campo3").value = "";
        document.getElementById("campo4").value = "";
        document.getElementById("resultado-google").value = "";
        document.getElementById("status-msg").innerText = "❌ QR inválido: formato incorreto";
        logDebug("Formato inválido. Esperado 4 partes, obtido:", partes.length);
      }
    },
    error => {
      // Erros de leitura são comuns (frame sem QR etc.). Logue se quiser.
      // logDebug("Leitura falhou (frame):", error);
    }
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
    logDebug("pararLeitor chamado, mas scanner não estava ativo.");
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

// Envia a movimentação
function registrarMovimentacao(tipo) {
  const codigoLido = document.getElementById("codigo-lido").value.trim();
  const manualInput = document.getElementById("manual-input").value.trim();
  const codigo = manualInput || codigoLido;

  if (!codigo) {
    alert("Nenhum código informado ou lido.");
    logDebug("Tentativa de registrar sem código.");
    return;
  }

  const data = {
    tipo,
    codigo,
    timestamp: new Date().toISOString()
  };

  const endpointPost = "https://script.google.com/macros/s/AKfycbyJG6k8tLiwSo7wQuWEsS03ASb3TYToR-HBMjOGmUja6b6lJ9rhDNNjcOwWcwvb1MfD/exec";
  logDebug("Enviando POST para registro:", endpointPost, data);

  fetch(endpointPost, {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" }
  })
  .then(async response => {
    const raw = await response.text();
    logDebug("Resposta POST (bruta):", raw);
    return raw;
  })
  .then(result => {
    document.getElementById("status-msg").innerText = `✅ ${tipo} registrada com sucesso`;
    document.getElementById("manual-input").value = "";
    document.getElementById("codigo-lido").value = "";
    document.getElementById("qr-result").innerText = "Aguardando leitura...";
    lastScannedCode = "";

    document.getElementById("campo1").value = "";
    document.getElementById("campo2").value = "";
    document.getElementById("campo3").value = "";
    document.getElementById("campo4").value = "";
    document.getElementById("resultado-google").value = "";

    logDebug("Registro concluído com sucesso.");
  })
  .catch(error => {
    document.getElementById("status-msg").innerText = `❌ Erro ao registrar: ${error}`;
    logDebug("Erro no POST de registro:", error);
  });
}

