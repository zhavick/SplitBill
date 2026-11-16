import { env } from '../../config/env.js';

export interface Notifier {
  sendEmail(to: string, subject: string, text: string): Promise<void>;
  /** `to` dalam format digit internasional, mis. 6281234567890. */
  sendWhatsAppOtp(to: string, code: string): Promise<void>;
}

/** Mode pengembangan: mencetak pesan ke log (dipakai saat API key belum diisi). */
export class ConsoleNotifier implements Notifier {
  async sendEmail(to: string, subject: string, text: string) {
    console.log(`[DEV EMAIL] to=${to} subject="${subject}"\n${text}`);
  }
  async sendWhatsAppOtp(to: string, code: string) {
    console.log(`[DEV WHATSAPP] to=${to} otp=${code}`);
  }
}

/** Untuk pengujian: menyimpan pesan di memori. */
export class MemoryNotifier implements Notifier {
  emails: { to: string; subject: string; text: string }[] = [];
  whatsapps: { to: string; code: string }[] = [];
  async sendEmail(to: string, subject: string, text: string) {
    this.emails.push({ to, subject, text });
  }
  async sendWhatsAppOtp(to: string, code: string) {
    this.whatsapps.push({ to, code });
  }
}

/** Resend (email) + Meta WhatsApp Cloud API. Channel tanpa kredensial jatuh ke ConsoleNotifier. */
export class GatewayNotifier implements Notifier {
  private readonly fallback = new ConsoleNotifier();

  async sendEmail(to: string, subject: string, text: string) {
    if (!env.RESEND_API_KEY) return this.fallback.sendEmail(to, subject, text);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_SENDER_ADDRESS, to: [to], subject, text }),
    });
    if (!res.ok) throw new Error(`Resend gagal (${res.status}): ${await res.text()}`);
  }

  async sendWhatsAppOtp(to: string, code: string) {
    if (!env.WA_PHONE_NUMBER_ID || !env.WA_API_TOKEN) return this.fallback.sendWhatsAppOtp(to, code);
    const res = await fetch(`https://graph.facebook.com/v21.0/${env.WA_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WA_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: env.WA_OTP_TEMPLATE,
          language: { code: env.WA_TEMPLATE_LANG },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: code }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
          ],
        },
      }),
    });
    if (!res.ok) throw new Error(`WhatsApp Cloud API gagal (${res.status}): ${await res.text()}`);
  }
}
