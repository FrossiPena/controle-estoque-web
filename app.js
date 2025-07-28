let html5QrCode;
let scannerAtivo = false;
let lastScannedCode = "";

// Inicia a leitura
function iniciarLeitor() {
  if (scannerAtivo) return;

  html5QrCode = new Html5Qrcode("qr-reader");

  const config = { fps: 10, qrbox: { width: 250, height: 250 } };

  html5QrCode.start(
    { facingMode: "environment" },
    config,
    qrCodeMessage => {
      lastScannedCode = qrCodeMessage;
      document.getElementById("qr-result").innerText = `QR lido: ${qrCodeMessage}`;
      document.getElementById("codigo-lido").value = qrCodeMessage;

      // ✅ Corrige strings com separador final "|"
      const partes = qrCodeMessage.split("|").filter(Boolean);

      if (partes.length === 4) {
        document.getElementById("campo1").value = partes[0];
        document.getElementById("campo2").value = partes[1];
        document.getElementById("campo3").value = partes[2];
        document.getElementById("campo4").value = partes[3];
      } else {
        document.getElementById("campo1").value = "";
        document.getElementById("campo2").value = "";
        document.getElementById("campo3").value = "";
        document.getElementById("campo4").value = "";
        document.getElementById("status-msg").innerText = "❌ QR inválido: formato incorreto";
      }
    },
    error => {
      // Ignora erros silenciosamente
    }
  ).then(() => {
    scannerAtivo = true;
  }).catch(err => {
    document.getElementById("qr-result").innerText = `Erro ao iniciar câmera: ${err}`;
  });
}

// Para a leitura
function pararLeitor() {
  if (!scannerAtivo || !html5QrCode) return;

  html5QrCode.stop().then(() => {
    html5QrCode.clear();
    scannerAtivo = false;
    document.getElementById("qr-result").innerText = "Leitura pausada.";
  }).catch(err => {
    document.getElementById("qr-result").innerText = `Erro ao parar câmera: ${err}`;
  });
}

// Envia a movimentação
function registrarMovimentacao(tipo) {
  const codigoLido = document.getElementById("codigo-lido").value.trim();
  const manualInput = document.getElementById("manual-input").value.trim();
  const codigo = manualInput || codigoLido;

  if (!codigo) {
    alert("Nenhum código informado ou lido.");
    return;
  }

  const data = {
    tipo,
    codigo,
    timestamp: new Date().toISOString()
  };

  fetch("https://script.google.com/macros/s/SEU_ENDPOINT_AQUI/exec", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" }
  })
  .then(response => response.text())
  .then(result => {
    document.getElementById("status-msg").innerText = `✅ ${tipo} registrada com sucesso`;
    document.getElementById("manual-input").value = "";
    document.getElementById("codigo-lido").value = "";
    document.getElementById("qr-result").innerText = "Aguardando leitura...";
    lastScannedCode = "";

    // Limpa os campos separados
    document.getElementById("campo1").value = "";
    document.getElementById("campo2").value = "";
    document.getElementById("campo3").value = "";
    document.getElementById("campo4").value = "";
  })
  .catch(error => {
    document.getElementById("status-msg").innerText = `❌ Erro ao registrar: ${error}`;
  });
}
