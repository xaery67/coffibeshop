import { randomUUID, createHash } from 'node:crypto';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { AppError, BadRequest, Conflict, NotFound, InternalServerError } from '../../lib/http.js';
import { createMidtransProvider, createXenditProvider } from './providers/xendit.provider.js';
import { PaymentProvider, InitiatePaymentInput, InitiatePaymentResult, WebhookVerificationResult } from './providers/payment-provider.interface.js';
import { publishOrderEvent } from '../order/sse.controller.js';

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
      await this.processSuccessfulPayment(verification);
    } else {
      await this.processFailedPayment(verification);
    }

    return verification;
  }

  private async processSuccessfulPayment(verification: WebhookVerificationResult) {
    const order = await prisma.order.findUnique({
      where: { id: verification.orderId },
      include: { payments: true },
    });

    if (!order) {
      throw NotFound(`Order ${verification.orderId} not found`);
    }

    // Idempotent: check if already paid
    const existingPaid = order.payments.find(p => p.status === 'paid');
    if (existingPaid) {
      return; // Already processed
    }

    // Create payment record
    await prisma.payment.create({
      data: {
        id: randomUUID(),
        order_id: verification.orderId,
        provider: 'midtrans', // TODO: get from context
        method: 'midtrans', // TODO: infer from payload
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
      publishOrderEvent(order.id, {
        status: 'PAID',
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async processFailedPayment(verification: WebhookVerificationResult) {
    // Create payment record with failed status
    await prisma.payment.create({
      data: {
        id: randomUUID(),
        order_id: verification.orderId,
        provider: 'midtrans',
        method: 'unknown',
        amount: verification.amount,
        status: 'failed',
        transaction_id: verification.transactionId,
        raw_payload: verification.rawPayload as any,
      },
    });

    // Update order if still pending
    const order = await prisma.order.findUnique({
      where: { id: verification.orderId },
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