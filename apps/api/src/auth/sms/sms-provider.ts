import { InternalServerErrorException } from '@nestjs/common';

/**
 * SMS delivery abstraction. Bind `DevSmsProvider` locally and `Sms019Provider`
 * (or Twilio) in production via `createSmsProvider`.
 *
 * Two callers: the login flow (`sendOtp`) and the reminders worker
 * (`sendText`). Drivers implement `sendText`; `sendOtp` is that plus the
 * login-facing error wrapping.
 */
export const SMS_PROVIDER = 'SMS_PROVIDER';

export interface SmsProvider {
  /** Delivers a message. Throws `SmsSendError` when the gateway refuses. */
  sendText(phone: string, message: string): Promise<void>;
  sendOtp(phone: string, code: string): Promise<void>;
}

/**
 * Delivery failure. Deliberately carries no credential or gateway payload —
 * callers log it, and the login flow replaces it with a generic message.
 */
export class SmsSendError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'SmsSendError';
  }
}

export const OTP_MESSAGE_PREFIX = 'קוד האימות שלך: ';

export abstract class TextSmsProvider implements SmsProvider {
  abstract sendText(phone: string, message: string): Promise<void>;

  async sendOtp(phone: string, code: string): Promise<void> {
    try {
      await this.sendText(phone, `${OTP_MESSAGE_PREFIX}${code}`);
    } catch {
      // The driver already logged the cause; the login screen only ever sees
      // this generic Hebrew message, never the code or gateway internals.
      throw new InternalServerErrorException('שליחת הקוד נכשלה, נסו שוב');
    }
  }
}
