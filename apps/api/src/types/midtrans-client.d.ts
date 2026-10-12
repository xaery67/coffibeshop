declare module 'midtrans-client' {
  export interface MidtransConfig {
    isProduction?: boolean;
    serverKey: string;
    clientKey: string;
  }

  export interface SnapTransactionParameters {
    transaction_details: {
      order_id: string;
      gross_amount: number;
    };
    item_details?: Array<{
      id: string;
      price: number;
      quantity: number;
      name: string;
    }>;
    customer_details?: {
      email?: string;
      phone?: string;
      first_name?: string;
    };
    enabled_payments?: string[];
    callbacks?: {
      finish?: string;
    };
  }

  export interface SnapTransactionResponse {
    token: string;
    redirect_url: string;
    status_code?: string;
    status_message?: string;
    transaction_id?: string;
    order_id?: string;
    gross_amount?: string;
    payment_type?: string;
    transaction_time?: string;
    transaction_status?: string;
    fraud_status?: string;
    [key: string]: unknown;
  }

  export interface CoreApiTransactionStatusResponse {
    status_code: string;
    status_message: string;
    transaction_id: string;
    order_id: string;
    gross_amount: string;
    payment_type: string;
    transaction_time: string;
    transaction_status: string;
    fraud_status: string;
    [key: string]: unknown;
  }

  export interface MidtransConfig {
    isProduction?: boolean;
    serverKey: string;
    clientKey: string;
  }

  export class Snap {
    constructor(options: MidtransConfig);
    createTransaction(parameter: SnapTransactionParameters): Promise<SnapTransactionResponse>;
    createTransactionToken(parameter: SnapTransactionParameters): Promise<string>;
    createTransactionRedirectUrl(parameter: SnapTransactionParameters): Promise<string>;
  }

  export class CoreApi {
    constructor(options: MidtransConfig);
    getTransactionStatus(transactionId: string): Promise<unknown>;
  }

  export class CoreApi {
    constructor(options: MidtransConfig);
    getTransactionStatus(transactionId: string): Promise<unknown>;
  }

  export class Iris {
    constructor(options: MidtransConfig);
  }

  export class MidtransError extends Error {
    constructor(message: string);
  }

  export class SnapBiConfig {
    constructor(options: MidtransConfig);
  }

  export class SnapBi {
    constructor(options: MidtransConfig);
  }

  const Midtrans: {
    Snap: typeof Snap;
    CoreApi: typeof CoreApi;
    Iris: typeof Iris;
    MidtransError: typeof Error;
    SnapBiConfig: typeof SnapBiConfig;
    SnapBi: typeof SnapBi;
  };

  export default Midtrans;
}