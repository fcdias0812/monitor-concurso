'use strict';

const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const PDF_DIR = path.join(__dirname, '..', 'data', 'pdfs');
fs.mkdirSync(PDF_DIR, { recursive: true });

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// destinos RTF cujo conteúdo não é texto do documento
const IGNORE_DEST = /^(fonttbl|colortbl|stylesheet|info|pict|themedata|colorschememapping|latentstyles|datastore|generator|nonshppict|shppict|listtable|listoverridetable|rsidtbl|mmathPr|wgrffmtfilter)/;

/**
 * Converte RTF em texto plano. Trata os escapes que o portal usa:
 * \uN (unicode + byte de fallback que deve ser pulado), \'xx (Latin-1),
 * \par/\cell/\row (quebras) e grupos ignoráveis (fonttbl, info, etc.).
 */
function rtfToText(rtf) {
  let out = '';
  let i = 0;
  const n = rtf.length;
  let ucskip = 1; // bytes a pular após \uN
  let skip = 0;
  let depth = 0;
  let ignoreDepth = 0; // > 0 enquanto dentro de um destino ignorável

  while (i < n) {
    const c = rtf[i];

    if (c === '{') { depth++; i++; continue; }
    if (c === '}') {
      depth--;
      if (ignoreDepth && depth < ignoreDepth) ignoreDepth = 0;
      i++;
      continue;
    }

    if (c === '\\') {
      const next = rtf[i + 1];

      if (next === '\\' || next === '{' || next === '}') {
        if (!ignoreDepth && skip === 0) out += next;
        else if (skip > 0) skip--;
        i += 2;
        continue;
      }
      if (next === '*') { ignoreDepth = depth; i += 2; continue; }
      if (next === "'") {
        const hex = rtf.substr(i + 2, 2);
        i += 4;
        if (skip > 0) skip--;
        else if (!ignoreDepth) out += String.fromCharCode(parseInt(hex, 16) || 0);
        continue;
      }

      // palavra de controle: \word[-][num][ ]
      let j = i + 1;
      let word = '';
      while (j < n && /[a-zA-Z]/.test(rtf[j])) { word += rtf[j]; j++; }
      let neg = false;
      if (rtf[j] === '-') { neg = true; j++; }
      let num = '';
      while (j < n && /[0-9]/.test(rtf[j])) { num += rtf[j]; j++; }
      if (rtf[j] === ' ') j++; // delimitador
      i = j;

      if (word === 'u') {
        let code = parseInt(num || '0', 10);
        if (neg) code = 65536 + code;
        if (!ignoreDepth) out += String.fromCharCode(code);
        skip = ucskip;
      } else if (word === 'uc') {
        ucskip = parseInt(num || '1', 10);
      } else if (word === 'par' || word === 'line' || word === 'row' || word === 'sect') {
        if (!ignoreDepth) out += '\n';
      } else if (word === 'cell' || word === 'tab') {
        if (!ignoreDepth) out += ' ';
      } else if (IGNORE_DEST.test(word)) {
        ignoreDepth = depth;
      }
      continue;
    }

    // caractere comum
    if (skip > 0) { skip--; i++; continue; }
    if (!ignoreDepth && c !== '\r' && c !== '\n') out += c;
    i++;
  }

  return out.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
}

/**
 * Extrai texto de um buffer, detectando PDF ou RTF pela assinatura.
 */
async function extractText(buf) {
  const head = buf.slice(0, 8).toString('latin1');
  if (head.startsWith('{\\rtf')) {
    return rtfToText(buf.toString('latin1'));
  }
  // assume PDF (pode começar com %PDF ou ter lixo antes do header)
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  return result.text || '';
}

/**
 * Baixa o arquivo do edital (cacheando em disco) e extrai o texto.
 * @param {number} id   id do download no portal
 * @param {string} url  url absoluta
 * @returns {Promise<string>}
 */
async function downloadAndExtract(id, url) {
  const file = path.join(PDF_DIR, `${id}.pdf`);

  let buf;
  if (fs.existsSync(file)) {
    buf = fs.readFileSync(file);
  } else {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`download HTTP ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(file, buf);
  }

  return extractText(buf);
}

module.exports = { downloadAndExtract, extractText, rtfToText, PDF_DIR };
