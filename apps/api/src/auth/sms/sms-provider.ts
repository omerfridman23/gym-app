/**
 * SMS delivery abstraction. The real provider (Twilio / 019 / etc.) is an
 * open product decision (handoff section 7) — swapping one in means adding a
 * class that implements this interface and binding it in AuthModule.
 */
export const SMS_PROVIDER = 'SMS_PROVIDER';

export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<void>;
}
