import { PaymentMethod } from '@coffibeshop/shared';

export interface InitiatePaymentInput {
  orderId: string;
  amount: number;
  method: PaymentMethod;
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface InitiatePaymentResult {
  paymentId: string;
  provider: string;
  paymentUrl: string;
  token?: string;
  expiresAt: Date;
  rawResponse?: Record<string, unknown>;
}

export interface WebhookVerificationResult {
  success: boolean;
  transactionId: string;
  orderId: string;
  status: 'settlement' | 'capture' | 'deny' | 'cancel' | 'expire' | 'pending' | 'failure';
  amount: number;
  provider: string;
  method: string;
  rawPayload: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: string;
  readonly supportedMethods: string[];

  initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  verifyWebhook(payload: Record<string, unknown>, signature: string | undefined): WebhookVerificationResult;
  isHealthy(): Promise<boolean>;

  /**
   * Tarik status transaksi LANGSUNG dari gateway (bukan dari payload webhook).
   *
   * Dipakai sebagai **aksi lanjutan** pasca-bayar: webhook Midtrans tidak selalu
   * sampai (mis. dev tanpa tunnel publik), sehingga order nyangkut `PENDING`.
   * `null` = provider tak mengenali `providerOrderId` (transaksi belum ada).
   */
  fetchTransactionStatus?(providerOrderId: string): Promise<WebhookVerificationResult | null>;
}