import { Injectable } from '@nestjs/common';
import { PrismaAdminService } from '../database/prisma-admin.service.js';

export const SETTING_SMS_DRIVER = 'sms.driver';
export const SETTING_TWILIO_ACCOUNT_SID = 'twilio.account_sid';
export const SETTING_TWILIO_API_KEY = 'twilio.api_key';
export const SETTING_TWILIO_API_SECRET = 'twilio.api_secret';
export const SETTING_TWILIO_VERIFY_SERVICE_SID = 'twilio.verify_service_sid';
export const SETTING_TWILIO_WHATSAPP_FROM = 'twilio.whatsapp_from';

@Injectable()
export class SettingsService {
  constructor(private readonly db: PrismaAdminService) {}

  async get(key: string): Promise<string | null> {
    const row = await this.db.setting.findUnique({ where: { key } });
    return row?.value ?? null;
  }

  async getMany(keys: string[]): Promise<Record<string, string>> {
    const rows = await this.db.setting.findMany({
      where: { key: { in: keys } },
    });
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }

  async set(key: string, value: string): Promise<void> {
    await this.db.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
}
