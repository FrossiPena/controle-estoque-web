# Testes

Os testes rodam sem o Google: os Apps Scripts são executados em Node com planilhas simuladas.

## Preparar (uma vez)
```
npm install
npx playwright install chromium
```

## Rodar
```
npm test                 # os dois
npm run test:script      # só o script do Consolidado (não precisa do Playwright)
npm run test:navegador   # app no navegador (Chromium headless)
```

## Arquivos
- `mock-consolidado.js`: carrega `apps-script/consolidado.gs` num contexto Node com `SpreadsheetApp`,
  `LockService` etc. simulados. A MachineCards e a aba AJUSTE de teste estão no próprio arquivo.
- `fixtures/relacao-mini.json`: recorte da RELAÇÃO (Validação, Gruas Lista, 280 EC-H 12 e 630 EC-H 40), sem preços
  nem nomes de pessoas. Formato: `{ "nome da aba": [[linha 1], [linha 2], …] }`, colunas a partir da A.
- `consolidado.test.js`: modos do script (compatíveis, ajuste com/sem outro desenho, inclusão, `verificar_peca`,
  `machinecards_por_gt`, compatíveis lotados).
- `navegador.test.js`: sobe um servidor local, intercepta `script.google.com` com o mock e percorre
  Cadastro → ajuste → Equipamento.

## RELAÇÃO completa
Para testar com a planilha inteira, exporte as abas para JSON no mesmo formato, salve em `testes/dados/`
(fora do Git, ver `.gitignore`) e rode com `RELACAO_JSON=testes/dados/relacao.json npm test`.
