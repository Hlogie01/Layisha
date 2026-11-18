import "server-only";

/**
 * WhatsApp messaging.
 *
 * Two modes:
 * 1. Automatic: if WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are set,
 *    messages are sent through Meta's WhatsApp Cloud API using an approved
 *    message template.
 * 2. Manual (default, free): we build a wa.me "click to chat" link with the
 *    message pre-filled. The dispatcher taps it and presses send in their own
 *    WhatsApp. Good enough for pilots, before a WhatsApp Business account is set up.
 */

export function whatsappApiConfigured() {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/** wa.me link that opens a chat with the message typed in, ready to send. */
export function waMeLink(toE164: string, message: string) {
  return `https://wa.me/${toE164.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}

export function locationRequestMessage(args: {
  customerFirstName: string;
  businessName: string;
  orderReference?: string | null;
  link: string;
}) {
  const order = args.orderReference ? ` for order ${args.orderReference}` : "";
  return (
    `Hi ${args.customerFirstName}, this is ${args.businessName}. ` +
    `We're preparing your delivery${order}. ` +
    `Please tap this link to share your location so our driver finds you first time:\n${args.link}`
  );
}

/**
 * Sends the location request through the WhatsApp Cloud API.
 *
 * Needs an approved template (name in WHATSAPP_LOCATION_TEMPLATE, default
 * "location_request") with three body variables:
 *   {{1}} customer first name, {{2}} business name, {{3}} link.
 */
export async function sendLocationRequestTemplate(args: {
  toE164: string;
  customerFirstName: string;
  businessName: string;
  link: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return { ok: false, error: "WhatsApp API is not configured" };

  const version = process.env.WHATSAPP_API_VERSION ?? "v21.0";
  const template = process.env.WHATSAPP_LOCATION_TEMPLATE ?? "location_request";
  const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? "en";

  const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: args.toE164.replace(/\D/g, ""),
      type: "template",
      template: {
        name: template,
        language: { code: language },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: args.customerFirstName },
              { type: "text", text: args.businessName },
              { type: "text", text: args.link },
            ],
          },
        ],
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, error: `WhatsApp API error ${res.status}: ${detail.slice(0, 200)}` };
  }
  return { ok: true };
}
