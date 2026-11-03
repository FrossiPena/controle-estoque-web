// espelho v1.0 - Fase 1 da migração (alimentação dupla): o app grava no Apps Script e, se deu certo,
// manda o mesmo registro para cá. Nada é validado de novo (o Google já validou): só grava no schema "estoque".
// POST JSON { modo, ...dados } com Authorization: Bearer <token do Supabase Auth>. GET ?modo=diag sem login.
// Modos: diag, login, log_mov, foto_link, clear_lin, ajuste, compat.
// Usuário = parte do e-mail antes do @ (fernando@… -> fernando); "consulta" (ou app_metadata.papel = "consulta")
// não grava, como nos Apps Scripts.
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const VERSION = "espelho-v1.0";
const USUARIO_CONSULTA = "consulta";
const MODOS_GRAVACAO = ["log_mov", "foto_link", "clear_lin", "ajuste", "compat"];
const TZ = "America/Sao_Paulo";

// GitHub Pages + servidor local dos testes
const ORIGENS = [/^https:\/\/frossipena\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
const chavePublica = (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}").default; } catch { return ""; }
})() || Deno.env.get("SUPABASE_ANON_KEY") || "";
const auth = createClient(Deno.env.get("SUPABASE_URL")!, chavePublica, { auth: { persistSession: false } });

function cors(req: Request): Record<string, string> {
  const o = req.headers.get("Origin") || "";
  return ORIGENS.some(r => r.test(o)) ? {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  } : {};
}

function json(req: Request, obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...cors(req), "Content-Type": "application/json; charset=utf-8" },
  });
}

const txt = (v: unknown) => String(v ?? "").trim();

// Código 9 / ID como o consolidado.gs grava na AJUSTE (normCod_)
const normCod = (v: unknown) => txt(v).replace(/\.0+$/, "").replace(/^0+(?=.)/, "");

// Nome de aba/modelo/GT sem acento, espaço extra e maiúsculas (normNome_)
const normNome = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/\s+/g, " ").trim().toLowerCase();

const chaveC = (v: unknown) => (String(v ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "").match(/^C\d{12}/) || [""])[0];

// "yyyy-MM-dd HH:mm:ss" do Apps Script (horário de São Paulo); outro formato = null (o SQL usa now())
const dataHora = (v: unknown) => {
  const s = txt(v);
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s) ? s : null;
};

function linha(v: unknown): number {
  const n = parseInt(txt(v), 10);
  if (!n || n < 2) throw new Error("linha inválida (>=2)");
  return n;
}

// Aba da RELAÇÃO pelo nome do modelo/grua (o Apps Script compara com normNome_)
async function abaDoModelo(tx: postgres.TransactionSql, modelo: string) {
  const abas = await tx`select aba, colunas_compat from estoque.relacao_abas`;
  return abas.find(a => normNome(a.aba) === normNome(modelo)) || null;
}

// Grava o Código C na coluna COMPATÍVEL n: pela coluna da planilha (se veio), senão na 1ª vazia
async function gravarCompat(tx: postgres.TransactionSql, usuario: string, modelo: string, lin: number,
                            codigoC: string, coluna: unknown, nota: string) {
  const a = await abaDoModelo(tx, modelo);
  if (!a) throw new Error(`aba '${modelo}' não está na relacao_abas`);
  const [item] = await tx`select compat1, compat2, compat3, compat4 from estoque.relacao_itens
                          where aba = ${a.aba} and linha_planilha = ${lin} for update`;
  if (!item) throw new Error(`linha ${lin} da aba '${a.aba}' não está na relacao_itens`);
  const cols = ["compat1", "compat2", "compat3", "compat4"];
  if (cols.some(c => chaveC(item[c]) === chaveC(codigoC))) return `${codigoC} já estava em ${a.aba} linha ${lin}`;
  const pos = (a.colunas_compat || []).indexOf(Number(coluna));
  const col = pos >= 0 && pos < 4 ? cols[pos] : cols.find(c => !txt(item[c]));
  if (!col) throw new Error(`linha ${lin} da aba '${a.aba}': as 4 colunas de compatíveis estão preenchidas`);
  if (txt(item[col])) throw new Error(`linha ${lin} da aba '${a.aba}': ${col} já tem ${item[col]}`);
  await tx`update estoque.relacao_itens set ${tx({ [col]: codigoC })} where aba = ${a.aba} and linha_planilha = ${lin}`;
  await tx`insert into estoque.relacao_compat_log (usuario, aba, linha_planilha, coluna, codigo_c, nota)
           values (${usuario}, ${a.aba}, ${lin}, ${col}, ${codigoC}, ${nota})`;
  return `${codigoC} em ${a.aba} linha ${lin} (${col})`;
}

// Cada modo devolve o texto que vai para o espelho_log
const MODOS: Record<string, (tx: postgres.TransactionSql, p: Record<string, unknown>, usuario: string) => Promise<string>> = {
  async log_mov(tx, p, usuario) {
    const id = linha(p.row);
    const d = {
      campo1: txt(p.campo1), campo2: txt(p.campo2), loc: txt(p.loc), rua: txt(p.rua), andar: txt(p.andar),
      gps: txt(p.gps), num_inv: txt(p.numInv), obs: txt(p.obs), usuario,
    };
    await tx`insert into estoque.movimentacoes ${tx({ id, ...d })}
             on conflict (id) do update set ${tx(d)}, apagado_em = null, apagado_por = null`;
    await tx`update estoque.movimentacoes
             set datahora = coalesce((${dataHora(p.dataHora)}::text)::timestamp at time zone ${TZ}, now())
             where id = ${id}`;
    return `linha ${id}`;
  },

  async foto_link(tx, p) {
    const id = linha(p.row), slot = Number(p.slot);
    if (![1, 2, 3, 4].includes(slot)) throw new Error("slot inválido (1..4)");
    const url = txt(p.fotoUrl);
    if (!url) throw new Error("fotoUrl vazio");
    const r = await tx`update estoque.movimentacoes set ${tx({ ["foto" + slot]: url })} where id = ${id}`;
    if (!r.count) throw new Error(`linha ${id} não existe no Supabase`);
    return `linha ${id} foto ${slot}`;
  },

  async clear_lin(tx, p, usuario) {
    const id = linha(p.row);
    const r = await tx`update estoque.movimentacoes set apagado_em = now(), apagado_por = ${usuario}
                       where id = ${id} and apagado_em is null`;
    if (!r.count) {
      const [ex] = await tx`select apagado_em from estoque.movimentacoes where id = ${id}`;
      if (!ex) throw new Error(`linha ${id} não existe no Supabase`);
      return `linha ${id} já estava apagada`;
    }
    return `linha ${id} apagada`;
  },

  async ajuste(tx, p, usuario) {
    const id = linha(p.linha);
    const d = {
      usuario, gt: txt(p.gt), modelo: txt(p.modelo), posicao: txt(p.posicao), descricao: txt(p.descricao),
      c9_antigo: normCod(p.c9_antigo), id_antigo: normCod(p.id_antigo), c9_novo: normCod(p.c9_novo),
      id_novo: normCod(p.id_novo), alerta: txt(p.alerta), obs: txt(p.obs), codigo_c_novo: txt(p.codigo_c_novo),
    };
    if (!d.gt || !d.c9_novo || !d.id_novo) throw new Error("faltam GT/código 9/ID novo");
    await tx`insert into estoque.ajustes ${tx({ id, ...d })} on conflict (id) do update set ${tx(d)}`;
    await tx`update estoque.ajustes set datahora = now() where id = ${id} and datahora is null`;
    let msg = `AJUSTE linha ${id}`;
    const c = (p.compat || null) as Record<string, unknown> | null;
    if (c && txt(c.codigoC)) {
      msg += "; compatível " + await gravarCompat(tx, usuario, d.modelo, linha(c.linha), txt(c.codigoC), null,
        `via ajuste (${d.gt}: código 9 ${d.c9_novo}, ID ${d.id_novo} no lugar do ID ${d.id_antigo}; AJUSTE linha ${id})`);
    }
    return msg;
  },

  async compat(tx, p, usuario) {
    const codigoC = txt(p.codigoC);
    if (!codigoC) throw new Error("codigoC vazio");
    return await gravarCompat(tx, usuario, txt(p.grua), linha(p.linha), codigoC, p.coluna,
      `pelo Equipamento (${txt(p.gt)}; digitado: ${txt(p.entrada)})` + (txt(p.alerta) ? `. ALERTA: ${txt(p.alerta)}` : ""));
  },
};

async function registrarLog(usuario: string, modo: string, ok: boolean, ref: string, detalhe: string) {
  try {
    await sql`insert into estoque.espelho_log (usuario, modo, ok, ref, detalhe)
              values (${usuario}, ${modo}, ${ok}, ${ref}, ${detalhe.slice(0, 2000)})`;
  } catch (e) { console.error("espelho_log:", e); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });

  let p: Record<string, unknown> = {};
  if (req.method === "POST") {
    try { p = await req.json(); } catch { return json(req, { ok: false, version: VERSION, error: "JSON inválido" }, 400); }
  } else {
    p = Object.fromEntries(new URL(req.url).searchParams);
  }
  const modo = txt(p.modo);

  if (modo === "diag") {
    const [r] = await sql`select count(*)::int as falhas_24h from estoque.espelho_log
                          where not ok and criado_em > now() - interval '24 hours'`;
    return json(req, { ok: true, version: VERSION, mode: "diag", falhas_24h: r.falhas_24h });
  }

  // Login: token do Supabase Auth (o app entra com o mesmo usuário/senha do Apps Script)
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data, error } = token ? await auth.auth.getUser(token) : { data: null, error: true };
  const user = data?.user;
  if (error || !user) return json(req, { ok: false, auth: false, version: VERSION, error: "acesso negado" });
  const usuario = String(user.email || "").split("@")[0].toLowerCase();
  const papel = txt(user.app_metadata?.papel) || (usuario === USUARIO_CONSULTA ? "consulta" : "normal");

  if (modo === "login") return json(req, { ok: true, version: VERSION, user: usuario, papel });
  if (!MODOS[modo]) return json(req, { ok: false, version: VERSION, error: "modo inválido ou ausente" });
  if (papel === "consulta" && MODOS_GRAVACAO.includes(modo)) {
    return json(req, { ok: false, semPermissao: true, version: VERSION, error: "usuário de consulta não pode gravar" });
  }

  const ref = txt(p.row || p.linha);
  try {
    const detalhe = await sql.begin(tx => MODOS[modo](tx, p, usuario));
    await registrarLog(usuario, modo, true, ref, detalhe);
    return json(req, { ok: true, version: VERSION, modo, detalhe });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    await registrarLog(usuario, modo, false, ref, msg + " | " + JSON.stringify(p));
    return json(req, { ok: false, version: VERSION, modo, error: msg });
  }
});
