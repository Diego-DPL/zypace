import { Resend } from 'resend';
import { defineSecret } from 'firebase-functions/params';

export const resendApiKey = defineSecret('RESEND_API_KEY');

const APP_URL  = 'https://www.zypace.com';
const FROM     = 'Zypace <noreply@zypace.com>';
const LIME     = '#a3e635';
const DARK     = '#18181b';
const LOGO_URL = `${APP_URL}/logo.png`;

// ── Shared layout ─────────────────────────────────────────────────────
function layout(title: string, body: string): string {
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
          <td style="background:${DARK};padding:24px 32px;text-align:center;">
            <img src="${LOGO_URL}" alt="Zypace" width="140" style="display:block;margin:0 auto;height:auto;max-width:140px;" />
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

function ctaButton(href: string, text: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:24px;padding:13px 28px;background:${LIME};color:#000000;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;">${text}</a>`;
}

function h1(text: string): string {
  return `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#18181b;line-height:1.3;">${text}</h1>`;
}

function p(text: string, muted = false): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${muted ? '#71717a' : '#3f3f46'};">${text}</p>`;
}

// ── Welcome email ─────────────────────────────────────────────────────
function welcomeHtml(firstName: string): string {
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
function incidentReplyHtml(subject: string, replyText: string): string {
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
function incidentResolvedHtml(subject: string): string {
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

// ── Plan ready email ──────────────────────────────────────────────────
function planReadyHtml(firstName: string, goal: string, totalWeeks: number, raceName: string, raceDate: string): string {
  const name = firstName || 'corredor';
  const fmtDate = raceDate
    ? new Date(raceDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const body = `
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;width:52px;height:52px;background:#f7fee7;border-radius:50%;line-height:52px;font-size:26px;">🏃</div>
    </div>
    ${h1(`¡Tu plan está listo, ${name}!`)}
    ${p(`Hemos generado tu plan de entrenamiento para <strong style="color:#18181b;">${raceName || 'tu carrera'}</strong>${fmtDate ? ` el ${fmtDate}` : ''}.`)}

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:#f9fafb;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:16px 20px;border-bottom:1px solid #e4e4e7;">
          <p style="margin:0;font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Objetivo</p>
          <p style="margin:4px 0 0;font-size:15px;color:#18181b;font-weight:500;">${goal || '—'}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0;font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Duración</p>
          <p style="margin:4px 0 0;font-size:15px;color:#18181b;font-weight:500;">${totalWeeks ? `${totalWeeks} semanas` : '—'}</p>
        </td>
      </tr>
    </table>

    ${p('Ya puedes ver tu calendario completo de entrenamientos. Recuerda conectar Strava para que tus actividades se marquen como completadas automáticamente.', true)}

    <div style="text-align:center;">
      ${ctaButton(`${APP_URL}/training-plan`, 'Ver mi plan')}
    </div>
  `;
  return layout('Tu plan de entrenamiento está listo', body);
}

// ── Race reminder email ───────────────────────────────────────────────
function raceReminderHtml(firstName: string, raceName: string, raceDate: string, daysLeft: number): string {
  const name = firstName || 'corredor';
  const fmtDate = raceDate
    ? new Date(raceDate).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const body = `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="display:inline-block;background:${LIME};border-radius:12px;padding:8px 20px;">
        <span style="font-size:32px;font-weight:800;color:#000;line-height:1;">${daysLeft}</span>
        <span style="font-size:14px;font-weight:600;color:#000;margin-left:4px;">días</span>
      </div>
    </div>
    ${h1(`¡${raceName} se acerca, ${name}!`)}
    ${p(`Tu carrera es el <strong style="color:#18181b;">${fmtDate || raceDate}</strong>. Quedan exactamente ${daysLeft} días. Es el momento de afinar los últimos detalles.`)}

    <div style="margin:20px 0;padding:16px 20px;background:#f9fafb;border-radius:8px;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#3f3f46;">Checklist final</p>
      ${['Revisa tu plan de tapering esta semana', 'Confirma la logística: transporte, dorsal, bolsa', 'Prepara tu equipación y nutrición de carrera', 'Descansa bien los 2 días anteriores'].map(item =>
        `<p style="margin:0 0 6px;font-size:13px;color:#71717a;padding-left:16px;">· ${item}</p>`
      ).join('')}
    </div>

    ${p('¡Mucha suerte! Has trabajado duro para llegar hasta aquí.', true)}

    <div style="text-align:center;">
      ${ctaButton(`${APP_URL}/races`, 'Ver calendario de carreras')}
    </div>
  `;
  return layout(`¡${raceName} en ${daysLeft} días!`, body);
}

// ── Weekly summary email ──────────────────────────────────────────────
interface WeeklyStats {
  completedWorkouts: number;
  totalWorkouts:     number;
  nextWeekWorkouts:  number;
  weekLabel:         string; // e.g. "5–11 mayo"
}

function weeklySummaryHtml(firstName: string, stats: WeeklyStats): string {
  const name       = firstName || 'corredor';
  const rate       = stats.totalWorkouts > 0
    ? Math.round((stats.completedWorkouts / stats.totalWorkouts) * 100)
    : 0;
  const rateColor  = rate >= 80 ? '#16a34a' : rate >= 50 ? '#d97706' : '#dc2626';
  const rateEmoji  = rate >= 80 ? '🔥' : rate >= 50 ? '👍' : '💪';

  const body = `
    ${h1(`Tu semana, ${name} ${rateEmoji}`)}
    ${p(`Resumen de la semana del <strong style="color:#18181b;">${stats.weekLabel}</strong>.`)}

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <tr>
        ${[
          { label: 'Entrenamientos', value: `${stats.completedWorkouts}/${stats.totalWorkouts}`, sub: 'completados' },
          { label: 'Cumplimiento',   value: `${rate}%`,                                          sub: 'del plan', color: rateColor },
          { label: 'Próxima semana', value: String(stats.nextWeekWorkouts),                      sub: 'sesiones' },
        ].map(card => `
          <td style="width:33%;padding:0 6px 0 0;vertical-align:top;">
            <div style="background:#f9fafb;border-radius:8px;padding:14px;text-align:center;">
              <p style="margin:0 0 2px;font-size:22px;font-weight:700;color:${card.color || DARK};">${card.value}</p>
              <p style="margin:0;font-size:11px;color:#a1a1aa;">${card.label}</p>
              <p style="margin:0;font-size:11px;color:#d4d4d8;">${card.sub}</p>
            </div>
          </td>`
        ).join('')}
      </tr>
    </table>

    ${rate >= 80
      ? p('Semana excelente. Mantén el ritmo y sigue así de constante.')
      : rate >= 50
        ? p('Buena semana. Intenta completar los entrenamientos pendientes si puedes recuperarlos.')
        : p('Ha sido una semana difícil. Sin presión — la constancia a largo plazo es lo que importa.')}

    <div style="text-align:center;">
      ${ctaButton(`${APP_URL}/calendar`, 'Ver mi calendario')}
    </div>
  `;
  return layout('Tu resumen semanal · Zypace', body);
}

// ── Offboarding email ─────────────────────────────────────────────────
function offboardingHtml(firstName: string, periodEndDate: string, isTrial: boolean): string {
  const name = firstName || 'corredor';
  const body = isTrial ? `
    ${h1(`Hasta pronto, ${name}`)}
    ${p('Has cancelado durante el periodo de prueba. <strong style="color:#18181b;">No se ha realizado ningún cargo</strong> en tu cuenta.')}
    ${p('Esperamos haberte dado algo útil durante estos días. Si en algún momento vuelves a plantearte preparar una carrera en serio, aquí estaremos — con todo listo para ti.', true)}

    <div style="margin:20px 0;padding:16px 20px;background:#f9fafb;border-radius:8px;">
      <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#18181b;">¿Nos das una última oportunidad?</p>
      <p style="margin:0;font-size:13px;color:#71717a;line-height:1.6;">Si hay algo que podríamos haber hecho mejor, escríbenos. Leemos cada mensaje personalmente y muchas mejoras del producto nacen exactamente de conversaciones así.</p>
    </div>

    <div style="text-align:center;">
      ${ctaButton(`${APP_URL}/subscription`, 'Reactivar mi cuenta')}
    </div>

    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e4e4e7;">
      ${p('¿Tienes algún comentario? Escríbenos a <a href="mailto:support.zypace@gmail.com" style="color:#18181b;">support.zypace@gmail.com</a>. Ojalá nos veamos pronto en la línea de salida.', true)}
    </div>
  ` : `
    ${h1(`Hasta pronto, ${name}`)}
    ${p(`Tu suscripción seguirá activa hasta el <strong style="color:#18181b;">${periodEndDate}</strong>. Hasta entonces, tienes acceso completo a todo — tu plan, tu calendario y tu historial de entrenamientos.`)}

    <div style="margin:20px 0;padding:16px 20px;background:#f9fafb;border-radius:8px;border-left:3px solid ${LIME};">
      <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#18181b;">¿Cambias de opinión? Puedes reactivar en cualquier momento</p>
      <p style="margin:0;font-size:13px;color:#71717a;line-height:1.6;">Un clic desde la configuración de tu cuenta y vuelves a estar dentro. Sin colas, sin papeleos, sin perder nada.</p>
    </div>

    ${p('Ha sido un placer entrenarte contigo. Esperamos que la próxima carrera salga redonda — con o sin nosotros.', true)}
    ${p('Si hay algo que podríamos haber hecho mejor, escríbenos. Leemos cada mensaje personalmente y tu opinión da forma directamente al producto.', true)}

    <div style="text-align:center;">
      ${ctaButton(`${APP_URL}/subscription`, 'Reactivar mi suscripción')}
    </div>

    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e4e4e7;">
      ${p('¿Alguna duda o comentario? <a href="mailto:support.zypace@gmail.com" style="color:#18181b;">support.zypace@gmail.com</a>', true)}
    </div>
  `;
  return layout('Hasta pronto · Zypace', body);
}

// ── Trial start email ─────────────────────────────────────────────────
function trialStartHtml(firstName: string, trialEndDate: string): string {
  const name = firstName || 'corredor';
  const body = `
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;background:${LIME};border-radius:12px;padding:10px 24px;">
        <span style="font-size:28px;font-weight:800;color:#000;line-height:1;">30</span>
        <span style="font-size:14px;font-weight:700;color:#000;margin-left:4px;">días gratis</span>
      </div>
    </div>

    ${h1(`¡Tu prueba gratuita ha comenzado, ${name}!`)}
    ${p('Tienes <strong style="color:#18181b;">30 días de acceso completo a Zypace sin coste</strong>. No se realizará ningún cargo hasta el <strong style="color:#18181b;">' + trialEndDate + '</strong>.')}

    <div style="margin:20px 0;padding:16px 20px;background:#f9fafb;border-radius:8px;border-left:3px solid ${LIME};">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#18181b;">Durante estos 30 días puedes:</p>
      ${['Generar tu plan de entrenamiento personalizado con IA', 'Sincronizar todas tus actividades con Strava', 'Seguir tu progreso semana a semana', 'Calibrar tus zonas de ritmo'].map(item =>
        `<p style="margin:0 0 5px;font-size:13px;color:#71717a;padding-left:12px;">· ${item}</p>`
      ).join('')}
    </div>

    ${p('Si en algún momento decides que no es para ti, puedes <strong style="color:#18181b;">cancelar cuando quieras</strong> desde la configuración de tu cuenta, sin ningún compromiso ni penalización.')}
    ${p('Estamos abiertos a cualquier sugerencia o comentario que tengas. Tu opinión nos ayuda a mejorar cada día.', true)}

    <div style="text-align:center;">
      ${ctaButton(`${APP_URL}/app`, 'Ir a mi dashboard')}
    </div>

    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e4e4e7;">
      ${p('¿Tienes alguna pregunta? Escríbenos a <a href="mailto:support.zypace@gmail.com" style="color:#18181b;">support.zypace@gmail.com</a>.', true)}
    </div>
  `;
  return layout('Tu prueba gratuita de 30 días ha comenzado', body);
}

// ── Invite email ──────────────────────────────────────────────────────
function inviteHtml(): string {
  const body = `
    ${h1('Te han invitado a Zypace')}
    ${p('Has recibido una invitación para acceder a <strong style="color:#18181b;">Zypace</strong>, el entrenador personal de running con IA.')}
    ${p('Con tu acceso podrás:')}

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 24px;">
      ${[
        ['Genera tu plan', 'La IA construye un plan de entrenamiento personalizado según tu nivel y objetivo de carrera.'],
        ['Conecta Strava', 'Tus actividades se sincronizan automáticamente y el plan se actualiza en tiempo real.'],
        ['Sigue tu progreso', 'Visualiza cada semana, marca entrenamientos y prepárate para tu próxima carrera.'],
      ].map(([title, desc]) => `
        <tr>
          <td style="padding:8px 0;vertical-align:top;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:8px;padding-top:5px;vertical-align:top;">
                  <div style="width:6px;height:6px;background:${LIME};border-radius:50%;"></div>
                </td>
                <td style="padding-left:10px;vertical-align:top;">
                  <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#18181b;">${title}</p>
                  <p style="margin:0;font-size:13px;color:#71717a;line-height:1.5;">${desc}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>`).join('')}
    </table>

    ${p('Tu acceso está activado. Créate una cuenta con este email y entrarás directamente, sin necesidad de suscripción.')}

    <div style="text-align:center;">
      ${ctaButton(`${APP_URL}/register`, 'Crear mi cuenta gratis')}
    </div>

    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e4e4e7;">
      ${p('¿Tienes alguna pregunta? Escríbenos a <a href="mailto:support.zypace@gmail.com" style="color:#18181b;">support.zypace@gmail.com</a>.', true)}
    </div>
  `;
  return layout('Tu invitación a Zypace', body);
}

// ── Public send functions ─────────────────────────────────────────────
export async function sendWelcomeEmail(to: string, firstName: string): Promise<void> {
  const resend = new Resend(resendApiKey.value());
  await resend.emails.send({
    from:    FROM,
    to:      [to],
    subject: `¡Bienvenido a Zypace, ${firstName || 'corredor'}!`,
    html:    welcomeHtml(firstName),
  });
}

export async function sendIncidentReplyEmail(
  to: string,
  subject: string,
  replyText: string,
): Promise<void> {
  const resend = new Resend(resendApiKey.value());
  await resend.emails.send({
    from:    FROM,
    to:      [to],
    subject: `Nueva respuesta en tu incidencia: "${subject}"`,
    html:    incidentReplyHtml(subject, replyText),
  });
}

export async function sendIncidentResolvedEmail(to: string, subject: string): Promise<void> {
  const resend = new Resend(resendApiKey.value());
  await resend.emails.send({
    from:    FROM,
    to:      [to],
    subject: `Tu incidencia ha sido resuelta: "${subject}"`,
    html:    incidentResolvedHtml(subject),
  });
}

export async function sendPlanReadyEmail(
  to: string,
  firstName: string,
  goal: string,
  totalWeeks: number,
  raceName: string,
  raceDate: string,
): Promise<void> {
  const resend = new Resend(resendApiKey.value());
  await resend.emails.send({
    from:    FROM,
    to:      [to],
    subject: `¡Tu plan de entrenamiento está listo!`,
    html:    planReadyHtml(firstName, goal, totalWeeks, raceName, raceDate),
  });
}

export async function sendRaceReminderEmail(
  to: string,
  firstName: string,
  raceName: string,
  raceDate: string,
  daysLeft: number,
): Promise<void> {
  const resend = new Resend(resendApiKey.value());
  await resend.emails.send({
    from:    FROM,
    to:      [to],
    subject: `⏱ ${raceName} en ${daysLeft} días — ¿listo?`,
    html:    raceReminderHtml(firstName, raceName, raceDate, daysLeft),
  });
}

export async function sendWeeklySummaryEmail(
  to: string,
  firstName: string,
  stats: WeeklyStats,
): Promise<void> {
  const resend = new Resend(resendApiKey.value());
  await resend.emails.send({
    from:    FROM,
    to:      [to],
    subject: `Tu resumen semanal · ${stats.weekLabel}`,
    html:    weeklySummaryHtml(firstName, stats),
  });
}

export async function sendOffboardingEmail(
  to: string,
  firstName: string,
  periodEndMs: number,
  isTrial: boolean,
): Promise<void> {
  const periodEndDate = new Date(periodEndMs).toLocaleDateString('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const resend = new Resend(resendApiKey.value());
  const subject = isTrial
    ? 'Sin cargos — hasta pronto'
    : `Tu acceso sigue activo hasta el ${periodEndDate}`;
  await resend.emails.send({
    from:    FROM,
    to:      [to],
    subject,
    html:    offboardingHtml(firstName, periodEndDate, isTrial),
  });
}

export async function sendTrialStartEmail(to: string, firstName: string, trialEndMs: number): Promise<void> {
  const trialEndDate = new Date(trialEndMs).toLocaleDateString('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const resend = new Resend(resendApiKey.value());
  await resend.emails.send({
    from:    FROM,
    to:      [to],
    subject: '¡Tu prueba gratuita de 30 días ha comenzado!',
    html:    trialStartHtml(firstName, trialEndDate),
  });
}

export async function sendInviteEmail(to: string): Promise<void> {
  const resend = new Resend(resendApiKey.value());
  await resend.emails.send({
    from:    FROM,
    to:      [to],
    subject: 'Te han invitado a Zypace',
    html:    inviteHtml(),
  });
}

export type { WeeklyStats };
