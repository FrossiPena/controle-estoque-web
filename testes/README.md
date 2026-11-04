# Testes

Os testes rodam sem o Google e sem o Supabase: os Apps Scripts são executados em Node com planilhas simuladas e as
chamadas ao Supabase (Auth e função `espelho`) são interceptadas.

## Preparar (uma vez)
```
npm install
npx playwright install chromium webkit
```

## Rodar
```
npm test                 # todos
npm run test:script      # só o script do Consolidado (não precisa do Playwright)
npm run test:converter   # conversor das planilhas para o Supabase (não precisa do Playwright)
npm run test:navegador   # app no navegador (Chromium headless)
npm run test:duplo       # alimentação dupla Google + Supabase (Chromium headless)
npm run test:foto        # redução de foto antes do envio (Chromium e WebKit/Safari)
```

## Arquivos
- `mock-consolidado.js`: carrega `apps-script/consolidado.gs` num contexto Node com `SpreadsheetApp`,
  `LockService` etc. simulados. A MachineCards e a aba AJUSTE de teste estão no próprio arquivo.
- `fixtures/relacao-mini.json`: recorte da RELAÇÃO (Validação, Gruas Lista, 280 EC-H 12 e 630 EC-H 40), sem preços
  nem nomes de pessoas. Formato: `{ "nome da aba": [[linha 1], [linha 2], …] }`, colunas a partir da A.
- `consolidado.test.js`: modos do script (compatíveis, ajuste com/sem outro desenho, inclusão, `verificar_peca`,
  `machinecards_por_gt`, compatíveis lotados).
- `navegador.test.js`: sobe um servidor local, intercepta `script.google.com` com o mock e percorre
  Cadastro → ajuste → Equipamento → Consultar Inventário (itens por inventário) → Acessórios (vigas).
- `duplo.test.js`: alimentação dupla. Registrar/deletar/foto/ajuste chegam ao `espelho` com a mesma linha do Google;
  Google recusou → nada vai ao Supabase; token vencido → novo login; Supabase fora do ar → app normal e falha no
  rodapé; usuário `consulta` não chama o Supabase.
- `converter.test.js`: monta um .xlsx (fixture da RELAÇÃO + Movimentacoes/MachineCards/AJUSTE) e confere os CSVs de
  `migracao/converter.mjs` (id = linha, data/hora com fuso, grupos e quantidades por lança, aba desconhecida avisada).
- `foto.test.js`: `reduzirFoto`/`uploadFotoParaLinha` no Chromium e no WebKit (Safari): foto 4032x3024 chega com
  1080 no lado menor, foto com rotação EXIF continua em pé, foto pequena vai como está.

## RELAÇÃO completa
Para testar com a planilha inteira, exporte as abas para JSON no mesmo formato, salve em `testes/dados/`
(fora do Git, ver `.gitignore`) e rode com `RELACAO_JSON=testes/dados/relacao.json npm test`.
