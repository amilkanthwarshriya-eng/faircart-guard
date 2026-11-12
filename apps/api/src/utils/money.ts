/**
 * Decimal-safe money utilities (Member 3 / FairCart Guard).
 *
 * Authoritative money is NEVER computed with JavaScript floating point.
 * Amounts are BigInt "units" at a fixed internal scale of 6 decimal places
 * (1 unit = 0.000001). add/sub/compare are exact integer operations; no
 * third-party dependency is required.
 *
 * ROUNDING RULES (documented contract):
 *  1. Components (subtotal, tax, shipping, fees, discount) keep full internal
 *     precision; they are NOT rounded individually.
 *  2. The final total is rounded ONCE, to the currency's minor units
 *     (INR/USD/EUR = 2 dp, JPY = 0 dp, KWD = 3 dp), HALF-UP (ties away from
 *     zero: 10.005 -> 10.01, -10.005 -> -10.01).
 *  3. Inputs with more than 6 decimals are rounded half-up to 6 dp on entry.
 *  4. Percentages / rates are exact decimal strings ("18", "0.18"), never floats.
 *  5. Scores (cost/delivery) are non-authoritative ratios and may be JS numbers.
 *
 * Accepted inputs: decimal strings (preferred), Prisma.Decimal (any object whose
 * toString() is a plain decimal), or numbers (via String(); exponent notation is
 * rejected). null / undefined / "" mean "missing".
 */

export type MoneyInput = Money | string | number | { toString(): string } | null | undefined;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

const SCALE = 6;
const ONE = 10n ** BigInt(SCALE);
const DECIMAL_RE = /^([+-])?(\d+)(?:\.(\d+))?$/;

/** Integer division rounding half away from zero. `d` must be > 0. */
function divRound(n: bigint, d: bigint): bigint {
  const neg = n < 0n;
  const a = neg ? -n : n;
  let q = a / d;
  if ((a % d) * 2n >= d) q += 1n;
  return neg ? -q : q;
}

/** Parse a decimal string to an exact fraction num/den (den is a power of ten). */
function parseExact(text: string): { num: bigint; den: bigint } {
  const m = DECIMAL_RE.exec(text.trim());
  if (!m) throw new MoneyError(`Invalid decimal value: "${text}"`);
  const frac = m[3] ?? '';
  const num = BigInt((m[2] as string) + frac) * (m[1] === '-' ? -1n : 1n);
  return { num, den: 10n ** BigInt(frac.length) };
}

function inputToText(v: Exclude<MoneyInput, Money | null | undefined>): string {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new MoneyError('Non-finite number is not a valid amount');
    return String(v);
  }
  return String(v.toString());
}

function checkDp(dp: number): void {
  if (!Number.isInteger(dp) || dp < 0 || dp > SCALE) throw new MoneyError(`Invalid decimal places: ${dp}`);
}

export class Money {
  private constructor(readonly units: bigint) {}

  static zero(): Money {
    return new Money(0n);
  }

  static fromUnits(units: bigint): Money {
    return new Money(units);
  }

  /** Strict parse. Throws MoneyError on missing or malformed input. */
  static from(value: MoneyInput): Money {
    if (value instanceof Money) return value;
    if (value === null || value === undefined) throw new MoneyError('Missing amount');
    const { num, den } = parseExact(inputToText(value));
    return new Money(divRound(num * ONE, den));
  }

  /** Safe parse: null / undefined / blank -> null. Malformed input still throws. */
  static tryFrom(value: MoneyInput): Money | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Money) return value;
    const text = inputToText(value).trim();
    return text === '' ? null : Money.from(text);
  }

  /** Missing -> zero. Use only where "absent" legitimately means zero. */
  static orZero(value: MoneyInput): Money {
    return Money.tryFrom(value) ?? Money.zero();
  }

  static sum(values: readonly MoneyInput[]): Money {
    return values.reduce<Money>((acc, v) => acc.add(Money.orZero(v)), Money.zero());
  }

  add(other: MoneyInput): Money {
    return new Money(this.units + Money.from(other).units);
  }

  sub(other: MoneyInput): Money {
    return new Money(this.units - Money.from(other).units);
  }

  neg(): Money {
    return new Money(-this.units);
  }

  abs(): Money {
    return new Money(this.units < 0n ? -this.units : this.units);
  }

  /** Multiply by an exact decimal factor (e.g. quantity "3" or rate "0.18"). */
  mulDecimal(factor: string | number): Money {
    const { num, den } = parseExact(String(factor));
    return new Money(divRound(this.units * num, den));
  }

  /** `pct`% of this amount: Money("1000").percentOf("18") === 180. */
  percentOf(pct: string | number): Money {
    const { num, den } = parseExact(String(pct));
    return new Money(divRound(this.units * num, den * 100n));
  }

  /** What percentage this amount is of `total`, as a fixed string. null if total is zero. */
  percentageOf(total: Money, dp = 2): string | null {
    if (total.units === 0n) return null;
    return Money.fromUnits(divRound(this.units * 100n * ONE, total.units)).toFixed(dp);
  }

  cmp(other: MoneyInput): -1 | 0 | 1 {
    const o = Money.from(other).units;
    return this.units < o ? -1 : this.units > o ? 1 : 0;
  }
  eq(other: MoneyInput): boolean { return this.cmp(other) === 0; }
  lt(other: MoneyInput): boolean { return this.cmp(other) < 0; }
  lte(other: MoneyInput): boolean { return this.cmp(other) <= 0; }
  gt(other: MoneyInput): boolean { return this.cmp(other) > 0; }
  gte(other: MoneyInput): boolean { return this.cmp(other) >= 0; }
  isZero(): boolean { return this.units === 0n; }
  isNegative(): boolean { return this.units < 0n; }

  /** Round (half-up, away from zero) to `dp` decimal places. */
  round(dp: number): Money {
    checkDp(dp);
    const step = 10n ** BigInt(SCALE - dp);
    return new Money(divRound(this.units, step) * step);
  }

  roundToCurrency(currency: string): Money {
    return this.round(currencyDecimals(currency));
  }

  /** Fixed-point string with exactly `dp` decimals (rounded half-up). */
  toFixed(dp: number): string {
    checkDp(dp);
    const q = divRound(this.units, 10n ** BigInt(SCALE - dp));
    const neg = q < 0n;
    const s = (neg ? -q : q).toString().padStart(dp + 1, '0');
    const intPart = dp === 0 ? s : s.slice(0, s.length - dp);
    const frac = dp === 0 ? '' : `.${s.slice(s.length - dp)}`;
    return `${neg ? '-' : ''}${intPart}${frac}`;
  }

  /** Amount string for a currency, e.g. "17910.00" (INR) or "1500" (JPY). */
  toCurrencyString(currency: string): string {
    return this.toFixed(currencyDecimals(currency));
  }

  /** Canonical, trimmed full-precision string (e.g. "10.5"). */
  toString(): string {
    const s = this.toFixed(SCALE);
    return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  }

  toJSON(): string {
    return this.toString();
  }

  /** NON-authoritative ratio part/whole as a JS number (for scores only), 8-digit precision. */
  static ratio(part: Money, whole: Money): number {
    if (whole.units === 0n) throw new MoneyError('Cannot divide by a zero amount');
    return Number(divRound(part.units * 100_000_000n, whole.units)) / 1e8;
  }
}

// ---------------------------------------------------------------------------
// Currency handling
// ---------------------------------------------------------------------------

/** Minor-unit digits. Default 2. HUF/TWD are 0 because PayPal does not accept decimals for them. */
const CURRENCY_DECIMALS: Record<string, number> = {
  JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, UGX: 0, PYG: 0, HUF: 0, TWD: 0,
  KWD: 3, BHD: 3, JOD: 3, OMR: 3, TND: 3,
};

export function currencyDecimals(currency: string): number {
  return CURRENCY_DECIMALS[currency.trim().toUpperCase()] ?? 2;
}

export function formatMoney(value: MoneyInput, currency: string): string | null {
  const m = Money.tryFrom(value);
  return m ? m.roundToCurrency(currency).toCurrencyString(currency) : null;
}

// ---------------------------------------------------------------------------
// Quote totals
// ---------------------------------------------------------------------------

export interface LineItemMoneyInput {
  quantity?: MoneyInput;
  unitPrice?: MoneyInput;
  lineTotal?: MoneyInput;
}

export interface QuoteMoneyInput {
  currency: string;
  subtotal?: MoneyInput;
  lineItems?: readonly LineItemMoneyInput[] | null;
  tax?: MoneyInput;
  shipping?: MoneyInput;
  otherFees?: MoneyInput;
  discount?: MoneyInput;
  statedTotal?: MoneyInput;
}

export type MissingComponent = 'subtotal' | 'tax' | 'shipping' | 'otherFees';

export interface QuoteTotalResult {
  currency: string;
  subtotal: Money | null;
  subtotalSource: 'STATED' | 'LINE_ITEMS' | 'MISSING';
  lineItemsTotal: Money | null;
  /** null when the two cannot be compared (one of them unknown) */
  subtotalMatchesLineItems: boolean | null;
  tax: Money | null;
  shipping: Money | null;
  otherFees: Money | null;
  discount: Money;
  /** Absent components (treated as 0 in the sum, but reported). Discount is optional and never reported. */
  missing: MissingComponent[];
  /** Subtotal + Tax + Shipping + Other Fees - Discount, rounded once to currency minor units. null if no subtotal. */
  calculatedTotal: Money | null;
  statedTotal: Money | null;
  /** statedTotal - calculatedTotal (currency precision); null if either is unknown. */
  difference: Money | null;
  /** true/false when comparable, null when stated or calculated total is unknown. */
  consistent: boolean | null;
}

function lineTotalOf(li: LineItemMoneyInput): Money | null {
  const explicit = Money.tryFrom(li.lineTotal);
  if (explicit) return explicit;
  const q = Money.tryFrom(li.quantity);
  const p = Money.tryFrom(li.unitPrice);
  return q && p ? p.mulDecimal(q.toString()) : null;
}

/**
 * Authoritative quote total:  Subtotal + Tax + Shipping + Other Fees - Discount.
 * `tolerance` (default 0) is the largest |stated - calculated| still considered consistent.
 */
export function calculateQuoteTotal(input: QuoteMoneyInput, tolerance: MoneyInput = '0'): QuoteTotalResult {
  const dp = currencyDecimals(input.currency);
  const explicitSubtotal = Money.tryFrom(input.subtotal);

  let lineItemsTotal: Money | null = null;
  if (input.lineItems && input.lineItems.length > 0) {
    const totals = input.lineItems.map(lineTotalOf);
    if (totals.every((t): t is Money => t !== null)) lineItemsTotal = Money.sum(totals);
  }

  const subtotal = explicitSubtotal ?? lineItemsTotal;
  const subtotalSource = explicitSubtotal ? 'STATED' : lineItemsTotal ? 'LINE_ITEMS' : 'MISSING';
  const subtotalMatchesLineItems =
    explicitSubtotal && lineItemsTotal ? explicitSubtotal.round(dp).eq(lineItemsTotal.round(dp)) : null;

  const tax = Money.tryFrom(input.tax);
  const shipping = Money.tryFrom(input.shipping);
  const otherFees = Money.tryFrom(input.otherFees);
  const discount = Money.orZero(input.discount);

  const missing: MissingComponent[] = [];
  if (!subtotal) missing.push('subtotal');
  if (!tax) missing.push('tax');
  if (!shipping) missing.push('shipping');
  if (!otherFees) missing.push('otherFees');

  const calculatedTotal = subtotal
    ? subtotal.add(tax ?? Money.zero()).add(shipping ?? Money.zero()).add(otherFees ?? Money.zero()).sub(discount).round(dp)
    : null;

  const statedRaw = Money.tryFrom(input.statedTotal);
  const statedTotal = statedRaw ? statedRaw.round(dp) : null;
  const difference = statedTotal && calculatedTotal ? statedTotal.sub(calculatedTotal) : null;
  const consistent = difference ? difference.abs().lte(Money.from(tolerance)) : null;

  return {
    currency: input.currency,
    subtotal, subtotalSource, lineItemsTotal, subtotalMatchesLineItems,
    tax, shipping, otherFees, discount, missing,
    calculatedTotal, statedTotal, difference, consistent,
  };
}

// ---------------------------------------------------------------------------
// Budget comparison
// ---------------------------------------------------------------------------

export interface BudgetComparison {
  withinBudget: boolean;
  /** budget - total (negative when over budget) */
  remaining: Money;
  /** max(total - budget, 0) */
  overBy: Money;
  /** total as % of budget (2 dp), null if budget is zero */
  percentUsed: string | null;
}

export function compareToBudget(total: MoneyInput, budget: MoneyInput, currency: string): BudgetComparison {
  const t = Money.from(total).roundToCurrency(currency);
  const b = Money.from(budget).roundToCurrency(currency);
  const remaining = b.sub(t);
  return {
    withinBudget: t.lte(b),
    remaining,
    overBy: remaining.isNegative() ? remaining.neg() : Money.zero(),
    percentUsed: t.percentageOf(b, 2),
  };
}
