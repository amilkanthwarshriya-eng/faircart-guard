import { randomUUID } from 'node:crypto';
import { AppError } from '../src/utils/errors';
import type { ApprovalStore, ApprovalTx } from '../src/services/procurement/approval';
import type { ApprovalRecord, QuoteRecord, RequestRecord, RequestStatus } from '../src/services/procurement/types';

/** In-memory ApprovalStore used by unit tests (no database). Transactions are serialised like a row lock. */
export class MemoryApprovalStore implements ApprovalStore {
  requests = new Map<string, RequestRecord>();
  quotes = new Map<string, QuoteRecord>();
  approvals: ApprovalRecord[] = [];
  private chain: Promise<unknown> = Promise.resolve();

  constructor(request: RequestRecord, quotes: QuoteRecord[]) {
    this.requests.set(request.id, { ...request });
    quotes.forEach((q) => this.quotes.set(q.id, { ...q }));
  }

  transaction<T>(fn: (tx: ApprovalTx) => Promise<T>): Promise<T> {
    const run = this.chain.then(() => fn(this.tx()));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private tx(): ApprovalTx {
    return {
      lockRequest: async (id) => this.requests.get(id) ?? null,
      getQuote: async (id) => this.quotes.get(id) ?? null,
      findActiveApproval: async (requestId) => this.approvals.find((a) => a.requestId === requestId && a.status === 'APPROVED') ?? null,
      createApproval: async (d) => {
        if (this.approvals.some((a) => a.requestId === d.requestId && a.status === 'APPROVED')) {
          throw new AppError(409, 'DUPLICATE_ACTIVE_APPROVAL', 'duplicate');
        }
        const rec: ApprovalRecord = { id: randomUUID(), ...d, status: 'APPROVED', invalidatedAt: null, invalidationReason: null };
        this.approvals.push(rec);
        return rec;
      },
      invalidateApproval: async (id, reason, at) => {
        const a = this.approvals.find((x) => x.id === id);
        if (a) Object.assign(a, { status: 'INVALIDATED', invalidatedAt: at, invalidationReason: reason });
      },
      setRequestStatus: async (id, status: RequestStatus) => {
        const r = this.requests.get(id);
        if (r) r.status = status;
      },
    };
  }

  // test helpers
  patchQuote(id: string, patch: Partial<QuoteRecord>): void {
    this.quotes.set(id, { ...(this.quotes.get(id) as QuoteRecord), ...patch });
  }
}
