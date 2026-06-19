'use strict';

/**
 * Envia aviso (WhatsApp via CallMeBot e/ou e-mail via Gmail) quando um edital
 * com match (nome ou posição) ainda não foi notificado.
 *
 * As credenciais vêm de variáveis de ambiente (no GitHub Actions, são "secrets"):
 *   WHATSAPP_PHONE   ex.: 5519999999999 (DDI+DDD+número, só dígitos)
 *   WHATSAPP_APIKEY  chave que o CallMeBot te envia na ativação
 *   MAIL_USER        e-mail do Gmail remetente
 *   MAIL_PASS        "app password" do Gmail (não a senha normal)
 *   MAIL_TO          destinatário (opcional; padrão = MAIL_USER)
 *
 * Canais sem credencial são pulados silenciosamente — então funciona mesmo
 * que você configure só um deles (ou nenhum).
 */

const db = require('./db');
const config = require('../config.json');

async function sendWhatsApp(phone, apikey, text) {
  const url =
    `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}` +
    `&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
  const res = await fetch(url);
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 150)}`);
  return body.slice(0, 150);
}

async function sendEmail(user, pass, to, subject, text) {
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  await transporter.sendMail({
    from: `Monitor de Editais <${user}>`,
    to,
    subject,
    text,
  });
}

/**
 * @param {(msg:string)=>void} [log]
 * @returns {Promise<{sent:number, canais:{whatsapp:boolean,email:boolean}}>}
 */
async function notifyNewMatches(log = console.log) {
  const env = process.env;
  const hasWhats = !!(env.WHATSAPP_PHONE && env.WHATSAPP_APIKEY);
  const hasMail = !!(env.MAIL_USER && env.MAIL_PASS);

  const matches = db
    .prepare(
      `SELECT id, titulo, publicado_em, name_found, position_found, matched_name
       FROM editais
       WHERE (name_found = 1 OR position_found = 1) AND notificado = 0
       ORDER BY id DESC`
    )
    .all();

  if (matches.length === 0) {
    log('[notify] Nenhum match novo para avisar.');
    return { sent: 0, canais: { whatsapp: hasWhats, email: hasMail } };
  }

  const linhas = matches.map((m) => {
    const partes = [];
    if (m.name_found) partes.push('NOME encontrado');
    if (m.position_found) partes.push(`posição ${config.target.position} → ${m.matched_name}`);
    return `• ${m.titulo} (${m.publicado_em || '?'}): ${partes.join('; ')}`;
  });

  const text =
    `🔔 Monitor de Editais — ENCONTRADO!\n\n` +
    `Alvo: ${config.target.name} / posição ${config.target.position}\n\n` +
    linhas.join('\n') +
    (config.siteUrl ? `\n\nPainel: ${config.siteUrl}` : '');
  const subject = `🔔 Edital encontrado — ${config.target.name}`;

  let anySent = false;

  if (hasWhats) {
    try {
      const r = await sendWhatsApp(env.WHATSAPP_PHONE, env.WHATSAPP_APIKEY, text);
      log(`[notify] WhatsApp enviado (${r.trim()}).`);
      anySent = true;
    } catch (e) {
      log(`[notify] WhatsApp FALHOU: ${e.message}`);
    }
  } else {
    log('[notify] WhatsApp não configurado — pulando.');
  }

  if (hasMail) {
    try {
      await sendEmail(env.MAIL_USER, env.MAIL_PASS, env.MAIL_TO || env.MAIL_USER, subject, text);
      log('[notify] E-mail enviado.');
      anySent = true;
    } catch (e) {
      log(`[notify] E-mail FALHOU: ${e.message}`);
    }
  } else {
    log('[notify] E-mail não configurado — pulando.');
  }

  // só marca como notificado se ALGUM canal enviou (senão tenta de novo na próxima)
  if (anySent) {
    const mark = db.prepare('UPDATE editais SET notificado = 1 WHERE id = ?');
    const tx = db.transaction((ids) => ids.forEach((id) => mark.run(id)));
    tx(matches.map((m) => m.id));
    log(`[notify] ${matches.length} edital(is) marcado(s) como avisado(s).`);
  } else if (matches.length > 0) {
    log('[notify] Há matches, mas nenhum canal configurado/funcionou — nada marcado.');
  }

  return { sent: anySent ? matches.length : 0, canais: { whatsapp: hasWhats, email: hasMail } };
}

module.exports = { notifyNewMatches };
