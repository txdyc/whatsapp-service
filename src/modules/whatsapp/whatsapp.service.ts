import crypto from 'node:crypto';

interface WhatsAppServiceDeps {
  apiToken: string;
  phoneNumberId: string;
  post: (url: string, data: unknown, config: unknown) => Promise<unknown>;
}

export class WhatsAppService {
  private apiToken: string;
  private phoneNumberId: string;
  private post: WhatsAppServiceDeps['post'];
  private baseUrl: string;

  constructor(deps: WhatsAppServiceDeps) {
    this.apiToken = deps.apiToken;
    this.phoneNumberId = deps.phoneNumberId;
    this.post = deps.post;
    this.baseUrl = `https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`;
  }

  async sendTextMessage(to: string, body: string): Promise<void> {
    await this.post(
      this.baseUrl,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
  }

  static verifySignature(appSecret: string, rawBody: string, signatureHeader: string): boolean {
    const expectedSignature =
      'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signatureHeader)
    );
  }
}
