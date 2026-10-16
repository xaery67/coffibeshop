import { randomUUID, createHash } from 'node:crypto';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { AppError, Conflict, NotFound, InternalServerError } from '../../lib/http.js';
import { createMidtransProvider } from './providers/midtrans.provider.js';
import { createXenditProvider } from './providers/xendit.provider.js';
import { PaymentProvider, InitiatePaymentInput, InitiatePaymentResult, WebhookVerificationResult } from './providers/payment-provider.interface.js';
import { publishOrderEvent, publishOrderStatus } from '../order/sse.controller.js';

export class PaymentService {
  private providers: Map<string, PaymentProvider> = new Map();
  private fallbackOrder: PaymentProvider[] = [];

  private constructor() {}

  static async create(): Promise<PaymentService> {
    const service = new PaymentService();
    await service.initializeProviders();
    return service;
  }

  private async initializeProviders() {
    // Always add Midtrans as primary
    try {
      const midtrans = await createMidtransProvider();
      this.providers.set('midtrans', midtrans);
      this.fallbackOrder.push(midtrans);
    } catch (e) {
      console.warn('Midtrans not available:', (e as Error).message);
    }

    // Add Xendit as fallback if configured
    if (env.XENDIT_SECRET_KEY) {
      try {
        const xendit = await createXenditProvider();
        if (await xendit.isHealthy()) {
          this.providers.set('xendit', xendit);
          this.fallbackOrder.push(xendit);
        }
      } catch (e) {
        console.warn('Xendit init skipped:', (e as Error).message);
      }
    }

    if (this.fallbackOrder.length === 0) {
      console.warn('No payment providers available!');
    }
  }

  getActiveProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  private hashRequest(input: InitiatePaymentInput): string {
    // Create deterministic hash from request fields that define uniqueness
    const data = `${input.orderId}:${input.amount}:${input.method}:${input.customerEmail ?? ''}:${input.customerPhone ?? ''}`;
    return createHash('sha256').update(data).digest('hex').substring(0, 32);
  }

  async initiatePayment(
    input: InitiatePaymentInput,
    idempotencyKey?: string
  ): Promise<InitiatePaymentResult> {
    const requestHash = this.hashRequest(input);

    // Check idempotency key first
    if (idempotencyKey) {
      const existing = await prisma.paymentIdempotency.findUnique({
        where: { idempotency_key: idempotencyKey },
      });

      if (existing) {
        if (existing.request_hash !== requestHash) {
          throw Conflict('Idempotency key already used with different request');
        }
        // Return cached response
        return existing.response as unknown as InitiatePaymentResult;
      }
    }

    // Try providers in fallback order
    let lastError: Error | null = null;

    for (const provider of this.fallbackOrder) {
      if (!provider.supportedMethods.includes(input.method)) {
        continue;
      }

      try {
        const result = await provider.initiate(input);

        // Extract provider_order_id from rawResponse (for Midtrans)
        const providerOrderId = (result.rawResponse as any)?._our_provider_order_id;

        // Save payment intent record for webhook mapping
        if (providerOrderId) {
          await prisma.paymentIntent.create({
            data: {
              id: randomUUID(),
              order_id: input.orderId,
              provider: provider.name,
              provider_order_id: providerOrderId,
              method: input.method,
              idempotency_key: idempotencyKey,
              status: 'pending',
            },
          });
        }

        // Save idempotency record
        if (idempotencyKey) {
          await prisma.paymentIdempotency.create({
            data: {
              id: randomUUID(),
              idempotency_key: idempotencyKey,
              provider: provider.name,
              request_hash: requestHash,
              response: result as any,
            },
          });
        }

        return result;
      } catch (error: any) {
        lastError = error;

        // If conflict (duplicate), don't fallback
        if (error instanceof AppError && error.code === 'CONFLICT') {
          throw error;
        }

        // If not a retryable error, don't fallback
        if (error instanceof AppError && error.code === 'BAD_REQUEST') {
          throw error;
        }

        console.warn(`Provider ${provider.name} failed, trying fallback:`, error.message);
        continue;
      }
    }

    throw InternalServerError(
      `All payment providers failed. Last error: ${lastError?.message || 'Unknown error'}`
    );
  }

  async handleWebhook(
    providerName: string,
    payload: Record<string, unknown>,
    signature: string | undefined
  ): Promise<WebhookVerificationResult> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw NotFound(`Payment provider ${providerName} not found`);
    }

    const verification = provider.verifyWebhook(payload, signature);

    // For Midtrans, map provider_order_id back to internal order_id
    let actualOrderId = verification.orderId;
    if (providerName === 'midtrans') {
      // The verification.orderId from Midtrans is actually our provider_order_id
      // We need to look up the real order_id from payment_intents
      const intent = await prisma.paymentIntent.findUnique({
        where: { provider_order_id: verification.orderId },
      });
      if (intent) {
        actualOrderId = intent.order_id;
        // Update intent status
        await prisma.paymentIntent.update({
          where: { id: intent.id },
          data: { status: 'settled', updated_at: new Date() },
        });
      }
    }

    // Idempotent by transaction_id
    const existingPayment = await prisma.payment.findUnique({
      where: { transaction_id: verification.transactionId },
    });

    if (existingPayment) {
      // Already processed, return same result
      return verification;
    }

    // Process payment status
    if (verification.success) {
      await this.processSuccessfulPayment(verification, actualOrderId);
    } else {
      await this.processFailedPayment(verification, actualOrderId);
    }

    return verification;
  }

  /**
   * **Aksi lanjutan pasca-bayar** — tarik status transaksi langsung dari gateway.
   *
   * Latar: webhook Midtrans tidak selalu sampai ke dev/produksi (tanpa URL publik
   * yang bisa dijangkau gateway), sehingga order tertahan `PENDING` dan TIDAK
   * muncul di antrian outlet (`GET /orders/queue` default = PAID,CONFIRMED).
   * Endpoint ini membuat FE bisa "menyusul" status: bila gateway bilang
   * settlement/capture → order ditandai `PAID` (idempotent, via `transaction_id`).
   */
  async verifyPayment(orderId: string): Promise<{
    order_id: string;
    status: 'paid' | 'pending' | 'failed' | 'unknown';
    provider: string | null;
    order_status: string;
  }> {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw NotFound(`Order ${orderId} not found`);

    // Ambil intent terbaru (ganti metode = intent baru; yang terakhir paling relevan).
    const intents = await prisma.paymentIntent.findMany({
      where: { order_id: orderId },
      orderBy: { created_at: 'desc' },
      take: 5,
    });

    if (intents.length === 0) {
      return { order_id: orderId, status: 'unknown', provider: null, order_status: order.status };
    }

    for (const intent of intents) {
      const provider = this.providers.get(intent.provider);
      if (!provider?.fetchTransactionStatus) continue;

      const verification = await provider.fetchTransactionStatus(intent.provider_order_id);
      if (!verification) continue;

      if (verification.success) {
        await prisma.paymentIntent.update({
          where: { id: intent.id },
          data: { status: 'settled', updated_at: new Date() },
        });
        await this.processSuccessfulPayment(verification, orderId);
        const updated = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
        return { order_id: orderId, status: 'paid', provider: intent.provider, order_status: updated?.status ?? 'PAID' };
      }

      // Status final negatif → laporkan; PENDING gateway tetap 'pending'.
      if (['deny', 'cancel', 'expire', 'failure'].includes(verification.status)) {
        await this.processFailedPayment(verification, orderId);
        return { order_id: orderId, status: 'failed', provider: intent.provider, order_status: order.status };
      }
      return { order_id: orderId, status: 'pending', provider: intent.provider, order_status: order.status };
    }

    return { order_id: orderId, status: 'unknown', provider: intents[0].provider, order_status: order.status };
  }

  private async processSuccessfulPayment(verification: WebhookVerificationResult, orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: true },
    });

    if (!order) {
      throw NotFound(`Order ${orderId} not found`);
    }

    // Idempotent: check if already paid
    const existingPaid = order.payments.find((p: { status: string }) => p.status === 'paid');
    if (existingPaid) {
      return; // Already processed
    }

    // Create payment record
    await prisma.payment.create({
      data: {
        id: randomUUID(),
        order_id: orderId,
        provider: verification.provider,
        method: verification.method,
        amount: verification.amount,
        status: 'paid',
        transaction_id: verification.transactionId,
        paid_at: new Date(),
        raw_payload: verification.rawPayload as any,
      },
    });

    // Update order status to PAID (if not already)
    if (order.status === 'PENDING') {
      await prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: order.id },
          data: { status: 'PAID' },
        });

        await tx.orderStatusLog.create({
          data: {
            order_id: order.id,
            to_status: 'PAID',
            note: 'Payment confirmed via webhook',
            changed_by: null,
          },
        });
      });

      // Emit event for notification (async, no worker yet)
      publishOrderStatus(order, {
        status: 'PAID',
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async processFailedPayment(verification: WebhookVerificationResult, orderId: string) {
    // Create payment record with failed status
    await prisma.payment.create({
      data: {
        id: randomUUID(),
        order_id: orderId,
        provider: verification.provider,
        method: verification.method,
        amount: verification.amount,
        status: 'failed',
        transaction_id: verification.transactionId,
        raw_payload: verification.rawPayload as any,
      },
    });

    // Update order if still pending
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (order && order.status === 'PENDING') {
      // Keep as PENDING, user can retry
      await prisma.orderStatusLog.create({
        data: {
          order_id: order.id,
          to_status: 'PENDING',
          note: `Payment failed: ${verification.status}`,
          changed_by: null,
        },
      });
    }
  }
}