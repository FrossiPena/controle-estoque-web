// v1.0 - Backup diário das planilhas do Controle de Estoque (projeto próprio, separado dos scripts do app)
// Copia cada planilha para a pasta BACKUP_PASTA no Drive ("<nome> AAAA-MM-DD"), manda para a lixeira as cópias
// com mais de RETENCAO_DIAS dias e avisa por e-mail se algo falhar.
// Instalação: colar num projeto novo (script.google.com) da conta dona das planilhas, preencher os IDs,
//   rodar instalarGatilho() uma vez (autoriza o Drive/e-mail e cria o gatilho diário) e depois fazerBackup()
//   para testar. A cópia de uma planilha com script vinculado (Consolidado) leva junto uma cópia do script:
//   é só a cópia do código, sem implantação nem gatilho.

const SCRIPT_VERSION = "v1.0-backup";
const PLANILHAS = [
  { nome: "Inventário",  id: "1CheE1Vpy-hldpiSbl6EC79VI_8DMxDmJ74XW8jevzN8" },
  { nome: "Consolidado", id: "COLE_AQUI_O_ID_DA_PLANILHA_DO_CONSOLIDADO" },   // trecho da URL entre /d/ e /edit
  { nome: "RELAÇÃO",     id: "14uJ__SLFIYDiPx2NwcgKG0oLY6i_2Bn3gT5PG6qXR-g" },
];
const BACKUP_PASTA = "Backup Controle de Estoque";   // criada no Meu Drive se não existir
const RETENCAO_DIAS = 30;
const EMAIL_AVISO = "fernando.rossi@realguindastes.com";
const HORA_BACKUP = 3;                               // 3h da manhã (fuso do projeto)
const TZ = "America/Sao_Paulo";

function fazerBackup() {
  const erros = [];
  let pasta;
  try {
    pasta = pastaBackup_();
  } catch (err) {
    avisar_([`Pasta de backup: ${err}`]);
    return;
  }

  const hoje = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
  PLANILHAS.forEach(p => {
    try {
      const nomeCopia = `${p.nome} ${hoje}`;
      if (pasta.getFilesByName(nomeCopia).hasNext()) return;   // já feito hoje (rodou duas vezes)
      DriveApp.getFileById(p.id).makeCopy(nomeCopia, pasta);
    } catch (err) {
      erros.push(`${p.nome}: ${err}`);
    }
  });

  try {
    limparAntigos_(pasta);
  } catch (err) {
    erros.push(`Limpeza das cópias antigas: ${err}`);
  }

  if (erros.length) avisar_(erros);
}

// Cópias com mais de RETENCAO_DIAS dias vão para a lixeira (o Drive apaga de vez depois de 30 dias)
function limparAntigos_(pasta) {
  const limite = Date.now() - RETENCAO_DIAS * 24 * 60 * 60 * 1000;
  const prefixos = PLANILHAS.map(p => p.nome + " ");
  const arquivos = pasta.getFiles();
  while (arquivos.hasNext()) {
    const f = arquivos.next();
    const nosso = prefixos.some(px => f.getName().startsWith(px));
    if (nosso && f.getDateCreated().getTime() < limite) f.setTrashed(true);
  }
}

function pastaBackup_() {
  const it = DriveApp.getRootFolder().getFoldersByName(BACKUP_PASTA);
  return it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(BACKUP_PASTA);
}

function avisar_(erros) {
  MailApp.sendEmail(EMAIL_AVISO, "Backup Controle de Estoque: falha",
    `O backup de ${Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm")} teve problemas:\n\n` +
    erros.map(e => "- " + e).join("\n") +
    `\n\nPasta: ${BACKUP_PASTA} (Meu Drive). Script ${SCRIPT_VERSION}.`);
}

// Rodar uma vez: cria o gatilho diário (apaga gatilhos antigos de fazerBackup para não duplicar)
function instalarGatilho() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "fazerBackup")
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("fazerBackup").timeBased().everyDays(1).atHour(HORA_BACKUP).inTimezone(TZ).create();
}
