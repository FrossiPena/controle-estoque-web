# Controle de Estoque — notas para o Claude

App web estático (`index.html`, `app.js`, `style.css`) publicado pelo GitHub Pages a partir do `main`,
com dois Google Apps Scripts como backend (`apps-script/inventario.gs` e `apps-script/consolidado.gs`).
Textos, comentários e mensagens de commit em português.

## Como trabalhar com o usuário
- Antes de gerar planilhas ou outros arquivos (xlsx, exportações, arquivos para colar), perguntar se ele quer.
  Ele costuma ajustar as planilhas do Google manualmente.

## Versão — atualizar a cada modificação (sem o usuário pedir)
Em toda mudança no app, suba a versão (ex.: v5.8.2 → v5.8.3; funcionalidade nova → v5.9.0) e mantenha
os quatro lugares iguais:
1. `app.js`: `const APP_VERSION = "vX.Y.Z";` + linha de histórico no topo do arquivo
2. `index.html`: `<meta name="app-version" content="vX.Y.Z" />` e comentário da primeira linha
3. `index.html`: `style.css?v=X.Y.Z` e `app.js?v=X.Y.Z` (sem isso o celular usa arquivos antigos do cache)
4. `style.css`: comentário da primeira linha

O rodapé mostra a versão; se `index.html` e `app.js` divergirem, ele avisa para recarregar.

## Apps Scripts
- Mudou um `.gs`: suba `SCRIPT_VERSION` e lembre o usuário de colar o código no projeto certo e publicar
  em **Implantar → Gerenciar implantações → lápis → Versão: Nova versão** (não "Nova implantação",
  que muda a URL). Confira depois com `…/exec?mode=diag`.
- Implantações usadas pelo app: inventário `AKfycbxClcs2…`, consolidado `AKfycbxE5uwm…`.
- `apps-script/backup.gs`: projeto próprio (não é web app, sem implantação). Gatilho diário 3h copia Inventário,
  Consolidado e RELAÇÃO para a pasta "Backup Controle de Estoque" do Drive, lixeira após 30 dias, e-mail em falha.
  Mudou: só colar no projeto de backup (não há "Nova versão" a publicar).
- Toda chamada (exceto `diag`) exige `user`/`pass` validados contra a propriedade `USUARIOS`.
- Usuário `consulta` (login genérico, cadastrado no `USUARIOS` dos dois scripts): só leitura. Os scripts recusam
  (`semPermissao:true`, sem deslogar) `compat_inserir`, `gravar_ajuste` (Consolidado), `log_mov`, `clear_lin` e
  `upload_foto` (Inventário); o app (`ehUsuarioConsulta`) mostra só Consulta ítem e Equipamento, sem "+ Inserir compatível".
  Função nova que grave: incluir o modo em `MODOS_GRAVACAO` do script.
- Planilhas lidas pelo script do Consolidado: aba `MachineCards Consolidado` (própria) e RELAÇÃO DE PRODUTOS
  (`RELACAO_SHEET_ID`: `Gruas lista`, `Validação` e uma aba por modelo de grua).
- Aba de modelo da RELAÇÃO (cabeçalho na linha 2; linha 1 é do configurador, não mexer): B DESCRIÇÃO,
  C–F COMPATÍVEL 1..4, H CÓDIGO LBR, J COMPRIMENTO, K GT (vazio = vale para todas as unidades), L em diante
  comprimentos de lança ("75m", "36,7m"…; célula = quantidade). Linha sem código = título de grupo.
  As colunas são achadas pelo nome do cabeçalho: sem o título "COMPATÍVEL n"/"GT" na linha 2, o app não vê
  compatíveis/GT. F deixou de ser "Fator de uso" (decisão do usuário): as fórmulas antigas de peso total (I3)
  e R$/kg (AG3) que liam F não valem mais.
- Aba `AJUSTE` (planilha do Consolidado, criada pelo script na primeira gravação): registro de peças que
  substituíram um machine card de fábrica. Só se acrescentam linhas (nunca editar a MachineCards); o ajuste mais
  recente de cada ID de fábrica vale. Colunas: DATAHORA | USUARIO | GT | MODELO | POSICAO (CODIGO C) | DESCRICAO |
  CODIGO9 ANTIGO | ID ANTIGO | CODIGO9 NOVO | ID NOVO | ALERTA | OBS. Código 9 conhecido só em outro modelo
  exige "CONFIRMO" e fica marcado em ALERTA.
  Inclusão (peça adicional/opcional comprado) = linha sem CODIGO9/ID ANTIGO e ALERTA começando com "INCLUSÃO";
  ela entra na posição do GT e pode ser substituída depois por outro ajuste.
  Coluna M "CODIGO C NOVO" = desenho da peça nova (substituição de outro desenho → o Código C informado e
  gravado também como compatível da posição na RELAÇÃO; mesmo desenho/inclusão → o da posição).
- Compatíveis inseridos pelo app (Equipamento → "+ Inserir compatível"): o usuário digita código 9 ou Código C;
  o script converte pela MachineCards e grava sempre o Código C padronizado na 1ª coluna COMPATÍVEL vazia (C–F)
  da linha da peça (aba do modelo na RELAÇÃO), com nota de quem/quando. Código só de outro modelo exige CONFIRMO.
  Código que não está na MachineCards não entra pelo botão ("Necessário um novo cadastro de peça"): entra pelo
  Cadastro → ajuste, respondendo que a peça é de outro desenho compatível.

## Frontend
- Chamadas ao backend sempre via `apiGet`/`netFetch` (credenciais, "acesso negado" e sinal de comunicação).
- Dados vindos da planilha entram no DOM com `textContent`, não `innerHTML`.

## Mapa do código
Telas (`index.html`, `<section id="screen-…">`, trocadas por `showScreen(nome)`, que também para o leitor de QR):
- **consulta** (Consulta ítem): QR (`iniciarLeitor`/`pararLeitor`/`processarQRCode`) → `consultarDados` (descrição,
  Código C, patrimônio pelo Consolidado) → `consultarUltimoInventario` (seção 4: fotos, GPS → `abrirLocalizacaoUlt`).
- **cadastro**: `registrarMovimentacaoUI` → `log_mov` no Inventário; `carregarUltimoNumInv`; `verificarPecaCadastro`
  (peça fora da MachineCards → botão "Criar ajuste" → tela ajuste); fotos `substituirFotoLinhaUI`/`uploadFotoParaLinha`.
- **inventario** (Consultar Inventário): `listarInventario`, `buscaCompletaUI`, `consultarLinhaInventarioUI`,
  `deletarLinhaInventarioUI`.
- **equipamento**: grua → GT → comprimento de lança (`carregarGruasEq`, `onGruaEq`, `onGtEq`, `renderListaEq`);
  confronta com inventários (`carregarInventariosEq`, `inventariadoEq`); "+ Inserir compatível" = `abrirCompatEq`.
- **ajuste**: `abrirAjuste` → `onGtAjuste` → `renderPosicoesAjuste` → `escolherPosicaoAjuste` (IDs de fábrica /
  inclusão) → `renderCompatAjuste` (outro desenho?) → `atualizarBotaoAjuste` → `gravarAjuste`. Estado em `AJ`.
- **debug**: `logDebug`, `copiarDebug`. Login: `fazerLogin`/`mostrarLogin`, credenciais em `localStorage.ce_auth`.
Estado da tela Equipamento em `EQ` (caches `lancasPorGrua`, `mcPorGt`…); helpers `eqGetJson`, `eqChaveC`, `eqNorm`, `eqEl`.

Modos do `doGet`:
- `inventario.gs`: diag, login, diag_drive, log_mov, get_lin, ultimo_inv, lista_inv, inv_resumo, ultimo_numinv,
  clear_lin; `doPost` upload_foto (slot 1..4 → colunas I..L).
- `consolidado.gs`: diag, login, gruas_lista, gts_por_grua, gts_todos, lancas_grua (`todas=1` = todas as peças),
  h_por_l, gruas (diretos pela MachineCards + `compat` pela linha da RELAÇÃO + `ajustes`), exata (aplica AJUSTE), patrimonio_por_h (aplica AJUSTE), i_por_h, desc_pt, machinecards_por_gt (já aplica AJUSTE/inclusões),
  compat_previa, compat_inserir, verificar_peca, gravar_ajuste (`tipo=inclusao`; `compat=1` + `codigo_c_novo`).

## Testes (rodar antes de publicar)
Ver `testes/README.md`. `node testes/consolidado.test.js` (script do Consolidado simulado em Node) e
`node testes/navegador.test.js` (Playwright, Apps Scripts interceptados). Ao mudar um fluxo, acrescente o caso.
