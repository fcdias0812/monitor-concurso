'use strict';

const db = require('./db');
const { fetchEditais } = require('./scraper');
const { downloadAndExtract } = require('./pdf');
const { checkEdital } = require('./matcher');

const config = require('../config.json');

const now = () => new Date().toISOString();

const insertEdital = db.prepare(`
  INSERT OR IGNORE INTO editais (id, numero, titulo, url, publicado_em, ano, criado_em)
  VALUES (@id, @numero, @titulo, @url, @publicado_em, @ano, @criado_em)
`);

const getUnprocessed = db.prepare(
  `SELECT * FROM editais WHERE processado = 0 ORDER BY id ASC`
);

const updateAnalysis = db.prepare(`
  UPDATE editais SET
    processado = 1, erro = NULL,
    name_found = @name_found, position_found = @position_found,
    matched_name = @matched_name, name_context = @name_context,
    candidatos = @candidatos, texto = @texto, analisado_em = @analisado_em
  WHERE id = @id
`);

const setErro = db.prepare(`UPDATE editais SET erro = @erro WHERE id = @id`);

const startRun = db.prepare(
  `INSERT INTO runs (iniciado_em) VALUES (@iniciado_em)`
);
const endRun = db.prepare(`
  UPDATE runs SET terminado_em = @terminado_em, novos = @novos,
                  total = @total, mensagem = @mensagem
  WHERE id = @id
`);

let running = false;

/**
 * Processa um único edital: baixa o PDF, extrai o texto e roda o matcher.
 */
async function processOne(edital) {
  try {
    const texto = await downloadAndExtract(edital.id, edital.url);
    const r = checkEdital(texto, config.target);
    updateAnalysis.run({
      id: edital.id,
      name_found: r.nameFound ? 1 : 0,
      position_found: r.positionFound ? 1 : 0,
      matched_name: r.matchedName,
      name_context: r.nameContext,
      candidatos: JSON.stringify(r.candidates),
      texto,
      analisado_em: now(),
    });
    return r;
  } catch (e) {
    setErro.run({ id: edital.id, erro: String(e.message || e) });
    return null;
  }
}

/**
 * Ciclo completo: busca a lista no portal, cadastra novos editais e
 * analisa todos os que ainda não foram processados.
 *
 * @param {(msg:string)=>void} [log]
 * @returns {Promise<{novos:number,total:number,processados:number,erros:number}>}
 */
async function runCheck(log = () => {}) {
  if (running) {
    log('Verificação já em andamento — ignorando.');
    return { novos: 0, total: 0, processados: 0, erros: 0, skipped: true };
  }
  running = true;
  const run = startRun.run({ iniciado_em: now() });
  const runId = run.lastInsertRowid;

  let novos = 0;
  let processados = 0;
  let erros = 0;
  let mensagem = '';

  try {
    log('Buscando lista de editais no portal...');
    let editais = await fetchEditais(config);
    log(`Portal retornou ${editais.length} editais.`);

    // filtra por ano (config.years vazio = todos os anos)
    const years = Array.isArray(config.years) ? config.years.map(String) : [];
    if (years.length > 0) {
      editais = editais.filter((e) => e.ano && years.includes(String(e.ano)));
      log(`Filtrando anos [${years.join(', ')}] -> ${editais.length} editais.`);
    }

    // cadastra novos
    for (const e of editais) {
      const info = insertEdital.run({ ...e, criado_em: now() });
      if (info.changes > 0) novos++;
    }
    if (novos > 0) log(`${novos} edital(is) novo(s) cadastrado(s).`);

    // analisa pendentes (inclui os recém-cadastrados e qualquer erro anterior)
    const pendentes = getUnprocessed.all();
    log(`${pendentes.length} edital(is) pendente(s) de análise.`);
    for (const edital of pendentes) {
      const r = await processOne(edital);
      if (r === null) {
        erros++;
      } else {
        processados++;
        if (r.nameFound || r.positionFound) {
          log(
            `>>> ALERTA: ${edital.titulo} — ` +
              `${r.nameFound ? 'NOME encontrado ' : ''}` +
              `${r.positionFound ? `POSIÇÃO ${config.target.position} -> ${r.matchedName}` : ''}`
          );
        }
      }
    }

    const total = db.prepare('SELECT COUNT(*) c FROM editais').get().c;
    mensagem = `OK — novos: ${novos}, analisados: ${processados}, erros: ${erros}`;
    endRun.run({
      id: runId,
      terminado_em: now(),
      novos,
      total,
      mensagem,
    });
    log(mensagem);
    return { novos, total, processados, erros };
  } catch (e) {
    mensagem = `FALHA: ${e.message || e}`;
    endRun.run({
      id: runId,
      terminado_em: now(),
      novos,
      total: 0,
      mensagem,
    });
    log(mensagem);
    throw e;
  } finally {
    running = false;
  }
}

function isRunning() {
  return running;
}

module.exports = { runCheck, processOne, isRunning };
