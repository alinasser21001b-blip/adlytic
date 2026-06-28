// ════════════════════════════════════════════════════════════════════════
//  src/services/accountAccess.ts
//
//  Manual WhatsApp activation gate. Inactive users may only use auth flows,
//  the pending-activation page, and the activation WhatsApp deep link.
// ════════════════════════════════════════════════════════════════════════

import type { PrismaClient } from '@prisma/client';

export const ACCOUNT_INACTIVE_BODY = {
  error: 'Account pending activation',
  code: 'ACCOUNT_INACTIVE',
  redirect: '/pending-activation',
} as const;

export function isUserActive(user: { isActive: boolean } | null | undefined): boolean {
  return user?.isActive === true;
}

export type ActiveUserGuardResult =
  | { ok: true; userId: string }
  | { ok: false; response: { status: number; body: typeof ACCOUNT_INACTIVE_BODY | { error: string } } };

/**
 * Verify the user exists and has been manually activated by platform support.
 */
export async function requireActiveUser(
  prisma: PrismaClient,
  userId: string | null,
): Promise<ActiveUserGuardResult> {
  if (!userId) {
    return { ok: false, response: { status: 401, body: { error: 'Unauthorized' } } };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true },
  });
  if (!user) {
    return { ok: false, response: { status: 401, body: { error: 'Unauthorized' } } };
  }
  if (!isUserActive(user)) {
    return { ok: false, response: { status: 403, body: ACCOUNT_INACTIVE_BODY } };
  }

  return { ok: true, userId };
}
