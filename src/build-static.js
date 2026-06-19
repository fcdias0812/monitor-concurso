'use strict';

/**
 * Build do site estático para o GitHub Pages.
 * 1. Roda a verificação (scrape + análise dos editais novos).
 * 2. Exporta data/editais -> docs/data.json (lido pelo painel estático).
 * 3. Copia o painel public/index.html -> docs/index.html.
 *
 * Usado pelo GitHub Actions (de hora em hora) e também pode rodar local:
 *   node src/build-static.js
 */

const fs = require('fs');
const path = require('path');

const db = require('./db');
const config = require('../config.json');
const { runCheck } = require('./monitor');
const { notifyNewMatches } = require('./notify');

const DOCS = path.join(__dirname, '..', 'docs');
const log = (m) => console.log(`[build] ${m}`);

(async () => {
  fs.mkdirSync(DOCS, { recursive: true });

  // 1. atualiza o banco
  await runCheck((m) => console.log(`[check] ${m}`));

  // 1b. avisa (WhatsApp/e-mail) se houver match novo
  await notifyNewMatches();

  // 2. monta o payload
  const editais = db
    .prepare(
      `SELECT id, numero, titulo, url, publicado_em, ano, processado, erro,
              name_found, position_found, matched_name, name_context, candidatos
       FROM editais ORDER BY id DESC`
    )
    .all()
    .map((r) => {
      let candidatos = [];
      try { candidatos = JSON.parse(r.candidatos || '[]'); } catch (_) {}
      return {
        ...r,
        name_found: !!r.name_found,
        position_found: !!r.position_found,
        candidatos,
      };
    });

  const stats = {
    total: editais.length,
    analisados: editais.filter((e) => e.processado).length,
    comErro: editais.filter((e) => e.erro).length,
    matches: editais.filter((e) => e.name_found || e.position_found).length,
  };
  const ultimaRun = db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 1').get();
  const historico = db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 100').all();

  const payload = {
    geradoEm: new Date().toISOString(),
    target: config.target,
    years: config.years,
    cron: config.checkCron,
    stats,
    ultimaRun,
    historico,
    editais,
  };

  fs.writeFileSync(path.join(DOCS, 'data.json'), JSON.stringify(payload));
  log(`data.json escrito (${editais.length} editais, ${stats.matches} match(es)).`);

  // 3. copia o painel
  fs.copyFileSync(
    path.join(__dirname, '..', 'public', 'index.html'),
    path.join(DOCS, 'index.html')
  );
  fs.writeFileSync(path.join(DOCS, '.nojekyll'), ''); // Pages não processa com Jekyll
  log('index.html copiado para docs/.');

  // garante que o arquivo .db fique consistente para commit (sai do modo WAL)
  try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch (_) {}

  log('Build concluído.');
  process.exit(0);
})().catch((e) => {
  console.error('[build] FALHOU:', e);
  process.exit(1);
});
