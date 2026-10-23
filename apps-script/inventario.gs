// v5.6-inv - Inventário: A..N
// A campo1 | B campo2 | C loc | D rua | E andar | F gps | G dataHora | H numInv
// I fotoUrl | J fotoUrl2 | K fotoUrl3 | L fotoUrl4 | M OBS | N usuario
// Login: toda chamada (exceto diag) exige user + pass válidos na propriedade USUARIOS
//        (Configurações do projeto > Propriedades do script), formato: nome:senha, um por linha
// upload_foto: slot 1..4 grava em I..L e salva arquivo como row_slot.ext (ex: 6_1.jpg)
// ultimo_inv: retorna a linha mais recente (de baixo para cima) com campo1 + campo2 informados
// lista_inv: todas as linhas com campo1 (qualquer campo2), mais recente primeiro
// ultimo_numinv: último valor preenchido da coluna H (NumInv), de baixo para cima

const SCRIPT_VERSION = "v5.6-inv";
const LISTA_MAX = 200; // limite de itens do lista_inv
const NCOLS = 14; // A..N

const INVENTARIO_ID  = "1CheE1Vpy-hldpiSbl6EC79VI_8DMxDmJ74XW8jevzN8";
const INVENTARIO_ABA = "Movimentacoes";

// Pasta Google Drive onde as fotos serão gravadas:
const FOTOS_FOLDER_ID = "1w6g4uWtwkpuvRsR67fzfoSYjx73p7j8d";

const TZ = "America/Sao_Paulo";

function doGet(e) {
  const p = (e && e.parameter) ? e.parameter : {};
  const mode = String(p.mode || "").trim();

  try {
    if (mode === "diag") {
      return json_({ ok:true, version: SCRIPT_VERSION, mode:"diag" });
    }

    const usuario = auth_(p.user, p.pass);
    if (!usuario) return json_({ ok:false, auth:false, version: SCRIPT_VERSION, error:"acesso negado" });

    if (mode === "login") {
      return json_({ ok:true, version: SCRIPT_VERSION, user: usuario });
    }

    if (mode === "diag_drive") {
      const folder = DriveApp.getFolderById(FOTOS_FOLDER_ID);
      return json_({
        ok:true,
        version: SCRIPT_VERSION,
        folderName: folder.getName(),
        folderId: folder.getId()
      });
    }

    if (mode === "log_mov") {
      const sh = getSheet_();
      ensureHeader_(sh);

      const campo1 = String(p.campo1 || "").trim();
      const campo2 = String(p.campo2 || "").trim();
      const loc    = String(p.loc || "").trim();
      const rua    = String(p.rua || "").trim();
      const andar  = String(p.andar || "").trim();
      const gps    = String(p.gpsString || "").trim();
      const numInv = String(p.numInv || "").trim();
      const obs    = String(p.obs || "").trim(); // OBS -> coluna M

      const dataHora = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm:ss");

      // Garantir 14 colunas (A..N). Fotos (I..L) iniciam vazias.
      const rowData = [
        campo1, campo2, loc, rua, andar, gps, dataHora, numInv,
        "", "", "", "", obs, usuario
      ];

      sh.appendRow(rowData);
      const row = sh.getLastRow();

      return json_({ ok:true, version: SCRIPT_VERSION, appended:true, sheet: INVENTARIO_ABA, row, dataHora });
    }

    if (mode === "get_lin") {
      const row = parseInt(String(p.row || "0"), 10);
      if (!row || row < 2) return json_({ ok:false, version: SCRIPT_VERSION, error:"row inválida (>=2)" });

      const sh = getSheet_();
      ensureHeader_(sh);

      // Se pedirem uma linha maior que o max, retorna vazio
      if (row > sh.getMaxRows()) return json_({ ok:false, version: SCRIPT_VERSION, error:"row fora do range da planilha" });

      const values = sh.getRange(row, 1, 1, NCOLS).getValues()[0];
      return json_({ ok:true, version: SCRIPT_VERSION, row, data: rowToData_(values) });
    }

    if (mode === "ultimo_inv") {
      if (!String(p.campo1 || "").trim() || !String(p.campo2 || "").trim()) {
        return json_({ ok:false, version: SCRIPT_VERSION, error:"campo1 e campo2 são obrigatórios" });
      }

      const sh = getSheet_();
      ensureHeader_(sh);

      const last = sh.getLastRow();
      if (last < 2) return json_({ ok:true, version: SCRIPT_VERSION, found:false });

      const campo1 = normCodigo_(p.campo1);
      const campo2 = normCodigo_(p.campo2);
      const values = sh.getRange(2, 1, last - 1, NCOLS).getValues();

      // De baixo para cima: o último registro (linha mais recente) vence
      for (let i = values.length - 1; i >= 0; i--) {
        const v = values[i];
        if (normCodigo_(v[0]) === campo1 && normCodigo_(v[1]) === campo2) {
          return json_({ ok:true, version: SCRIPT_VERSION, found:true, row: i + 2, data: rowToData_(v) });
        }
      }

      return json_({ ok:true, version: SCRIPT_VERSION, found:false });
    }

    if (mode === "lista_inv") {
      if (!String(p.campo1 || "").trim()) {
        return json_({ ok:false, version: SCRIPT_VERSION, error:"campo1 é obrigatório" });
      }

      const sh = getSheet_();
      ensureHeader_(sh);

      const last = sh.getLastRow();
      if (last < 2) return json_({ ok:true, version: SCRIPT_VERSION, itens:[], total:0 });

      const campo1 = normCodigo_(p.campo1);
      const values = sh.getRange(2, 1, last - 1, NCOLS).getValues();

      // De baixo para cima: mais recente primeiro; ignora linhas limpas
      const itens = [];
      let total = 0;
      for (let i = values.length - 1; i >= 0; i--) {
        const v = values[i];
        if (String(v[0] || "").trim() === "" || normCodigo_(v[0]) !== campo1) continue;
        total++;
        if (itens.length < LISTA_MAX) itens.push(Object.assign({ row: i + 2 }, rowToData_(v)));
      }

      return json_({ ok:true, version: SCRIPT_VERSION, itens, total, truncado: total > itens.length });
    }

    if (mode === "ultimo_numinv") {
      const sh = getSheet_();
      const last = sh.getLastRow();
      if (last < 2) return json_({ ok:true, version: SCRIPT_VERSION, numInv:"", row:0 });

      const colH = sh.getRange(2, 8, last - 1, 1).getValues();
      for (let i = colH.length - 1; i >= 0; i--) {
        const v = String(colH[i][0] == null ? "" : colH[i][0]).trim();
        if (v) return json_({ ok:true, version: SCRIPT_VERSION, numInv: v, row: i + 2 });
      }
      return json_({ ok:true, version: SCRIPT_VERSION, numInv:"", row:0 });
    }

    if (mode === "clear_lin") {
      const row = parseInt(String(p.row || "0"), 10);
      if (!row || row < 2) return json_({ ok:false, version: SCRIPT_VERSION, error:"row inválida (>=2)" });

      const sh = getSheet_();
      ensureHeader_(sh);

      if (row > sh.getMaxRows()) return json_({ ok:false, version: SCRIPT_VERSION, error:"row fora do range da planilha" });

      sh.getRange(row, 1, 1, NCOLS).setValues([ new Array(NCOLS).fill("") ]);
      return json_({ ok:true, version: SCRIPT_VERSION, cleared:true, row });
    }

    return json_({ ok:false, version: SCRIPT_VERSION, error:"mode inválido ou ausente" });

  } catch (err) {
    return json_({ ok:false, version: SCRIPT_VERSION, error:"Erro no doGet", detail:String(err) });
  }
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : "";
    const payload = JSON.parse(raw || "{}");
    const mode = String(payload.mode || "").trim();

    if (!auth_(payload.user, payload.pass)) {
      return json_({ ok:false, auth:false, version: SCRIPT_VERSION, error:"acesso negado" });
    }

    if (mode !== "upload_foto") {
      return json_({ ok:false, version: SCRIPT_VERSION, error:"mode inválido no POST" });
    }

    const row = Number(payload.row || 0);
    let slot = Number(payload.slot || 1);
    if (![1,2,3,4].includes(slot)) slot = 1;

    const mime = String(payload.mime || "image/jpeg");
    const base64 = String(payload.base64 || "");

    if (!row || row < 2) return json_({ ok:false, version: SCRIPT_VERSION, error:"row inválida (>=2)" });
    if (!base64) return json_({ ok:false, version: SCRIPT_VERSION, error:"base64 vazio" });

    const folder = DriveApp.getFolderById(FOTOS_FOLDER_ID);

    const ext = extFromMime_(mime); // jpg/png/webp
    const filename = `${row}_${slot}.${ext}`;

    // Remove arquivo antigo com mesmo nome (se houver)
    const it = folder.getFilesByName(filename);
    while (it.hasNext()) {
      const old = it.next();
      old.setTrashed(true);
    }

    const bytes = Utilities.base64Decode(base64);
    const blob = Utilities.newBlob(bytes, mime, filename);

    const file = folder.createFile(blob);

    // Tenta compartilhar com link (se permitido na sua organização)
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      // se a política do domínio bloquear, ainda retorna a URL do file/d/...
    }

    const fotoUrl = `https://drive.google.com/file/d/${file.getId()}/view`;

    const sh = getSheet_();
    ensureHeader_(sh);

    // coluna para slot:
    // slot1 => I (9)
    // slot2 => J (10)
    // slot3 => K (11)
    // slot4 => L (12)
    const col = 8 + slot; // 9..12

    // garante que a linha exista (se necessário, cria linhas vazias no final)
    if (row > sh.getMaxRows()) {
      sh.insertRowsAfter(sh.getMaxRows(), row - sh.getMaxRows());
    }

    sh.getRange(row, col).setValue(fotoUrl);

    return json_({
      ok:true,
      version: SCRIPT_VERSION,
      row,
      slot,
      fotoUrl,
      fileId: file.getId(),
      filename
    });

  } catch (err) {
    return json_({ ok:false, version: SCRIPT_VERSION, error:"Erro em upload_foto", detail:String(err) });
  }
}

/* =========================
   Helpers
========================= */

function getSheet_() {
  const ss = SpreadsheetApp.openById(INVENTARIO_ID);
  const sh = ss.getSheetByName(INVENTARIO_ABA);
  if (!sh) throw new Error(`Aba '${INVENTARIO_ABA}' não encontrada`);
  return sh;
}

function ensureHeader_(sh) {
  // garante 14 colunas e headers na linha 1
  const headers = [
    "campo1","campo2","LOC","RUA","ANDAR","GPSSTRING","DATAHORA","NumInv",
    "fotoUrl","fotoUrl2","fotoUrl3","fotoUrl4","OBS","USUARIO"
  ];

  if (sh.getMaxColumns() < headers.length) {
    sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
  }

  const r1 = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  const needs = r1.every(v => String(v || "").trim() === "");
  if (needs) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else if (String(r1[13] || "").trim() === "") {
    // planilha antiga (A..M): cria só o cabeçalho da coluna N
    sh.getRange(1, 14).setValue("USUARIO");
  } else {
    // opcional: se quiser forçar nomes, descomente:
    // sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

// Converte os 14 valores de uma linha (A..N) no objeto usado pelo front
function rowToData_(values) {
  // A planilha pode converter "yyyy-MM-dd HH:mm:ss" em Date; devolve sempre texto
  const dh = values[6];
  const dataHora = (dh instanceof Date)
    ? Utilities.formatDate(dh, TZ, "yyyy-MM-dd HH:mm:ss")
    : (dh || "");

  return {
    campo1: values[0] || "",
    campo2: values[1] || "",
    loc:    values[2] || "",
    rua:    values[3] || "",
    andar:  values[4] || "",
    gps:    values[5] || "",
    dataHora,
    numInv: values[7] || "",
    fotoUrl:  values[8]  || "",
    fotoUrl2: values[9]  || "",
    fotoUrl3: values[10] || "",
    fotoUrl4: values[11] || "",
    obs:      values[12] || "",
    usuario:  values[13] || ""
  };
}

// Valida user/pass contra a propriedade USUARIOS ("nome:senha" por linha).
// Retorna o nome do usuário (minúsculo) ou "" se inválido. Sem USUARIOS => ninguém entra.
function auth_(user, pass) {
  const u = String(user || "").trim().toLowerCase();
  const s = String(pass || "");
  if (!u || !s) return "";

  const lista = PropertiesService.getScriptProperties().getProperty("USUARIOS") || "";
  const linhas = lista.split(/[\n,;]+/);
  for (let i = 0; i < linhas.length; i++) {
    const idx = linhas[i].indexOf(":");
    if (idx < 1) continue;
    const nome  = linhas[i].substring(0, idx).trim().toLowerCase();
    const senha = linhas[i].substring(idx + 1).trim();
    if (nome === u && senha === s) return nome;
  }
  return "";
}

// Compara códigos sem zeros à esquerda (a planilha pode guardar como número)
function normCodigo_(v) {
  const s = String(v == null ? "" : v).trim().replace(/^0+/, "");
  return s === "" ? "0" : s;
}

function extFromMime_(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  return "jpg";
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
