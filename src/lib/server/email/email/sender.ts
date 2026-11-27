/**
 * Outbound email abstraction. Today no live provider exists (no verified
 * sending domain, no provider account), so the only sender is the log/mock
 * sender below. The factory FAILS CLOSED on any other provider value: an
 * unrecognized EMAIL_PROVIDER means a config mistake, and config mistakes
 * must surface loudly instead of silently dropping verification email.
 *
 * Live provider adapters (Resend, Brevo, ...) plug into createEmailSender
 * later. They will need: a provider account (Eric's signup decision), an API
 * key from server env (never the client), and - for Resend - a verified
 * domain we own.
 */

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
}

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export interface EmailSender {
  send(message: OutboundEmail): Promise<SendResult>;
}

/**
 * Mock sender: records every message in an in-process outbox and logs it.
 * Nothing ever leaves the server. The log line carries recipient and subject
 * ONLY - never the body, so no verification token can land in logs. Used by
 * default (provider unset or 'log'), and by tests, which read `outbox`.
 */
export class LogEmailSender implements EmailSender {
  readonly outbox: OutboundEmail[] = [];

  async send(message: OutboundEmail): Promise<SendResult> {
    this.outbox.push(message);
    console.log(`[email:log] to=${message.to} subject=${message.subject}`);
    return { ok: true, id: `log-${this.outbox.length}` };
  }
}

export interface EmailSenderConfig {
  /** EMAIL_PROVIDER env value. Unset or 'log'/'mock' selects the log sender. */
  provider?: string;
}

export function createEmailSender(config: EmailSenderConfig): EmailSender {
  const provider = (config.provider ?? 'log').trim().toLowerCase();
  if (provider === 'log' || provider === 'mock' || provider === '') {
    return new LogEmailSender();
  }
  throw new Error(
    `EMAIL_PROVIDER=${provider} is not available: no live email provider is configured. ` +
    `Unset EMAIL_PROVIDER (or set it to 'log') until a provider account and sending domain exist.`,
  );
}

export function verificationEmail(to: string, link: string): OutboundEmail {
  return {
    to,
    subject: 'Confirm your TenderAgent email address',
    text: [
      'Confirm this email address for your TenderAgent account:',
      '',
      link,
      '',
      'If you did not create this account, ignore this email.',
    ].join('\n'),
  };
}

export function passwordResetEmail(to: string, link: string): OutboundEmail {
  return {
    to,
    subject: 'Reset your TenderAgent password',
    text: [
      'A password reset was requested for your TenderAgent account:',
      '',
      link,
      '',
      'If you did not request this, ignore this email; your password is unchanged.',
    ].join('\n'),
  };
}
