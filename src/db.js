'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'editais.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS editais (
    id            INTEGER PRIMARY KEY,      -- id do download no portal (ex.: 72686)
    numero        TEXT,                     -- ex.: "051/2026"
    titulo        TEXT,                     -- ex.: "Edital N.° 051/2026"
    url           TEXT NOT NULL,            -- url absoluta do PDF
    publicado_em  TEXT,                     -- data exibida no portal (dd/mm/aaaa)
    ano           TEXT,

    processado    INTEGER NOT NULL DEFAULT 0,  -- 1 = PDF baixado e analisado
    erro          TEXT,                        -- mensagem caso falhe o download/parse

    name_found      INTEGER DEFAULT 0,
    position_found  INTEGER DEFAULT 0,
    matched_name    TEXT,                   -- nome encontrado na posição alvo
    name_context    TEXT,                   -- trecho ao redor do nome
    candidatos      TEXT,                   -- JSON com a lista de candidatos parseados
    texto           TEXT,                   -- texto bruto extraído do PDF

    criado_em       TEXT NOT NULL,          -- quando entrou no banco (ISO)
    analisado_em    TEXT                    -- quando foi analisado (ISO)
  );

  CREATE TABLE IF NOT EXISTS runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    iniciado_em  TEXT NOT NULL,
    terminado_em TEXT,
    novos        INTEGER DEFAULT 0,
    total        INTEGER DEFAULT 0,
    mensagem     TEXT
  );
`);

module.exports = db;
