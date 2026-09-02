import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomInt } from 'node:crypto';
import { AuthRepository } from './auth.repository.js';
import { SMS_PROVIDER, type SmsProvider } from './sms/sms-provider.js';

const OTP_TTL_MS = 10 * 60 * 1000;
// Belongs to the temporarily disabled verification block in verifyOtp.
// const OTP_MAX_ATTEMPTS = 5;
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
  ) {}

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
    const phone = this.normalizePhone(rawPhone);
    if (!/^\d{6}$/.test(code ?? '')) throw new UnauthorizedException('קוד שגוי');

    // TODO: OTP verification is temporarily disabled — any 6-digit code logs in.
    // Uncomment the block below before going to production.
    //
    // const otp = await this.repo.findActiveOtp(phone);
    // if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) {
    //   throw new UnauthorizedException('הקוד פג תוקף, בקשו קוד חדש');
    // }
    //
    // if (otp.codeHash !== this.hashCode(phone, code)) {
    //   const attempts = await this.repo.recordFailedAttempt(otp.id);
    //   if (attempts >= OTP_MAX_ATTEMPTS) {
    //     throw new UnauthorizedException('הקוד פג תוקף, בקשו קוד חדש');
    //   }
    //   throw new UnauthorizedException('קוד שגוי');
    // }
    //
    // await this.repo.consumeOtp(otp.id);

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
