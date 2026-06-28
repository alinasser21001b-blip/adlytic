// ════════════════════════════════════════════════════════════════════════
//  src/services/activationWhatsappLink.ts
//
//  Pre-filled WhatsApp deep link for manual account activation (not billing).
//  Reuses SUPPORT_WHATSAPP_NUMBER sanitisation from whatsappLink.ts.
// ════════════════════════════════════════════════════════════════════════

import { getSupportWhatsappNumber } from './whatsappLink';

const WA_BASE = 'https://wa.me';

export interface ActivationWhatsappLinkResult {
  url: string;
  message: string;
}

export function buildActivationWhatsappLink(userEmail: string): ActivationWhatsappLinkResult {
  const number = getSupportWhatsappNumber();
  const message = `Hello, I want to activate my Adlytic account. My registered email is: ${userEmail}`;
  const url = `${WA_BASE}/${number}?text=${encodeURIComponent(message)}`;
  return { url, message };
}
