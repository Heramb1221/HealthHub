import { request } from "./http";
import type {
  CreatePaymentOrderInput,
  PaymentConfig,
  PaymentHistoryItem,
  PaymentOrder,
  PaymentVerificationResult,
  VerifyPaymentInput,
} from "./types";

export interface PaymentsApi {
  getConfig(): Promise<PaymentConfig>;
  createOrder(input: CreatePaymentOrderInput): Promise<PaymentOrder>;
  verifyPayment(input: VerifyPaymentInput): Promise<PaymentVerificationResult>;
  listHistory(): Promise<PaymentHistoryItem[]>;
}

function unwrapData<T>(res: T | { data: T }): T {
  if (res && typeof res === "object" && "data" in res && (res as { data: T }).data !== undefined) {
    return (res as { data: T }).data;
  }
  return res as T;
}

const livePaymentsApi: PaymentsApi = {
  getConfig: async () => unwrapData(await request<PaymentConfig | { data: PaymentConfig }>("/payments/config")),
  createOrder: async (input) => {
    const res = await request<PaymentOrder | { data: PaymentOrder }>("/payments/orders", {
      method: "POST",
      json: input,
    });
    return unwrapData(res);
  },
  verifyPayment: async (input) => {
    const res = await request<PaymentVerificationResult | { data: PaymentVerificationResult }>("/payments/verify", {
      method: "POST",
      json: input,
    });
    return unwrapData(res);
  },
  listHistory: async () => {
    const res = await request<PaymentHistoryItem[] | { data: PaymentHistoryItem[] }>("/payments/history");
    return unwrapData(res);
  },
};

export const paymentsApi: PaymentsApi = livePaymentsApi;
