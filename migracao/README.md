# Migração para o Supabase — fase 1 (alimentação dupla)

O app continua usando os Apps Scripts como hoje. Quando uma gravação dá certo no Google, o app manda o mesmo registro
para a função `espelho` do Supabase, com o **mesmo número de linha**. Se o Supabase falhar, o app segue normal: a
falha aparece no Debug e no rodapé ("Supabase: N falhas"). Fotos continuam no Drive (o Supabase guarda só o link).
Liga/desliga: `ESPELHO_SUPABASE` no topo do `app.js`.

Projetos: `estoque-teste` (testes) e `estoque` (dados reais). Trocar de projeto = trocar `SUPABASE_URL` e
`SUPABASE_CHAVE` (publishable) no `app.js`.

## Ordem para publicar
Não publicar a v5.19.0 no `main` antes de 1–4 estarem prontos no projeto que o app usa (senão toda gravação falha no
espelho — o app funciona, mas o rodapé acusa falhas). Alternativa: publicar com `ESPELHO_SUPABASE = false`.
Fazer a carga (4) e publicar **no mesmo dia**: linha registrada entre o download do .xlsx e a publicação não existe no
Supabase, e foto/deletar dessa linha depois vira falha no `espelho_log`. Para reconciliar (a planilha é a referência
nesta fase): `truncate` + novo .xlsx num horário tranquilo.
Senha trocada no `USUARIOS` do Apps Script precisa ser trocada também no Supabase Auth.

## 1. Banco (uma vez por projeto)
SQL Editor → colar e rodar `supabase/migrations/20261103120000_estoque_inicial.sql`.
Cria o schema `estoque` (não exposto na API; só a função acessa), as tabelas e `estoque.ajustar_sequencias()`.
Não incluir `estoque` em Settings → Data API → Exposed schemas.

## 2. Função `espelho`
Edge Functions → Deploy (ou `supabase functions deploy espelho`) com `supabase/functions/espelho/index.ts` e
`deno.json`, **Verify JWT desligado** (a função valida o token ela mesma e precisa responder ao CORS).
Não há segredo para cadastrar: `SUPABASE_DB_URL` e as chaves já vêm no ambiente da função.
Conferir: `https://<projeto>.supabase.co/functions/v1/espelho?modo=diag` → `{"ok":true,"version":"espelho-v1.0",…}`.

## 3. Usuários
Authentication → Sign In / Providers: desligar "Allow new users to sign up".
Authentication → Users → Add user → Create new user, para cada nome do `USUARIOS` dos Apps Scripts:
- e-mail `nome@estoque.realguindastes.com` (ex.: `fernando@estoque.realguindastes.com`), **mesma senha** do Apps Script,
  "Auto Confirm User" marcado.
- O usuário `consulta` não precisa ser criado (ele não grava).
Se o painel recusar o domínio, trocar `SUPABASE_EMAIL_DOMINIO` no `app.js` por outro e criar com ele.

## 4. Carga inicial (planilhas → CSV)
1. No Google, baixar as três planilhas: Arquivo → Fazer download → Microsoft Excel (.xlsx)
   (Inventário, Consolidado e RELAÇÃO DE PRODUTOS).
2. `node migracao/converter.mjs Inventario.xlsx Consolidado.xlsx RELACAO.xlsx`
   → gera `migracao/saida/*.csv` (fora do Git) e lista as abas que não reconheceu.
3. Table Editor → schema `estoque` → cada tabela → Insert → Import data from CSV, **nesta ordem**:
   `movimentacoes`, `machinecards`, `ajustes`, `gruas_lista`, `validacao`, `relacao_abas`, `relacao_itens`.
4. SQL Editor: `select estoque.ajustar_sequencias();`
5. Conferir as contagens com o que o conversor mostrou:
   `select (select count(*) from estoque.movimentacoes) mov, (select count(*) from estoque.machinecards) mc, …`

Refazer a carga (por exemplo depois de editar a RELAÇÃO à mão): `truncate` das tabelas e repetir 2–4.
Durante a fase dupla, as linhas novas chegam pelo espelho; a carga só cobre o que já existia.

## 5. Acompanhar
- Falhas: `select * from estoque.espelho_log where not ok order by id desc;` (o `detalhe` traz o pedido completo).
- Tudo de um usuário: `select * from estoque.espelho_log where usuario = 'fernando' order by id desc limit 50;`
- `…/espelho?modo=diag` mostra `falhas_24h`.

## Modos da função `espelho` (POST JSON, `Authorization: Bearer <token do Auth>`)
| modo | quando o app chama | grava |
|---|---|---|
| `diag` (GET, sem login) | — | nada; versão e falhas das últimas 24 h |
| `login` | — | nada; devolve usuário e papel |
| `log_mov` | Registrar deu certo | `movimentacoes` (id = linha do Google, data/hora do Google) |
| `foto_link` | foto enviada ao Drive | `movimentacoes.fotoN` = link |
| `clear_lin` | Deletar linha | `apagado_em`/`apagado_por` (a linha não some) |
| `ajuste` | ajuste gravado | `ajustes` (id = linha da AJUSTE) + compatível na `relacao_itens` |
| `compat` | + Inserir compatível | `relacao_itens.compatN` + `relacao_compat_log` |
