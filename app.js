let html5QrCode;
let scannerAtivo = false;
let lastScannedCode = "";

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
function limparDebug() { const el = document.getElementById("debug-log"); if (el) el.value = ""; }
async function copiarDebug() {
  const el = document.getElementById("debug-log"); if (!el) return;
  try { await navigator.clipboard.writeText(el.value); logDebug("✅ Log copiado"); }
  catch (e) { logDebug("❌ Falha ao copiar log:", e); }
}
// =================

function iniciarLeitor() {
  if (scannerAtivo) { logDebug("Scanner já ativo; ignorando start."); return; }
  logDebug("Iniciando leitor...");
  html5QrCode = new Html5Qrcode("qr-reader");
  const config = { fps: 10, qrbox: { width: 250, height: 250 } };

  html5QrCode.start(
    { facingMode: "environment" },
    config,
    (qrCodeMessage) => {
      lastScannedCode = qrCodeMessage;
      document.getElementById("qr-result").innerText = `QR lido: ${qrCodeMessage}`;
      document.getElementById("codigo-lido").value = qrCodeMessage;
      logDebug("QR bruto lido:", qrCodeMessage);

      const partes = qrCodeMessage.split("|").filter(Boolean);
      logDebug("Partes após split('|'):", partes);

      if (partes.length === 4) {
        document.getElementById("campo1").value = partes[0];
        document.getElementById("campo2").value = partes[1];
        document.getElementById("campo3").value = partes[2];
        document.getElementById("campo4").value = partes[3];

        // Limpa campos antes das consultas
        document.getElementById("gruas-aplicaveis").value = "";
        document.getElementById("correspondencia-exata").value = "";

        const endpoint = "https://script.google.com/macros/s/AKfycbyJG6k8tLiwSo7wQuWEsS03ASb3TYToR-HBMjOGmUja6b6lJ9rhDNNjcOwWcwvb1MfD/exec";

        // 1) Gruas aplicáveis: H = partes[0], retornar C (todas ocorrências)
        const urlGruas = `${endpoint}?mode=gruas&h=${encodeURIComponent(String(partes[0]).trim())}`;
        logDebug("GET Gruas aplicáveis:", urlGruas);
        fetch(urlGruas)
          .then(async res => { const raw = await res.text(); logDebug("Resposta Gruas (raw):", raw); try { return JSON.parse(raw); } catch { return null; } })
          .then(json => {
            if (json && json.ok) {
              const lista = Array.isArray(json.gruas) ? json.gruas : [];
              const texto = lista.length ? lista.join("\n") : "Não encontrado";
              document.getElementById("gruas-aplicaveis").value = texto;
              logDebug("Gruas aplicáveis preenchido:", texto);
            } else {
              document.getElementById("gruas-aplicaveis").value = "Não encontrado";
              logDebug("Gruas aplicáveis: resposta inválida/sem ok");
            }
          })
          .catch(err => {
            document.getElementById("gruas-aplicaveis").value = "Erro na consulta";
            logDebug("Erro fetch Gruas:", err);
          });

        // 2) Correspondência exata: H = partes[0] AND K = partes[1], retornar M (primeiro)
        const urlExata = `${endpoint}?mode=exata&h=${encodeURIComponent(String(partes[0]).trim())}&k=${encodeURIComponent(String(partes[1]).trim())}`;
        logDebug("GET Correspondência exata:", urlExata);
        fetch(urlExata)
          .then(async res => { const raw = await res.text(); logDebug("Resposta Exata (raw):", raw); try { return JSON.parse(raw); } catch { return null; } })
          .then(json => {
            if (json && json.ok) {
              const valor = (json.exata || "").trim();
              document.getElementById("correspondencia-exata").value = valor || "Não encontrado";
              logDebug("Correspondência exata preenchido:", valor || "Não encontrado");
            } else {
              document.getElementById("correspondencia-exata").value = "Não encontrado";
              logDebug("Correspondência exata: resposta inválida/sem ok");
            }
          })
          .catch(err => {
            document.getElementById("correspondencia-exata").value = "Erro na consulta";
            logDebug("Erro fetch Exata:", err);
          });

      } else {
        document.getElementById("campo1").value = "";
        document.getElementById("campo2").value = "";
        document.getElementById("campo3").value = "";
        document.getElementById("campo4").value = "";
        document.getElementById("gruas-aplicaveis").value = "";
        document.getElementById("correspondencia-exata").value = "";
        document.getElementById("status-msg").innerText = "❌ QR inválido: formato incorreto";
        logDebug("Formato inválido. Esperado 4 partes, obtido:", partes.length);
      }
    },
    // erros de frame de leitura (normalmente ignorados)
    () => {}
  ).then(() => {
    scannerAtivo = true;
    logDebug("Leitor iniciado com sucesso.");
  }).catch(err => {
    document.getElementById("qr-result").innerText = `Erro ao iniciar câmera: ${err}`;
    logDebug("Erro ao iniciar câmera:", err);
  });
}

function pararLeitor() {
  if (!scannerAtivo || !html5QrCode) { logDebug("pararLeitor: scanner não ativo."); return; }
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

// Envio de movimentação (mantido)
function registrarMovimentacao(tipo) {
  const codigoLido = document.getElementById("codigo-lido").value.trim();
  const manualInput = document.getElementById("manual-input").value.trim();
  const codigo = manualInput || codigoLido;

  if (!codigo) { alert("Nenhum código informado ou lido."); logDebug("Registrar sem código."); return; }

  const data = { tipo, codigo, timestamp: new Date().toISOString() };
  const endpointPost = "https://script.google.com/macros/s/AKfycbyJG6k8tLiwSo7wQuWEsS03ASb3TYToR-HBMjOGmUja6b6lJ9rhDNNjcOwWcwvb1MfD/exec";
  logDebug("POST registro:", endpointPost, data);

  fetch(endpointPost, {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" }
  })
  .then(async r => { const raw = await r.text(); logDebug("Resposta POST (raw):", raw); return raw; })
  .then(() => {
    document.getElementById("status-msg").innerText = `✅ ${tipo} registrada com sucesso`;
    document.getElementById("manual-input").value = "";
    document.getElementById("codigo-lido").value = "";
    document.getElementById("qr-result").innerText = "Aguardando leitura...";
    lastScannedCode = "";
    document.getElementById("campo1").value = "";
    document.getElementById("campo2").value = "";
    document.getElementById("campo3").value = "";
    document.getElementById("campo4").value = "";
    // Não limpamos as consultas para manter referência visual
    logDebug("Registro concluído.");
  })
  .catch(error => {
    document.getElementById("status-msg").innerText = `❌ Erro ao registrar: ${error}`;
    logDebug("Erro no POST:", error);
  });
}
