'use strict';

const iconv = require('iconv-lite');
const cheerio = require('cheerio');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/**
 * Busca a página do portal e devolve a lista de editais encontrados.
 * A página é servida em ISO-8859-1, então decodificamos manualmente.
 *
 * @param {{portalUrl: string, baseUrl: string}} config
 * @returns {Promise<{id:number,numero:string,titulo:string,url:string,publicado_em:string|null,ano:string|null}[]>}
 */
async function fetchEditais(config) {
  const res = await fetch(config.portalUrl, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9' },
  });
  if (!res.ok) {
    throw new Error(`Portal respondeu HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const html = iconv.decode(buf, 'ISO-8859-1');
  return parseEditais(html, config.baseUrl);
}

/**
 * Faz o parse do HTML do portal. Cada edital é um link /download/{id}/
 * cujo texto começa com "Edital". O ano vem do <h3> anterior e a data
 * de publicação do texto " - Publicado em dd/mm/aaaa" após o link.
 */
function parseEditais(html, baseUrl) {
  const $ = cheerio.load(html);
  const editais = [];
  const seen = new Set();

  $('a[href*="/download/"]').each((_, el) => {
    const $a = $(el);
    const href = $a.attr('href') || '';
    const texto = $a.text().trim();

    // só links de edital
    if (!/edital/i.test(texto)) return;

    const idMatch = href.match(/\/download\/(\d+)/);
    if (!idMatch) return;
    const id = Number(idMatch[1]);
    if (seen.has(id)) return;
    seen.add(id);

    // número do edital: "Edital N.° 051/2026" -> "051/2026"
    const numMatch = texto.match(/(\d{1,4})\s*\/\s*(\d{4})/);
    const numero = numMatch ? `${numMatch[1]}/${numMatch[2]}` : null;
    const ano = numMatch ? numMatch[2] : null;

    // data de publicação: texto irmão " - Publicado em 18/06/2026"
    const li = $a.closest('li');
    const liText = li.length ? li.text() : '';
    const dataMatch = liText.match(/Publicado em\s*(\d{2}\/\d{2}\/\d{4})/i);
    const publicado_em = dataMatch ? dataMatch[1] : null;

    const url = new URL(href, baseUrl).toString();

    editais.push({ id, numero, titulo: texto, url, publicado_em, ano });
  });

  return editais;
}

module.exports = { fetchEditais, parseEditais };
