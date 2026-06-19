'use strict';

const path = require('path');
const express = require('express');
const cron = require('node-cron');

const db = require('./db');
const config = require('../config.json');
const { runCheck, isRunning } = require('./monitor');
const { notifyNewMatches } = require('./notify');

const app = express();

// buffer de log em memória para o painel acompanhar a última execução
const logBuffer = [];
function pushLog(msg) {
  const line = `[${new Date().toLocaleString('pt-BR')}] ${msg}`;
  logBuffer.push(line);
  if (logBuffer.length > 200) logBuffer.shift();
  console.log(line);
}

// roda a verificação e, em seguida, avisa por WhatsApp/e-mail se houver match novo
function checkAndNotify() {
  return runCheck(pushLog)
    .then(() => notifyNewMatches(pushLog))
    .catch((e) => pushLog(`Erro na verificação: ${e.message}`));
}

app.use(express.static(path.join(__dirname, '..', 'public')));

// ---- API ----

app.get('/api/status', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) c FROM editais').get().c;
  const analisados = db
    .prepare('SELECT COUNT(*) c FROM editais WHERE processado = 1')
    .get().c;
  const comErro = db
    .prepare('SELECT COUNT(*) c FROM editais WHERE erro IS NOT NULL')
    .get().c;
  const matches = db
    .prepare(
      'SELECT COUNT(*) c FROM editais WHERE name_found = 1 OR position_found = 1'
    )
    .get().c;
  const ultimaRun = db
    .prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 1')
    .get();

  res.json({
    target: config.target,
    cron: config.checkCron,
    total,
    analisados,
    comErro,
    matches,
    running: isRunning(),
    ultimaRun,
    log: logBuffer.slice(-50),
  });
});

app.get('/api/runs', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 100')
    .all();
  res.json(rows);
});

app.get('/api/editais', (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, numero, titulo, url, publicado_em, ano, processado, erro,
              name_found, position_found, matched_name, name_context, candidatos,
              criado_em, analisado_em
       FROM editais
       ORDER BY id DESC`
    )
    .all();
  for (const r of rows) {
    try { r.candidatos = JSON.parse(r.candidatos || '[]'); } catch (_) { r.candidatos = []; }
  }
  res.json(rows);
});

app.get('/api/editais/:id', (req, res) => {
  const row = db
    .prepare('SELECT * FROM editais WHERE id = ?')
    .get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'não encontrado' });
  let candidatos = [];
  try {
    candidatos = JSON.parse(row.candidatos || '[]');
  } catch (_) {}
  res.json({ ...row, candidatos });
});

app.post('/api/check', async (req, res) => {
  if (isRunning()) {
    return res.json({ started: false, message: 'Verificação já em andamento.' });
  }
  res.json({ started: true });
  checkAndNotify();
});

// ---- start ----

const port = config.port || 3000;
app.listen(port, () => {
  pushLog(`Painel rodando em http://localhost:${port}`);
  pushLog(
    `Alvo -> nome: "${config.target.name}" | posição: ${config.target.position}`
  );

  // verificação inicial (revisa todos os já cadastrados / novos)
  checkAndNotify();

  // agenda verificação periódica (de hora em hora por padrão)
  if (cron.validate(config.checkCron)) {
    cron.schedule(config.checkCron, () => {
      pushLog('Disparo agendado: verificando novos editais...');
      checkAndNotify();
    });
    pushLog(`Agendamento ativo (cron: ${config.checkCron}).`);
  } else {
    pushLog(`Cron inválido em config.json: "${config.checkCron}"`);
  }
});
