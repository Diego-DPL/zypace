"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resendApiKey = void 0;
exports.sendWelcomeEmail = sendWelcomeEmail;
exports.sendIncidentReplyEmail = sendIncidentReplyEmail;
exports.sendIncidentResolvedEmail = sendIncidentResolvedEmail;
const resend_1 = require("resend");
const params_1 = require("firebase-functions/params");
exports.resendApiKey = (0, params_1.defineSecret)('RESEND_API_KEY');
const APP_URL = 'https://www.zypace.com';
const FROM = 'Zypace <noreply@zypace.com>';
const LIME = '#a3e635';
const DARK = '#18181b';
// ── Shared layout ─────────────────────────────────────────────────────
function layout(title, body) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:${DARK};padding:28px 32px;text-align:center;">
            <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">ZY<span style="color:${LIME}">PACE</span></span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 32px 28px;">
            ${body}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e4e4e7;padding:20px 32px;text-align:center;">
            <p style="margin:0 0 6px;font-size:12px;color:#a1a1aa;">
              © ${new Date().getFullYear()} Zypace ·
              <a href="${APP_URL}/support" style="color:#71717a;text-decoration:underline;">Soporte</a> ·
              <a href="${APP_URL}/privacy" style="color:#71717a;text-decoration:underline;">Privacidad</a>
            </p>
            <p style="margin:0;font-size:11px;color:#d4d4d8;">Has recibido este email porque tienes una cuenta en Zypace.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
function ctaButton(href, text) {
    return `<a href="${href}" style="display:inline-block;margin-top:24px;padding:13px 28px;background:${LIME};color:#000000;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;">${text}</a>`;
}
function h1(text) {
    return `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#18181b;line-height:1.3;">${text}</h1>`;
}
function p(text, muted = false) {
    return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${muted ? '#71717a' : '#3f3f46'};">${text}</p>`;
}
// ── Welcome email ─────────────────────────────────────────────────────
function welcomeHtml(firstName) {
    const name = firstName || 'corredor';
    const body = `
    ${h1(`¡Bienvenido a Zypace, ${name}!`)}
    ${p('Tu cuenta está lista. Ahora tienes todo lo que necesitas para preparar tu próxima carrera con un plan inteligente.')}

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      ${[
        ['1', 'Conecta Strava', 'Sincroniza tus actividades automáticamente desde Ajustes → Integraciones.'],
        ['2', 'Genera tu plan', 'Elige tu carrera objetivo y deja que la IA construya tu preparación semana a semana.'],
        ['3', 'Entrena y avanza', 'Cada actividad que registres se refleja en tu plan y ajusta tu progreso.'],
    ].map(([n, title, desc]) => `
        <tr>
          <td style="padding:10px 0;vertical-align:top;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:32px;height:32px;background:${LIME};border-radius:50%;text-align:center;vertical-align:middle;font-size:13px;font-weight:700;color:#000;min-width:32px;">${n}</td>
                <td style="padding-left:12px;vertical-align:top;">
                  <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#18181b;">${title}</p>
                  <p style="margin:0;font-size:13px;color:#71717a;line-height:1.5;">${desc}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>`).join('')}
    </table>

    <div style="text-align:center;">
      ${ctaButton(`${APP_URL}/app`, 'Ir a mi dashboard')}
    </div>

    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e4e4e7;">
      ${p('¿Tienes alguna duda? Escríbenos a <a href="mailto:support.zypace@gmail.com" style="color:#18181b;">support.zypace@gmail.com</a> o visita nuestro <a href="${APP_URL}/support" style="color:#18181b;">centro de ayuda</a>.', true)}
    </div>
  `;
    return layout('¡Bienvenido a Zypace!', body);
}
// ── Incident reply email ──────────────────────────────────────────────
function incidentReplyHtml(subject, replyText) {
    const body = `
    ${h1('Tienes una nueva respuesta')}
    ${p(`El equipo de soporte de Zypace ha respondido a tu incidencia <strong style="color:#18181b;">"${subject}"</strong>.`)}

    <div style="margin:20px 0;padding:16px 20px;background:#f9fafb;border-left:3px solid ${LIME};border-radius:4px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.05em;">Respuesta del equipo</p>
      <p style="margin:0;font-size:14px;color:#3f3f46;line-height:1.6;">${replyText}</p>
    </div>

    <div style="text-align:center;">
      ${ctaButton(`${APP_URL}/support`, 'Ver incidencia completa')}
    </div>
  `;
    return layout('Nueva respuesta en tu incidencia', body);
}
// ── Incident resolved email ───────────────────────────────────────────
function incidentResolvedHtml(subject) {
    const body = `
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;width:52px;height:52px;background:#f0fdf4;border-radius:50%;line-height:52px;font-size:24px;">✓</div>
    </div>

    ${h1('Incidencia resuelta')}
    ${p(`Tu incidencia <strong style="color:#18181b;">"${subject}"</strong> ha sido marcada como resuelta.`)}
    ${p('Si el problema persiste o tienes alguna otra duda, puedes abrir una nueva incidencia desde el centro de ayuda.', true)}

    <div style="text-align:center;">
      ${ctaButton(`${APP_URL}/support`, 'Ver mis incidencias')}
    </div>
  `;
    return layout('Tu incidencia ha sido resuelta', body);
}
// ── Public send functions ─────────────────────────────────────────────
async function sendWelcomeEmail(to, firstName) {
    const resend = new resend_1.Resend(exports.resendApiKey.value());
    await resend.emails.send({
        from: FROM,
        to: [to],
        subject: `¡Bienvenido a Zypace, ${firstName || 'corredor'}!`,
        html: welcomeHtml(firstName),
    });
}
async function sendIncidentReplyEmail(to, subject, replyText) {
    const resend = new resend_1.Resend(exports.resendApiKey.value());
    await resend.emails.send({
        from: FROM,
        to: [to],
        subject: `Nueva respuesta en tu incidencia: "${subject}"`,
        html: incidentReplyHtml(subject, replyText),
    });
}
async function sendIncidentResolvedEmail(to, subject) {
    const resend = new resend_1.Resend(exports.resendApiKey.value());
    await resend.emails.send({
        from: FROM,
        to: [to],
        subject: `Tu incidencia ha sido resuelta: "${subject}"`,
        html: incidentResolvedHtml(subject),
    });
}
//# sourceMappingURL=emailService.js.map