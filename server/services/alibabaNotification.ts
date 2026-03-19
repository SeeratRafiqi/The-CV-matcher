/**
 * Optional notification when a voice interview is assigned.
 * Uses Alibaba Cloud DirectMail (SMTP) to send email to the candidate.
 * Set ALIBABA_DM_FROM and ALIBABA_DM_PASS in .env to enable.
 * @see https://www.alibabacloud.com/help/en/direct-mail/smtp-nodejs
 */

export interface VoiceInterviewAssignedParams {
  toEmail: string;
  candidateName: string;
  jobTitle: string;
  sessionId: string;
  expiresAt: Date;
}

export async function notifyVoiceInterviewAssigned(params: VoiceInterviewAssignedParams): Promise<void> {
  const from = process.env.ALIBABA_DM_FROM;
  const pass = process.env.ALIBABA_DM_PASS;
  if (!from?.trim() || !pass?.trim()) return;

  const appUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:5000';
  const interviewUrl = `${appUrl.replace(/\/$/, '')}/voice-interview/${params.sessionId}`;
  const expiresStr = params.expiresAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  const subject = `Voice interview scheduled: ${params.jobTitle}`;
  const html = `
    <p>Hi ${escapeHtml(params.candidateName)},</p>
    <p>You have been assigned a voice interview for <strong>${escapeHtml(params.jobTitle)}</strong>.</p>
    <p>Please complete it before <strong>${escapeHtml(expiresStr)}</strong>.</p>
    <p><a href="${escapeHtml(interviewUrl)}">Start voice interview</a></p>
    <p>Good luck!</p>
  `.trim();

  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      host: process.env.ALIBABA_DM_HOST || 'smtpdm.aliyun.com',
      port: Number(process.env.ALIBABA_DM_PORT || '465'),
      secure: true,
      auth: { user: from, pass },
    });
    await transporter.sendMail({
      from: process.env.ALIBABA_DM_FROM_NAME ? `"${process.env.ALIBABA_DM_FROM_NAME}" <${from}>` : from,
      to: params.toEmail,
      subject,
      html,
    });
  } catch (err) {
    console.error('[AlibabaNotification] Voice interview assigned email failed:', err);
    throw err;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
