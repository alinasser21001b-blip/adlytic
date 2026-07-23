import type { PrismaClient } from '@prisma/client';

export interface PlatformSettingRow {
  key: string;
  value: string;
  valueType: string;
  group: string;
  label: string | null;
  description: string | null;
  updatedAt: Date;
  updatedBy: string | null;
}

const DEFAULTS: Record<string, { value: string; valueType: string; group: string; label: string; description: string }> = {
  'sync.intervalMinutes': { value: '60', valueType: 'number', group: 'sync', label: 'Sync interval (min)', description: 'Minutes between automatic Meta data syncs' },
  'sync.backfillDays': { value: '28', valueType: 'number', group: 'sync', label: 'Backfill window (days)', description: 'How many days back to pull data on each sync' },
  'sync.maxConcurrent': { value: '3', valueType: 'number', group: 'sync', label: 'Max concurrent syncs', description: 'Maximum number of ad accounts syncing in parallel' },
  'limits.maxAdAccountsPerWorkspace': { value: '5', valueType: 'number', group: 'limits', label: 'Max ad accounts/workspace', description: 'Maximum ad accounts a single workspace can connect' },
  'limits.maxAiConversationsPerDay': { value: '50', valueType: 'number', group: 'limits', label: 'AI conversations/day', description: 'Maximum AI conversations a workspace can start per day' },
  'features.aiAssistantEnabled': { value: 'true', valueType: 'boolean', group: 'features', label: 'AI Assistant', description: 'Enable the AI Smart CMO assistant for all users' },
  'features.brainEnabled': { value: 'true', valueType: 'boolean', group: 'features', label: 'Campaign Brain', description: 'Enable the campaign brain scoring/analysis engine' },
  'features.breakdownSyncEnabled': { value: 'true', valueType: 'boolean', group: 'features', label: 'Breakdown sync', description: 'Enable demographic/platform breakdown data syncing' },
  'features.maintenanceMode': { value: 'false', valueType: 'boolean', group: 'features', label: 'Maintenance mode', description: 'Show maintenance banner and disable write operations' },
};

export async function listSettings(prisma: PrismaClient, group?: string): Promise<PlatformSettingRow[]> {
  return prisma.platformSetting.findMany({
    where: group ? { group } : undefined,
    orderBy: [{ group: 'asc' }, { key: 'asc' }],
  });
}

export async function getSetting(prisma: PrismaClient, key: string): Promise<string | null> {
  const row = await prisma.platformSetting.findUnique({ where: { key } });
  if (row) return row.value;
  return DEFAULTS[key]?.value ?? null;
}

export async function getSettingTyped<T = string>(prisma: PrismaClient, key: string): Promise<T | null> {
  const raw = await getSetting(prisma, key);
  if (raw === null) return null;
  const def = DEFAULTS[key];
  const type = def?.valueType ?? 'string';
  if (type === 'number') return Number(raw) as T;
  if (type === 'boolean') return (raw === 'true') as T;
  return raw as T;
}

export async function upsertSetting(
  prisma: PrismaClient,
  key: string,
  value: string,
  updatedBy: string,
  meta?: { label?: string; description?: string; group?: string; valueType?: string },
): Promise<PlatformSettingRow> {
  const def = DEFAULTS[key];
  return prisma.platformSetting.upsert({
    where: { key },
    update: {
      value,
      updatedBy,
      ...(meta?.label != null ? { label: meta.label } : {}),
      ...(meta?.description != null ? { description: meta.description } : {}),
    },
    create: {
      key,
      value,
      valueType: meta?.valueType ?? def?.valueType ?? 'string',
      group: meta?.group ?? def?.group ?? 'general',
      label: meta?.label ?? def?.label ?? key,
      description: meta?.description ?? def?.description ?? null,
      updatedBy,
    },
  });
}

export async function deleteSetting(prisma: PrismaClient, key: string): Promise<boolean> {
  try {
    await prisma.platformSetting.delete({ where: { key } });
    return true;
  } catch {
    return false;
  }
}

export async function seedDefaults(prisma: PrismaClient, triggeredBy: string): Promise<number> {
  let count = 0;
  for (const [key, def] of Object.entries(DEFAULTS)) {
    const existing = await prisma.platformSetting.findUnique({ where: { key } });
    if (!existing) {
      await prisma.platformSetting.create({
        data: {
          key,
          value: def.value,
          valueType: def.valueType,
          group: def.group,
          label: def.label,
          description: def.description,
          updatedBy: triggeredBy,
        },
      });
      count++;
    }
  }
  return count;
}

export { DEFAULTS as SETTING_DEFAULTS };
