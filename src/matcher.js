'use strict';

/**
 * Normaliza texto para comparação tolerante:
 * - remove acentos (NFD + strip diacríticos)
 * - troca pontuação por espaço
 * - colapsa espaços e passa para MAIÚSCULO
 * Assim "Fabrício Cauã" == "FABRICIO CAUA" == "fabricio  caua".
 */
function normalize(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Extrai a lista de candidatos de um edital de convocação.
 * Formato típico: "CLASSIFICAÇÃO/NOME: 89º TAYANE SALES GALDINO (...), 90º LUCIANA ...".
 * Os parênteses (ex.: "(19º cota racial ...)") são removidos antes para não
 * confundir a classificação secundária com a principal.
 *
 * @returns {{classificacao: string, nome: string}[]}
 */
function parseCandidates(text) {
  if (!text) return [];
  const cleaned = text.replace(/\([^)]*\)/g, ' ');
  const candidates = [];
  // número + indicador ordinal (º ° ª o) + nome, até vírgula / próximo número / ponto / fim
  const re = /(\d{1,4})\s*[º°ªᵒoO]\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'.\- ]+?)(?=\s*,|\s*\d{1,4}\s*[º°ªᵒoO]\s|\s*[.;]|\n|$)/g;
  let m;
  while ((m = re.exec(cleaned)) !== null) {
    const nome = m[2].trim().replace(/\s+/g, ' ');
    if (nome.length >= 3) {
      candidates.push({ classificacao: m[1], nome });
    }
  }
  return candidates;
}

/**
 * Verifica um texto de edital contra o alvo (nome + posição).
 *
 * @param {string} text   texto extraído do PDF
 * @param {{name: string, position: string}} target
 * @returns {{
 *   nameFound: boolean,
 *   positionFound: boolean,
 *   matchedName: string|null,        // nome encontrado próximo da posição alvo
 *   nameContext: string|null,        // trecho do PDF ao redor do nome
 *   candidates: {classificacao,nome}[]
 * }}
 */
function checkEdital(text, target) {
  const normText = normalize(text);
  const normTargetName = normalize(target.name);
  const pos = String(target.position).trim();

  const candidates = parseCandidates(text);

  // ---- Busca por NOME ----
  // 1) substring no texto inteiro normalizado (tolera acento/caixa/pontuação/quebra de linha)
  let nameFound = normText.includes(normTargetName);
  // 2) reforço: algum candidato cujo nome bate exatamente (normalizado)
  if (!nameFound) {
    nameFound = candidates.some((c) => normalize(c.nome) === normTargetName);
  }

  let nameContext = null;
  if (nameFound) {
    const idx = normText.indexOf(normTargetName);
    if (idx >= 0) {
      // mapeia aproximadamente para um trecho legível do texto original
      const start = Math.max(0, idx - 40);
      nameContext = normText.slice(start, idx + normTargetName.length + 40).trim();
    }
  }

  // ---- Busca por POSIÇÃO ----
  const posMatch = candidates.find((c) => c.classificacao === pos);
  const positionFound = !!posMatch;
  const matchedName = posMatch ? posMatch.nome : null;

  return {
    nameFound,
    positionFound,
    matchedName,
    nameContext,
    candidates,
  };
}

module.exports = { normalize, parseCandidates, checkEdital };
