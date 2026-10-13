import { randomUUID, createHash } from 'node:crypto';
import Midtrans from 'midtrans-client';
import { env } from '../../../config/env.js';
import { BadRequest, Conflict } from '../../../lib/http.js';
import { PaymentProvider, InitiatePaymentInput, InitiatePaymentResult, WebhookVerificationResult } from './payment-provider.interface.js';

// Use the default export as per midtrans-client package structure
const midtransClient = Midtrans as any;

export class MidtransProvider implements PaymentProvider {
  readonly name = 'midtrans';
  readonly supportedMethods = [
    'qris', 'gopay', 'ovo', 'dana', 'linkaja', 'shopeepay', 
    'virtual_account', 'credit_card', 'apple_pay', 'google_pay'
  ];

  private readonly snapClient: any;
  private readonly coreClient: any;

  // Private constructor for factory method
  private constructor(
    snapClient: any,
    coreClient: any
  ) {
    this.snapClient = snapClient;
    this.coreClient = coreClient;
  }

  static async create(): Promise<MidtransProvider> {
    if (!env.MIDTRANS_SERVER_KEY || !env.MIDTRANS_CLIENT_KEY) {
      throw new Error('Midtrans credentials not configured');
    }
    
    const snapClient = new midtransClient.Snap({
      isProduction: env.MIDTRANS_IS_PRODUCTION,
      serverKey: env.MIDTRANS_SERVER_KEY,
      clientKey: env.MIDTRANS_CLIENT_KEY,
    });
    const coreClient = new midtransClient.CoreApi({
      isProduction: env.MIDTRANS_IS_PRODUCTION,
      serverKey: env.MIDTRANS_SERVER_KEY,
      clientKey: env.MIDTRANS_CLIENT_KEY,
    });
    
    return new MidtransProvider(snapClient, coreClient);
  }

  async initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
      const itemDetails = [{
        id: input.orderId,
        price: input.amount,
        quantity: 1,
        name: `Order ${input.orderId}`,
      }];

      // Build customerDetails only with non-empty values (Midtrans rejects empty email/phone)
      const customerDetails: Record<string, string> = {};
      if (input.customerEmail?.trim()) customerDetails.email = input.customerEmail.trim();
      if (input.customerPhone?.trim()) customerDetails.phone = input.customerPhone.trim();
      if (input.customerName?.trim()) customerDetails.first_name = input.customerName.trim();

      const transactionDetails = {
        order_id: input.orderId,
        gross_amount: input.amount,
      };

      try {
        const snapResponse = await this.snapClient.createTransaction({
          transaction_details: transactionDetails,
          item_details: itemDetails,
          customer_details: Object.keys(customerDetails).length > 0 ? customerDetails : undefined,
          enabled_payments: [input.method],
          callbacks: {
            finish: input.callbackUrl,
          },
        });

        return {
          paymentId: snapResponse.token || randomUUID(),
          provider: this.name,
          paymentUrl: snapResponse.redirect_url,
          token: snapResponse.token,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          rawResponse: snapResponse as unknown as Record<string, unknown>,
        };
      } catch (error: any) {
        if (error?.statusCode === 400 && error?.ApiResponse?.error_messages?.some?.((m: string) => m.includes('duplicate'))) {
          throw Conflict('Transaksi sudah ada untuk order ini');
        }
        throw BadRequest(`Midtrans error: ${error?.message || error?.ApiResponse?.error_messages?.[0] || 'Unknown error'}`);
      }
    }

  verifyWebhook(payload: Record<string, unknown>, _signature: string | undefined): WebhookVerificationResult {
    const signatureKey = String(payload.signature_key ?? '');
    if (!signatureKey) {
      throw BadRequest('Missing signature_key in payload');
    }

    const serverKey = env.MIDTRANS_SERVER_KEY;
    if (!serverKey) {
      throw BadRequest('Midtrans server key not configured');
    }
    const orderId = String(payload.order_id ?? '');
    const statusCode = String(payload.status_code ?? '');
    const grossAmount = String(payload.gross_amount ?? '');

    // Midtrans uses plain SHA512 (not HMAC): SHA512(order_id + status_code + gross_amount + ServerKey)
    const expectedSignature = createHash('sha512')
      .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
      .digest('hex');

    // Use timing-safe comparison
    const sigBuf = Buffer.from(signatureKey, 'hex');
    const expBuf = Buffer.from(expectedSignature, 'hex');
    if (sigBuf.length !== expBuf.length || !sigBuf.equals(expBuf)) {
      throw BadRequest('Invalid signature');
    }

    const transactionId = String(payload.transaction_id ?? '');
    if (!transactionId) {
      throw BadRequest('Missing transaction_id in payload');
    }

    const statusMap: Record<string, WebhookVerificationResult['status']> = {
      settlement: 'settlement',
      capture: 'capture',
      deny: 'deny',
      cancel: 'cancel',
      expire: 'expire',
      pending: 'pending',
      failure: 'failure',
    };

    const transactionStatus = String(payload.transaction_status ?? '');
    const mappedStatus = statusMap[transactionStatus] ?? 'pending';

    return {
      success: ['settlement', 'capture'].includes(mappedStatus),
      transactionId,
      orderId: String(payload.order_id ?? ''),
      status: mappedStatus,
      amount: Number(payload.gross_amount ?? 0),
      provider: 'midtrans',
      method: String(payload.payment_type ?? ''),
      rawPayload: payload,
    };
  }

  async isHealthy(): Promise<boolean> {
    try {
      // Use a dummy transaction ID for health check
      await this.coreClient.getTransactionStatus('health-check');
      return true;
    } catch {
      return false;
    }
  }
}

export async function createMidtransProvider(): Promise<PaymentProvider> {
  return await MidtransProvider.create();
}