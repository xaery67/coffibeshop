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

  /**
   * Map internal payment method ke Snap channel Midtrans.
   * Midtrans Snap memakai channel ID yang BEDA dari enum internal kita.
   * Empiris live: qris→other_qris, virtual_account→bank_transfer.
   * Channel lain (gopay, shopeepay, dll) pass-through.
   */
  static toSnapChannel(method: string): string {
    const map: Record<string, string> = {
      qris: 'other_qris',
      virtual_account: 'bank_transfer',
    };
    return map[method] ?? method;
  }

  /**
   * Generate unique provider_order_id untuk Midtrans.
   *
   * Midtrans **mengunci `order_id` per transaksi** → tiap percobaan (termasuk
   * ganti metode / retry) WAJIB memakai ID baru. ID internal order (UUID) tidak
   * boleh dipakai mentah, karena transaksi pertama akan "memakan" ID tersebut.
   *
   * Batasan keras Midtrans: panjang `order_id` **maks 50 karakter** (terverifikasi
   * live — 51 karakter ditolak `transaction_details.order_id is too long`).
   * Format di sini ≤ 38 karakter pada kasus terburuk (method `virtual_account`).
   */
  private generateProviderOrderId(input: InitiatePaymentInput): string {
    const orderPrefix = input.orderId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    const suffix = `${input.method}-${Date.now().toString(36)}-${randomUUID().slice(0, 4)}`;
    // Jaga-jaga: potong agar tidak pernah melewati batas 50 karakter Midtrans.
    return `${orderPrefix}-${suffix}`.slice(0, 50);
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

    // Generate unique provider_order_id for this attempt
    const providerOrderId = this.generateProviderOrderId(input);

    // Map internal method ke Snap channel Midtrans
    const snapChannel = MidtransProvider.toSnapChannel(input.method);

    const transactionDetails = {
      order_id: providerOrderId,
      gross_amount: input.amount,
    };

    try {
      const snapResponse = await this.snapClient.createTransaction({
        transaction_details: transactionDetails,
        item_details: itemDetails,
        customer_details: Object.keys(customerDetails).length > 0 ? customerDetails : undefined,
        enabled_payments: [snapChannel],
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
        rawResponse: {
          ...(snapResponse as unknown as Record<string, unknown>),
          // Include our provider_order_id so we can map it back
          _our_provider_order_id: providerOrderId,
        },
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

  /**
   * Tarik status transaksi langsung dari Midtrans CoreAPI.
   *
   * Bila transaksi ditemukan (200), status_code dan gross_amount tersedia;
   * bila 404 transaksi belum ada → null (tunggu pembayaran).
   * Dokumentasi Midtrans: GET /v2/{order_id}/status.
   */
  async fetchTransactionStatus(providerOrderId: string): Promise<WebhookVerificationResult | null> {
    try {
      const raw = await this.coreClient.getTransactionStatus(providerOrderId);
      // Midtrans mengembalikan objek berisi order_id, transaction_id, transaction_status, status_code, gross_amount, payment_type.
      if (!raw || typeof raw !== 'object') return null;

      const payload: Record<string, unknown> = {
        order_id: raw.order_id ?? providerOrderId,
        transaction_id: raw.transaction_id,
        transaction_status: raw.transaction_status,
        status_code: raw.status_code,
        gross_amount: raw.gross_amount,
        payment_type: raw.payment_type,
      };
      // Midtrans CORE status notification TIDAK mengirim signature_key; bypass verifyWebhook.
      const status = String(raw.transaction_status ?? '');
      const success = status === 'settlement' || status === 'capture';
      return {
        success,
        transactionId: String(raw.transaction_id ?? ''),
        orderId: providerOrderId,
        status: (success ? 'settlement' : status) as WebhookVerificationResult['status'],
        amount: Number(raw.gross_amount ?? 0),
        provider: this.name,
        method: String(raw.payment_type ?? ''),
        rawPayload: payload,
      };
    } catch (error: any) {
      const statusCode = error?.statusCode ?? error?.httpStatusCode ?? 0;
      // 404 = order_id belum dikenali (belum ada transaksi); bukan error.
      if (statusCode === 404 || statusCode === '404' || /not found/i.test(error?.message ?? '')) {
        return null;
      }
      throw BadRequest(`Midtrans status check failed: ${error?.message ?? 'Unknown error'}`);
    }
  }
}

export async function createMidtransProvider(): Promise<PaymentProvider> {
  return await MidtransProvider.create();
}