// Redução de foto antes do envio, no Chromium e no WebKit (motor do Safari do iPhone):
//   node testes/foto.test.js
// Gera fotos de câmera no próprio navegador (4032x3024, deitada com EXIF de rotação, pequena) e confere
// o que uploadFotoParaLinha manda ao Inventário.
const assert = require("assert");
const http = require("http"), fs = require("fs"), path = require("path");
const playwright = require("playwright");

const RAIZ = path.join(__dirname, "..");
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
const servidor = http.createServer((req, res) => {
  const arq = path.join(RAIZ, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TIPOS[path.extname(arq)] || "application/octet-stream" });
  fs.createReadStream(arq).pipe(res);
});

// Roda na página: cria um JPEG w x h com ruído (pesado como foto de câmera); orientacao = valor EXIF (6 = girar 90°)
async function enviarFotoTeste({ w, h, orientacao }) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#c33"); g.addColorStop(1, "#33c");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = `hsl(${i % 360},70%,50%)`;
    ctx.fillRect((i * 7919) % w, (i * 104729) % h, 40, 40);
  }
  let bytes = new Uint8Array(await (await new Promise(r => c.toBlob(r, "image/jpeg", 0.98))).arrayBuffer());
  if (orientacao) {   // APP1 Exif com só a tag Orientation, logo depois do FFD8
    const app1 = [0xFF, 0xE1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 0x2A, 0, 8, 0, 0, 0,
      1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, orientacao, 0, 0, 0, 0, 0, 0, 0];
    const nb = new Uint8Array(bytes.length + app1.length);
    nb.set(bytes.subarray(0, 2)); nb.set(app1, 2); nb.set(bytes.subarray(2), 2 + app1.length);
    bytes = nb;
  }
  const file = new File([bytes], "IMG_0001.JPG", { type: "image/jpeg" });

  let enviado = null;
  const fetchOrig = window.fetch;
  window.fetch = async (url, opt) => {
    enviado = JSON.parse(opt.body);
    return new Response(JSON.stringify({ ok: true, row: 5, slot: 1, fotoUrl: "x" }));
  };
  try { await uploadFotoParaLinha(5, 1, file); } finally { window.fetch = fetchOrig; }

  const img = new Image();
  img.src = "data:" + enviado.mime + ";base64," + enviado.base64;
  await img.decode();
  return { original: file.size, enviado: atob(enviado.base64).length, mime: enviado.mime,
    w: img.naturalWidth, h: img.naturalHeight };
}

(async () => {
  await new Promise(r => servidor.listen(0, r));
  const url = `http://localhost:${servidor.address().port}/index.html`;
  try {
    for (const nome of ["chromium", "webkit"]) {
      const b = await playwright[nome].launch();
      try {
        const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
        await ctx.addInitScript(() => localStorage.setItem("ce_auth", JSON.stringify({ user: "real", pass: "x" })));
        await ctx.route("https://unpkg.com/**", r => r.fulfill({ body: "", contentType: "text/javascript" }));
        await ctx.route("https://script.google.com/**", r => r.fulfill({ body: '{"ok":true}', contentType: "application/json" }));
        const page = await ctx.newPage();
        const erros = [];
        page.on("pageerror", e => erros.push(e.message));
        await page.goto(url);

        const deitada = await page.evaluate(enviarFotoTeste, { w: 4032, h: 3024 });
        assert.deepStrictEqual([deitada.w, deitada.h], [1440, 1080], JSON.stringify(deitada));
        assert.strictEqual(deitada.mime, "image/jpeg");
        assert.ok(deitada.enviado < deitada.original / 3, JSON.stringify(deitada));
        console.log(`ok - ${nome}: 4032x3024 → 1440x1080 (${deitada.original} → ${deitada.enviado} bytes)`);

        const iphone = await page.evaluate(enviarFotoTeste, { w: 4032, h: 3024, orientacao: 6 });
        assert.deepStrictEqual([iphone.w, iphone.h], [1080, 1440], JSON.stringify(iphone));
        console.log(`ok - ${nome}: foto em pé (EXIF girado) continua em pé: 1080x1440`);

        const pequena = await page.evaluate(enviarFotoTeste, { w: 1280, h: 960 });
        assert.deepStrictEqual([pequena.w, pequena.h], [1280, 960]);
        assert.strictEqual(pequena.enviado, pequena.original);
        console.log(`ok - ${nome}: foto já menor que Full HD vai como está`);

        assert.deepStrictEqual(erros, [], "erros de JavaScript na página");
      } finally {
        await b.close();
      }
    }
    console.log("\nfoto OK");
  } finally {
    servidor.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
