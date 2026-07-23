import type { PrismaClient, TicketCategory, TicketStatus, TicketPriority } from '@prisma/client';

// ── Auto-enrichment: capture customer context when ticket is created ────

export async function captureContext(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  clientInfo?: { userAgent?: string; language?: string },
): Promise<Record<string, unknown>> {
  const [user, workspace] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, locale: true, isActive: true,
        activatedAt: true, createdAt: true,
      },
    }),
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true, name: true, tier: true, subscriptionStatus: true,
        subscriptionExpiresAt: true, paymentMethod: true, createdAt: true,
        adAccounts: {
          select: {
            id: true, name: true, currency: true, status: true,
            lastSyncedAt: true, tokenExpiresAt: true,
            _count: { select: { campaigns: true } },
          },
        },
        _count: { select: { members: true, adAccounts: true } },
        metaConnections: {
          select: { id: true, status: true, businessName: true, lastValidatedAt: true },
          take: 3,
        },
      },
    }),
  ]);

  const adAccountIds = workspace?.adAccounts.map(a => a.id) ?? [];

  const [recentSyncs, campaignCount, recentErrors] = await Promise.all([
    adAccountIds.length
      ? prisma.syncJob.findMany({
          where: { adAccountId: { in: adAccountIds } },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { status: true, createdAt: true, completedAt: true, error: true },
        })
      : Promise.resolve([]),
    adAccountIds.length
      ? prisma.campaign.count({ where: { adAccountId: { in: adAccountIds } } })
      : Promise.resolve(0),
    adAccountIds.length
      ? prisma.syncJob.findMany({
          where: { adAccountId: { in: adAccountIds }, status: 'FAILED' },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { error: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  return {
    user: user ? {
      email: user.email, name: user.name, locale: user.locale,
      isActive: user.isActive, joinedAt: user.createdAt,
    } : null,
    workspace: workspace ? {
      name: workspace.name, tier: workspace.tier,
      subscriptionStatus: workspace.subscriptionStatus,
      subscriptionExpiresAt: workspace.subscriptionExpiresAt,
      paymentMethod: workspace.paymentMethod,
      memberCount: workspace._count.members,
      adAccountCount: workspace._count.adAccounts,
    } : null,
    meta: {
      connections: workspace?.metaConnections.map(c => ({
        status: c.status, businessName: c.businessName,
      })) ?? [],
      adAccounts: workspace?.adAccounts.map(a => ({
        name: a.name, currency: a.currency, status: a.status,
        lastSyncedAt: a.lastSyncedAt, campaignCount: a._count.campaigns,
        tokenExpired: a.tokenExpiresAt ? a.tokenExpiresAt < new Date() : null,
      })) ?? [],
    },
    activity: {
      campaignCount,
      recentSyncs: recentSyncs.map(s => ({ status: s.status, at: s.createdAt, error: s.error })),
      recentErrors: recentErrors.map(e => ({ error: e.error, at: e.createdAt })),
    },
    client: clientInfo ?? {},
    capturedAt: new Date().toISOString(),
  };
}

// ── Ticket CRUD ─────────────────────────────────────────────────────────

export interface CreateTicketInput {
  userId: string;
  workspaceId: string;
  category: TicketCategory;
  subject: string;
  message: string;
  priority?: TicketPriority;
  linkedEntityType?: string;
  linkedEntityId?: string;
  clientInfo?: { userAgent?: string; language?: string };
}

export async function createTicket(prisma: PrismaClient, input: CreateTicketInput) {
  const contextJson = await captureContext(prisma, input.userId, input.workspaceId, input.clientInfo);

  return prisma.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        category: input.category,
        subject: input.subject.trim(),
        priority: input.priority ?? 'NORMAL',
        contextJson: contextJson as any,
        linkedEntityType: input.linkedEntityType,
        linkedEntityId: input.linkedEntityId,
      },
    });

    await tx.supportMessage.create({
      data: {
        ticketId: ticket.id,
        senderId: input.userId,
        senderType: 'USER',
        content: input.message.trim(),
      },
    });

    return ticket;
  });
}

export interface ReplyInput {
  ticketId: string;
  senderId: string;
  senderType: 'USER' | 'ADMIN';
  content: string;
  isInternal?: boolean;
}

export async function replyToTicket(prisma: PrismaClient, input: ReplyInput) {
  return prisma.$transaction(async (tx) => {
    const msg = await tx.supportMessage.create({
      data: {
        ticketId: input.ticketId,
        senderId: input.senderId,
        senderType: input.senderType,
        content: input.content.trim(),
        isInternal: input.isInternal ?? false,
      },
    });

    const newStatus: TicketStatus = input.senderType === 'ADMIN'
      ? 'AWAITING_CUSTOMER'
      : 'OPEN';

    await tx.supportTicket.update({
      where: { id: input.ticketId },
      data: { status: newStatus },
    });

    return msg;
  });
}

export async function getTicketWithMessages(prisma: PrismaClient, ticketId: string, isAdmin: boolean) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      messages: {
        where: isAdmin ? {} : { isInternal: false },
        orderBy: { createdAt: 'asc' },
        include: {
          sender: { select: { id: true, name: true, email: true } },
        },
      },
      user: { select: { id: true, name: true, email: true, locale: true } },
      workspace: { select: { id: true, name: true, tier: true, subscriptionStatus: true } },
    },
  });
  return ticket;
}

// ── Admin listing and inbox ─────────────────────────────────────────────

export interface AdminTicketFilters {
  status?: TicketStatus | 'all';
  category?: TicketCategory | 'all';
  priority?: TicketPriority | 'all';
  q?: string;
  take?: number;
  skip?: number;
}

export async function adminListTickets(prisma: PrismaClient, filters: AdminTicketFilters = {}) {
  const take = Math.min(Math.max(filters.take ?? 50, 1), 200);
  const skip = Math.max(filters.skip ?? 0, 0);
  const q = (filters.q || '').trim();

  const where: Record<string, unknown> = {};
  if (filters.status && filters.status !== 'all') where.status = filters.status;
  if (filters.category && filters.category !== 'all') where.category = filters.category;
  if (filters.priority && filters.priority !== 'all') where.priority = filters.priority;
  if (q) {
    where.OR = [
      { subject: { contains: q, mode: 'insensitive' } },
      { user: { email: { contains: q, mode: 'insensitive' } } },
      { user: { name: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const [tickets, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where: where as any,
      orderBy: [
        { isPinned: 'desc' },
        { priority: 'desc' },
        { updatedAt: 'desc' },
      ],
      take,
      skip,
      include: {
        user: { select: { id: true, name: true, email: true } },
        workspace: { select: { id: true, name: true, tier: true, subscriptionStatus: true } },
        _count: { select: { messages: true } },
      },
    }),
    prisma.supportTicket.count({ where: where as any }),
  ]);

  return { tickets, total, take, skip };
}

export async function adminInboxCounts(prisma: PrismaClient) {
  const [open, awaiting, resolved, closed, urgent, starred, pinned] = await Promise.all([
    prisma.supportTicket.count({ where: { status: 'OPEN' } }),
    prisma.supportTicket.count({ where: { status: 'AWAITING_CUSTOMER' } }),
    prisma.supportTicket.count({ where: { status: 'RESOLVED' } }),
    prisma.supportTicket.count({ where: { status: 'CLOSED' } }),
    prisma.supportTicket.count({ where: { priority: 'URGENT', status: { in: ['OPEN', 'AWAITING_CUSTOMER'] } } }),
    prisma.supportTicket.count({ where: { isStarred: true } }),
    prisma.supportTicket.count({ where: { isPinned: true } }),
  ]);
  return { open, awaiting, resolved, closed, urgent, starred, pinned };
}

// ── Customer ticket listing ─────────────────────────────────────────────

export async function customerListTickets(prisma: PrismaClient, userId: string, workspaceId: string) {
  return prisma.supportTicket.findMany({
    where: { userId, workspaceId },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    select: {
      id: true, category: true, status: true, priority: true,
      subject: true, createdAt: true, updatedAt: true,
      _count: { select: { messages: true } },
    },
  });
}

// ── Ticket state mutations ──────────────────────────────────────────────

export async function updateTicketStatus(
  prisma: PrismaClient,
  ticketId: string,
  status: TicketStatus,
  closedBy?: string,
) {
  const data: Record<string, unknown> = { status };
  if (status === 'CLOSED' || status === 'RESOLVED') {
    data.closedAt = new Date();
    data.closedBy = closedBy ?? null;
  }
  return prisma.supportTicket.update({ where: { id: ticketId }, data: data as any });
}

export async function updateTicketPriority(prisma: PrismaClient, ticketId: string, priority: TicketPriority) {
  return prisma.supportTicket.update({ where: { id: ticketId }, data: { priority } });
}

export async function toggleTicketPin(prisma: PrismaClient, ticketId: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { isPinned: true } });
  if (!ticket) return null;
  return prisma.supportTicket.update({ where: { id: ticketId }, data: { isPinned: !ticket.isPinned } });
}

export async function toggleTicketStar(prisma: PrismaClient, ticketId: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { isStarred: true } });
  if (!ticket) return null;
  return prisma.supportTicket.update({ where: { id: ticketId }, data: { isStarred: !ticket.isStarred } });
}

export async function markMessagesRead(prisma: PrismaClient, ticketId: string, readByType: 'USER' | 'ADMIN') {
  const oppositeType = readByType === 'USER' ? 'ADMIN' : 'USER';
  await prisma.supportMessage.updateMany({
    where: { ticketId, senderType: oppositeType as any, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function getUnreadCount(prisma: PrismaClient, _forType: 'ADMIN') {
  return prisma.supportMessage.count({
    where: { senderType: 'USER', readAt: null, isInternal: false },
  });
}
