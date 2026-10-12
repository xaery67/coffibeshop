import { PaymentProvider, InitiatePaymentInput, InitiatePaymentResult, WebhookVerificationResult } from './payment-provider.interface.js';
import { env } from '../../../config/env.js';
import { NotImplemented } from '../../../lib/http.js';

export class XenditProvider implements PaymentProvider {
  readonly name = 'xendit';
  readonly supportedMethods = [
    'qris', 'gopay', 'ovo', 'dana', 'linkaja', 'shopeepay', 
    'virtual_account', 'credit_card'
  ];

  async initiate(_input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    if (!env.XENDIT_SECRET_KEY) {
      throw NotImplemented('Xendit not configured');
    }
    throw NotImplemented('Xendit implementation deferred to Sprint 3');
  }

  verifyWebhook(_payload: Record<string, unknown>, _signature: string | undefined): WebhookVerificationResult {
    throw NotImplemented('Xendit webhook not implemented');
  }

  async isHealthy(): Promise<boolean> {
    return !!env.XENDIT_SECRET_KEY;
  }
}

export async function createXenditProvider(): Promise<PaymentProvider> {
  const provider = new XenditProvider();
  if (await provider.isHealthy()) {
    return provider;
  }
  throw new Error('Xendit not configured');
}