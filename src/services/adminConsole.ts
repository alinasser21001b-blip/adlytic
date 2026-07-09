// ════════════════════════════════════════════════════════════════════════
//  src/services/adminConsole.ts
//
//  Platform-owner customer lifecycle: create accounts, list/search
//  customers, edit users, reset passwords, and aggregate activity.
//  All mutations are intended for requirePlatformAdmin routes only.
// ════════════════════════════════════════════════════════════════════════

import type { PrismaClient, Locale, SubscriptionTier } from '@prisma/client';
import { hashPassword } from './jwtAuth';
import { activateManual } from './subscriptionService';

export interface CreateCustomerInput {
  email: string;
  name: string;
  password: string;
  workspaceName: string;
  locale?: Locale;
  /** Admin-created accounts are active by default. */
  activateAccount?: boolean;
  /** Optionally grant Premium immediately. */
  grantPremium?: boolean;
  premiumExpiresAt?: Date;
  premiumNote?: string;
  triggeredBy: string;
}

export interface CreateCustomerResult {
  user: { id: string; email: string; name: string; isActive: boolean };
  workspace: { id: string; name: string; tier: string; subscriptionStatus: string };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createCustomer(
  prisma: PrismaClient,
  input: CreateCustomerInput,
): Promise<CreateCustomerResult> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  const workspaceName = input.workspaceName.trim() || `${name}'s Workspace`;
  const password = input.password;
  if (!email || !email.includes('@')) throw new Error('INVALID_EMAIL');
  if (!name) throw new Error('INVALID_NAME');
  if (!password || password.length < 8) throw new Error('WEAK_PASSWORD');

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new Error('EMAIL_TAKEN');

  const passwordHash = await hashPassword(password);
  const activateAccount = input.activateAccount !== false;

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name,
        passwordHash,
        locale: input.locale === 'EN' ? 'EN' : 'AR',
        isActive: activateAccount,
        activatedAt: activateAccount ? new Date() : null,
        activatedBy: activateAccount ? input.triggeredBy : null,
      },
      select: { id: true, email: true, name: true, isActive: true },
    });
    const workspace = await tx.workspace.create({
      data: {
        name: workspaceName,
        tier: 'FREE',
        subscriptionStatus: 'INACTIVE',
      },
      select: { id: true, name: true, tier: true, subscriptionStatus: true },
    });
    await tx.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: 'OWNER',
      },
    });
    return { user, workspace };
  });

  if (input.grantPremium && input.premiumExpiresAt) {
    await activateManual(prisma, {
      workspaceId: created.workspace.id,
      tier: 'PREMIUM',
      expiresAt: input.premiumExpiresAt,
      note: input.premiumNote ?? 'Granted on account creation',
      triggeredBy: input.triggeredBy,
    });
    const ws = await prisma.workspace.findUnique({
      where: { id: created.workspace.id },
      select: { id: true, name: true, tier: true, subscriptionStatus: true },
    });
    return { user: created.user, workspace: ws! };
  }

  return created;
}

export interface CustomerListFilters {
  q?: string;
  status?: 'active' | 'pending' | 'all';
  tier?: 'FREE' | 'PREMIUM' | 'all';
  take?: number;
  skip?: number;
}

export async function listCustomers(prisma: PrismaClient, filters: CustomerListFilters = {}) {
  const take = Math.min(Math.max(filters.take ?? 50, 1), 200);
  const skip = Math.max(filters.skip ?? 0, 0);
  const q = (filters.q || '').trim();

  const users = await prisma.user.findMany({
    where: {
      ...(filters.status === 'active' ? { isActive: true } : {}),
      ...(filters.status === 'pending' ? { isActive: false } : {}),
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take,
    skip,
    select: {
      id: true,
      email: true,
      name: true,
      locale: true,
      isActive: true,
      activatedAt: true,
      createdAt: true,
      memberships: {
        select: {
          role: true,
          workspace: {
            select: {
              id: true,
              name: true,
              tier: true,
              subscriptionStatus: true,
              subscriptionExpiresAt: true,
              paymentMethod: true,
              adAccounts: {
                select: {
                  id: true,
                  name: true,
                  currency: true,
                  status: true,
                  lastSyncedAt: true,
                },
                take: 5,
              },
              _count: { select: { adAccounts: true, members: true } },
            },
          },
        },
      },
    },
  });

  const total = await prisma.user.count({
    where: {
      ...(filters.status === 'active' ? { isActive: true } : {}),
      ...(filters.status === 'pending' ? { isActive: false } : {}),
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
  });

  let rows = users.map((u) => {
    const workspaces = u.memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      role: m.role,
      tier: m.workspace.tier,
      subscriptionStatus: m.workspace.subscriptionStatus,
      subscriptionExpiresAt: m.workspace.subscriptionExpiresAt,
      paymentMethod: m.workspace.paymentMethod,
      adAccountCount: m.workspace._count.adAccounts,
      memberCount: m.workspace._count.members,
      adAccounts: m.workspace.adAccounts,
    }));
    const hasPremium = workspaces.some((w) => w.tier === 'PREMIUM' && w.subscriptionStatus === 'ACTIVE');
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      locale: u.locale,
      isActive: u.isActive,
      activatedAt: u.activatedAt,
      createdAt: u.createdAt,
      hasPremium,
      workspaces,
    };
  });

  if (filters.tier === 'PREMIUM') rows = rows.filter((r) => r.hasPremium);
  if (filters.tier === 'FREE') rows = rows.filter((r) => !r.hasPremium);

  return { customers: rows, total, take, skip };
}

export async function getCustomerDetail(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      locale: true,
      isActive: true,
      activatedAt: true,
      activatedBy: true,
      createdAt: true,
      updatedAt: true,
      memberships: {
        select: {
          role: true,
          createdAt: true,
          workspace: {
            select: {
              id: true,
              name: true,
              tier: true,
              subscriptionStatus: true,
              subscriptionExpiresAt: true,
              paymentMethod: true,
              stripeCustomerId: true,
              stripeSubscriptionId: true,
              createdAt: true,
              adAccounts: {
                select: {
                  id: true,
                  name: true,
                  currency: true,
                  status: true,
                  lastSyncedAt: true,
                  externalAccountId: true,
                },
              },
              paymentEvents: {
                orderBy: { createdAt: 'desc' },
                take: 20,
                select: {
                  id: true,
                  eventType: true,
                  source: true,
                  tierAfter: true,
                  note: true,
                  externalRef: true,
                  amountMinor: true,
                  currency: true,
                  createdAt: true,
                  triggeredBy: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!user) return null;

  const workspaceIds = user.memberships.map((m) => m.workspace.id);
  const adAccountIds = user.memberships.flatMap((m) => m.workspace.adAccounts.map((a) => a.id));

  const [recentSyncs, recentAi, campaignCount] = await Promise.all([
    workspaceIds.length
      ? prisma.syncJob.findMany({
          where: { adAccount: { workspaceId: { in: workspaceIds } } },
          orderBy: { createdAt: 'desc' },
          take: 15,
          select: {
            id: true,
            status: true,
            createdAt: true,
            completedAt: true,
            error: true,
            adAccount: { select: { id: true, name: true, workspaceId: true } },
          },
        })
      : Promise.resolve([]),
    workspaceIds.length
      ? prisma.aiConversation.findMany({
          where: { workspaceId: { in: workspaceIds } },
          orderBy: { updatedAt: 'desc' },
          take: 10,
          select: {
            id: true,
            workspaceId: true,
            title: true,
            createdAt: true,
            updatedAt: true,
            _count: { select: { messages: true } },
          },
        })
      : Promise.resolve([]),
    adAccountIds.length
      ? prisma.campaign.count({ where: { adAccountId: { in: adAccountIds } } })
      : Promise.resolve(0),
  ]);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      locale: user.locale,
      isActive: user.isActive,
      activatedAt: user.activatedAt,
      activatedBy: user.activatedBy,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    workspaces: user.memberships.map((m) => ({
      role: m.role,
      joinedAt: m.createdAt,
      ...m.workspace,
    })),
    activity: {
      campaignCount,
      recentSyncs,
      recentAi,
    },
  };
}

export async function updateCustomerUser(
  prisma: PrismaClient,
  userId: string,
  patch: { name?: string; email?: string; locale?: Locale },
) {
  const data: { name?: string; email?: string; locale?: Locale } = {};
  if (patch.name != null) {
    const name = patch.name.trim();
    if (!name) throw new Error('INVALID_NAME');
    data.name = name;
  }
  if (patch.email != null) {
    const email = normalizeEmail(patch.email);
    if (!email.includes('@')) throw new Error('INVALID_EMAIL');
    const clash = await prisma.user.findFirst({
      where: { email, NOT: { id: userId } },
      select: { id: true },
    });
    if (clash) throw new Error('EMAIL_TAKEN');
    data.email = email;
  }
  if (patch.locale === 'EN' || patch.locale === 'AR') data.locale = patch.locale;

  return prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, email: true, name: true, locale: true, isActive: true },
  });
}

export async function setCustomerActive(
  prisma: PrismaClient,
  userId: string,
  isActive: boolean,
  adminUserId: string,
) {
  return prisma.user.update({
    where: { id: userId },
    data: isActive
      ? { isActive: true, activatedAt: new Date(), activatedBy: adminUserId }
      : { isActive: false },
    select: { id: true, email: true, name: true, isActive: true, activatedAt: true },
  });
}

export async function adminResetPassword(
  prisma: PrismaClient,
  userId: string,
  newPassword: string,
) {
  if (!newPassword || newPassword.length < 8) throw new Error('WEAK_PASSWORD');
  const passwordHash = await hashPassword(newPassword);
  return prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      tokenVersion: { increment: 1 },
    },
    select: { id: true, email: true, name: true },
  });
}

export async function listSubscriptions(prisma: PrismaClient, take = 100) {
  const workspaces = await prisma.workspace.findMany({
    orderBy: { updatedAt: 'desc' },
    take: Math.min(take, 200),
    select: {
      id: true,
      name: true,
      tier: true,
      subscriptionStatus: true,
      subscriptionExpiresAt: true,
      paymentMethod: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      updatedAt: true,
      members: {
        where: { role: 'OWNER' },
        take: 1,
        select: {
          user: { select: { id: true, email: true, name: true, isActive: true } },
        },
      },
      _count: { select: { adAccounts: true } },
    },
  });
  return workspaces.map((w) => ({
    id: w.id,
    name: w.name,
    tier: w.tier,
    subscriptionStatus: w.subscriptionStatus,
    subscriptionExpiresAt: w.subscriptionExpiresAt,
    paymentMethod: w.paymentMethod,
    stripeCustomerId: w.stripeCustomerId,
    stripeSubscriptionId: w.stripeSubscriptionId,
    updatedAt: w.updatedAt,
    adAccountCount: w._count.adAccounts,
    owner: w.members[0]?.user ?? null,
  }));
}

export async function listRecentPaymentEvents(prisma: PrismaClient, take = 50) {
  return prisma.paymentEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(take, 100),
    select: {
      id: true,
      eventType: true,
      source: true,
      tierAfter: true,
      note: true,
      externalRef: true,
      amountMinor: true,
      currency: true,
      createdAt: true,
      triggeredBy: true,
      workspace: { select: { id: true, name: true } },
    },
  });
}

export async function adminOverview(prisma: PrismaClient) {
  const since7d = new Date(Date.now() - 7 * 864e5);
  const [
    usersTotal,
    usersActive,
    usersPending,
    workspacesTotal,
    premiumActive,
    syncs7d,
    aiConvos7d,
    paymentEvents7d,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.count({ where: { isActive: false } }),
    prisma.workspace.count(),
    prisma.workspace.count({ where: { tier: 'PREMIUM', subscriptionStatus: 'ACTIVE' } }),
    prisma.syncJob.count({ where: { createdAt: { gte: since7d } } }),
    prisma.aiConversation.count({ where: { createdAt: { gte: since7d } } }),
    prisma.paymentEvent.count({ where: { createdAt: { gte: since7d } } }),
  ]);
  return {
    usersTotal,
    usersActive,
    usersPending,
    workspacesTotal,
    premiumActive,
    syncs7d,
    aiConvos7d,
    paymentEvents7d,
  };
}

export type { SubscriptionTier };
