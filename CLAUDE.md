# Controle de Estoque — notas para o Claude

App web estático (`index.html`, `app.js`, `style.css`) publicado pelo GitHub Pages a partir do `main`,
com dois Google Apps Scripts como backend (`apps-script/inventario.gs` e `apps-script/consolidado.gs`).
Textos, comentários e mensagens de commit em português.

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
- Toda chamada (exceto `diag`) exige `user`/`pass` validados contra a propriedade `USUARIOS`.

## Frontend
- Chamadas ao backend sempre via `apiGet`/`netFetch` (credenciais, "acesso negado" e sinal de comunicação).
- Dados vindos da planilha entram no DOM com `textContent`, não `innerHTML`.
