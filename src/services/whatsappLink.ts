// ════════════════════════════════════════════════════════════════════════
//  src/services/whatsappLink.ts
//
//  Builds the `wa.me/<number>?text=<prefilled>` deep-link the billing page
//  uses for the WhatsApp-manual payment path.
//
//  The pre-filled message carries `workspaceId` + the user's email so the
//  support agent knows who to credit without a back-and-forth.
//
//  E.164 normalisation: `wa.me` requires the phone number with no `+`, no
//  spaces, no dashes — only digits, country code first. We sanitise here
//  rather than trust env-var hygiene.
// ════════════════════════════════════════════════════════════════════════

const WA_BASE = 'https://wa.me';

export interface WhatsappLinkInput {
  workspaceId: string;
  userEmail: string;
}

export interface WhatsappLinkResult {
  url: string;
  /** The exact text inserted into the deep link, before URL encoding. */
  message: string;
}

/**
 * Reads `SUPPORT_WHATSAPP_NUMBER` from env and returns it sanitised to the
 * `wa.me` format (digits only). Throws when unset — callers should surface
 * a 503 so the billing page doesn't render a broken link.
 */
export function getSupportWhatsappNumber(): string {
  const raw = process.env['SUPPORT_WHATSAPP_NUMBER'];
  if (!raw || raw.trim().length === 0) {
    throw new Error('SUPPORT_WHATSAPP_NUMBER is not set');
  }
  // Strip everything except digits — handles "+964 770 ..." style input.
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8) {
    throw new Error(`SUPPORT_WHATSAPP_NUMBER appears malformed: "${raw}"`);
  }
  return digits;
}

export function buildWhatsappLink(input: WhatsappLinkInput): WhatsappLinkResult {
  const number = getSupportWhatsappNumber();
  const message = buildMessage(input);
  const url = `${WA_BASE}/${number}?text=${encodeURIComponent(message)}`;
  return { url, message };
}

/**
 * Arabic pre-filled message. Kept short so it displays cleanly on the WA
 * compose screen on mobile. The agent copies the workspaceId verbatim into
 * the manual-activation form.
 */
function buildMessage(input: WhatsappLinkInput): string {
  return [
    'مرحباً، أرغب بتفعيل اشتراك Adlytic لورشتي.',
    `🆔 رقم الورشة: ${input.workspaceId}`,
    `📧 بريدي: ${input.userEmail}`,
    '💳 طريقة الدفع المفضّلة: زين كاش / آسيا حوالة / تحويل بنكي',
  ].join('\n');
}
