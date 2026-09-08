import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsService } from './settings.service.js';

function makeDb() {
  return {
    setting: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  };
}

describe('SettingsService', () => {
  let db: ReturnType<typeof makeDb>;
  let service: SettingsService;

  beforeEach(() => {
    db = makeDb();
    service = new SettingsService(db as never);
  });

  it('returns the stored value', async () => {
    db.setting.findUnique.mockResolvedValue({
      key: 'sms.driver',
      value: 'twilio',
    });
    await expect(service.get('sms.driver')).resolves.toBe('twilio');
  });

  it('returns null when the key is missing', async () => {
    db.setting.findUnique.mockResolvedValue(null);
    await expect(service.get('missing')).resolves.toBeNull();
  });

  it('maps getMany rows to a key/value object', async () => {
    db.setting.findMany.mockResolvedValue([
      { key: 'twilio.api_key', value: 'SK1' },
      { key: 'twilio.api_secret', value: 'secret' },
    ]);
    await expect(
      service.getMany(['twilio.api_key', 'twilio.api_secret']),
    ).resolves.toEqual({
      'twilio.api_key': 'SK1',
      'twilio.api_secret': 'secret',
    });
  });

  it('queries only the requested keys', async () => {
    db.setting.findMany.mockResolvedValue([]);
    await service.getMany(['twilio.api_key', 'twilio.api_secret']);
    expect(db.setting.findMany).toHaveBeenCalledWith({
      where: { key: { in: ['twilio.api_key', 'twilio.api_secret'] } },
    });
  });

  it('returns an empty object for no stored values', async () => {
    db.setting.findMany.mockResolvedValue([]);
    await expect(service.getMany(['missing'])).resolves.toEqual({});
  });

  it('upserts a setting for both create and credential rotation paths', async () => {
    db.setting.upsert.mockResolvedValue({ key: 'sms.driver', value: 'twilio' });
    await expect(service.set('sms.driver', 'twilio')).resolves.toBeUndefined();
    expect(db.setting.upsert).toHaveBeenCalledWith({
      where: { key: 'sms.driver' },
      create: { key: 'sms.driver', value: 'twilio' },
      update: { value: 'twilio' },
    });
  });

  it('does not swallow a failed settings write', async () => {
    db.setting.upsert.mockRejectedValue(new Error('owner connection down'));
    await expect(service.set('sms.driver', '019')).rejects.toThrow(
      'owner connection down',
    );
  });
});
