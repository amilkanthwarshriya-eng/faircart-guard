export class PayPalError extends Error {
  constructor(public code: string, public status?: number, public debugId?: string) {
    super(code);
    this.name = "PayPalError";
  }
}
export class PaymentConflictError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
    this.name = "PaymentConflictError";
  }
}
