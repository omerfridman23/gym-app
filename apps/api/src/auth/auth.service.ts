import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomInt } from 'node:crypto';
import { DEV_COACH_NAME, DEV_COACH_PHONE, DEV_LOGIN_CODE } from './auth.constants.js';
import { AuthRepository } from './auth.repository.js';
import { SMS_PROVIDER, type SmsProvider } from './sms/sms-provider.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_REQUEST_WINDOW_MS = 15 * 60 * 1000;
const OTP_REQUESTS_PER_WINDOW = 3;

export interface CoachSession {
  id: string;
  phone: string;
  name: string;
  vertical: 'padel' | 'fitness' | null;
  onboarded: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly jwt: JwtService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    private readonly config: ConfigService,
  ) {}

  private isDevLogin(rawPhone: string, code?: string): boolean {
    const enabled =
      this.config.get('NODE_ENV') !== 'production' ||
      this.config.get<string>('DEV_LOGIN_ENABLED') === 'true';
    if (!enabled) return false;
    const phone = (rawPhone ?? '').replace(/[\s-]/g, '');
    return phone === DEV_LOGIN_CODE || code === DEV_LOGIN_CODE;
  }

  private async loginDevCoach(): Promise<{ token: string; coach: CoachSession }> {
    const coach = await this.repo.findOrCreateDevCoach(DEV_COACH_PHONE, DEV_COACH_NAME);
    const token = await this.jwt.signAsync({ sub: coach.id });
    return { token, coach: this.toSession(coach) };
  }

  /** Accepts 05XXXXXXXX or +9725XXXXXXXX; stores E.164. */
  normalizePhone(raw: string): string {
    const digits = (raw ?? '').replace(/[\s-]/g, '');
    if (/^05\d{8}$/.test(digits)) return `+972${digits.slice(1)}`;
    if (/^\+9725\d{8}$/.test(digits)) return digits;
    throw new BadRequestException('מספר טלפון לא תקין');
  }

  private hashCode(phone: string, code: string): string {
    return createHash('sha256').update(`${phone}:${code}`).digest('hex');
  }

  async requestOtp(rawPhone: string): Promise<void> {
    if (this.isDevLogin(rawPhone)) return;

    const phone = this.normalizePhone(rawPhone);

    const since = new Date(Date.now() - OTP_REQUEST_WINDOW_MS);
    const recent = await this.repo.countRecentOtpRequests(phone, since);
    if (recent >= OTP_REQUESTS_PER_WINDOW) {
      throw new HttpException('יותר מדי בקשות, נסו שוב מאוחר יותר', HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.repo.createOtp(phone, this.hashCode(phone, code), new Date(Date.now() + OTP_TTL_MS));
    await this.sms.sendOtp(phone, code);
  }

  async verifyOtp(rawPhone: string, code: string): Promise<{ token: string; coach: CoachSession }> {
    if (this.isDevLogin(rawPhone, code)) return this.loginDevCoach();

    const phone = this.normalizePhone(rawPhone);
    if (!/^\d{6}$/.test(code ?? '')) throw new UnauthorizedException('קוד שגוי');

    const otp = await this.repo.findActiveOtp(phone);
    if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw new UnauthorizedException('הקוד פג תוקף, בקשו קוד חדש');
    }

    if (otp.codeHash !== this.hashCode(phone, code)) {
      const attempts = await this.repo.recordFailedAttempt(otp.id);
      if (attempts >= OTP_MAX_ATTEMPTS) {
        throw new UnauthorizedException('הקוד פג תוקף, בקשו קוד חדש');
      }
      throw new UnauthorizedException('קוד שגוי');
    }

    await this.repo.consumeOtp(otp.id);

    const coach = await this.repo.findOrCreateCoach(phone);
    const token = await this.jwt.signAsync({ sub: coach.id });

    return { token, coach: this.toSession(coach) };
  }

  async verifyToken(token: string): Promise<string> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      return payload.sub;
    } catch {
      throw new UnauthorizedException();
    }
  }

  toSession(coach: {
    id: string;
    phone: string;
    name: string;
    vertical: 'padel' | 'fitness' | null;
    onboardedAt: Date | null;
  }): CoachSession {
    return {
      id: coach.id,
      phone: coach.phone,
      name: coach.name,
      vertical: coach.vertical,
      onboarded: coach.onboardedAt !== null,
    };
  }
}
