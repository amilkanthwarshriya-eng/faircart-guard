import { describe, it, expect } from 'vitest';
import { Money, MoneyError, calculateQuoteTotal, compareToBudget, currencyDecimals, formatMoney } from '../src/utils/money';

describe('Money primitives', () => {
  it('has no floating point drift (0.1 + 0.2 === 0.3)', () => {
    expect(Money.from('0.1').add('0.2').toString()).toBe('0.3');
    expect(Money.from('0.1').add('0.2').eq('0.3')).toBe(true);
    expect(0.1 + 0.2 === 0.3).toBe(false); // the bug this module exists to avoid
  });

  it('adds and subtracts exactly with large values', () => {
    expect(Money.from('999999999999.9999').add('0.0001').toString()).toBe('1000000000000');
    expect(Money.from('100').sub('100.01').toFixed(2)).toBe('-0.01');
  });

  it('compares amounts', () => {
    expect(Money.from('10.00').cmp('10')).toBe(0);
    expect(Money.from('10.01').gt('10')).toBe(true);
    expect(Money.from('9.99').lt('10')).toBe(true);
    expect(Money.from('10').lte('10')).toBe(true);
  });

  it('rounds half-up, away from zero', () => {
    expect(Money.from('10.005').toFixed(2)).toBe('10.01');
    expect(Money.from('10.004').toFixed(2)).toBe('10.00');
    expect(Money.from('-10.005').toFixed(2)).toBe('-10.01');
    expect(Money.from('2.5').toFixed(0)).toBe('3');
    expect(Money.from('1.0005').roundToCurrency('KWD').toCurrencyString('KWD')).toBe('1.001');
  });

  it('uses currency minor units', () => {
    expect(currencyDecimals('INR')).toBe(2);
    expect(currencyDecimals('jpy')).toBe(0);
    expect(currencyDecimals('KWD')).toBe(3);
    expect(formatMoney('1500.5', 'JPY')).toBe('1501');
    expect(formatMoney(null, 'INR')).toBeNull();
  });

  it('computes percentages exactly', () => {
    expect(Money.from('14500').percentOf('18').toString()).toBe('2610');
    expect(Money.from('13500').percentOf(18).toString()).toBe('2430');
    expect(Money.from('17910').percentageOf(Money.from('20000'), 2)).toBe('89.55');
    expect(Money.from('1').percentageOf(Money.zero())).toBeNull();
  });

  it('multiplies by decimal factors', () => {
    expect(Money.from('145').mulDecimal('100').toString()).toBe('14500');
    expect(Money.from('0.1').mulDecimal('3').toString()).toBe('0.3');
  });

  it('handles missing values safely', () => {
    expect(Money.tryFrom(null)).toBeNull();
    expect(Money.tryFrom(undefined)).toBeNull();
    expect(Money.tryFrom('  ')).toBeNull();
    expect(Money.orZero(null).toString()).toBe('0');
    expect(Money.sum(['1.10', null, '2.20', undefined]).toString()).toBe('3.3');
    expect(() => Money.from(null)).toThrow(MoneyError);
  });

  it('rejects malformed input instead of guessing', () => {
    expect(() => Money.from('12,5')).toThrow(MoneyError);
    expect(() => Money.from('abc')).toThrow(MoneyError);
    expect(() => Money.from(1e21)).toThrow(MoneyError);
    expect(() => Money.from(Number.NaN)).toThrow(MoneyError);
  });

  it('accepts Decimal-like objects via toString()', () => {
    expect(Money.from({ toString: () => '12.3400' }).toString()).toBe('12.34');
  });
});

describe('calculateQuoteTotal', () => {
  const quoteA = { currency: 'INR', subtotal: '14500', tax: '2610', shipping: '800', otherFees: '0', statedTotal: '17910' };

  it('computes Subtotal + Tax + Shipping + Fees - Discount (Quote A)', () => {
    const r = calculateQuoteTotal(quoteA);
    expect(r.calculatedTotal?.toCurrencyString('INR')).toBe('17910.00');
    expect(r.consistent).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('includes other fees (Quote B) and subtracts discounts', () => {
    expect(calculateQuoteTotal({ currency: 'INR', subtotal: '15000', tax: '2700', shipping: '0', otherFees: '1200' }).calculatedTotal?.toString()).toBe('18900');
    expect(calculateQuoteTotal({ ...quoteA, discount: '500', statedTotal: '17410' }).calculatedTotal?.toString()).toBe('17410');
  });

  it('treats missing fees as zero but reports them', () => {
    const r = calculateQuoteTotal({ currency: 'INR', subtotal: '1000', tax: '180' });
    expect(r.calculatedTotal?.toString()).toBe('1180');
    expect(r.missing).toEqual(['shipping', 'otherFees']);
  });

  it('returns null total when subtotal is unknown (never guesses)', () => {
    const r = calculateQuoteTotal({ currency: 'INR', tax: '180', shipping: '10', otherFees: '0' });
    expect(r.calculatedTotal).toBeNull();
    expect(r.missing).toContain('subtotal');
    expect(r.subtotalSource).toBe('MISSING');
  });

  it('derives subtotal from line items when absent', () => {
    const r = calculateQuoteTotal({
      currency: 'INR', tax: '0', shipping: '0', otherFees: '0',
      lineItems: [{ quantity: '100', unitPrice: '100' }, { lineTotal: '4500' }],
    });
    expect(r.subtotalSource).toBe('LINE_ITEMS');
    expect(r.calculatedTotal?.toString()).toBe('14500');
  });

  it('detects a stated total that disagrees with the calculation', () => {
    const r = calculateQuoteTotal({ ...quoteA, statedTotal: '17000' });
    expect(r.consistent).toBe(false);
    expect(r.difference?.toString()).toBe('-910');
  });

  it('honours an explicit tolerance', () => {
    const r = calculateQuoteTotal({ ...quoteA, statedTotal: '17910.50' }, '1');
    expect(r.consistent).toBe(true);
    expect(calculateQuoteTotal({ ...quoteA, statedTotal: '17910.50' }).consistent).toBe(false);
  });

  it('reports not-comparable (null) when no stated total', () => {
    expect(calculateQuoteTotal({ ...quoteA, statedTotal: null }).consistent).toBeNull();
  });

  it('flags subtotal vs line-item disagreement', () => {
    const r = calculateQuoteTotal({ ...quoteA, lineItems: [{ lineTotal: '14000' }] });
    expect(r.subtotalMatchesLineItems).toBe(false);
  });

  it('keeps decimal precision with fractional components (rounded once)', () => {
    const r = calculateQuoteTotal({ currency: 'INR', subtotal: '0.10', tax: '0.20', shipping: '0.005', otherFees: '0' });
    expect(r.calculatedTotal?.toCurrencyString('INR')).toBe('0.31'); // 0.305 -> 0.31 half-up, single rounding
    const many = calculateQuoteTotal({ currency: 'USD', subtotal: '33.33', tax: '3.333', shipping: '0', otherFees: '0' });
    expect(many.calculatedTotal?.toCurrencyString('USD')).toBe('36.66');
  });
});

describe('compareToBudget', () => {
  it('within budget', () => {
    const c = compareToBudget('17910', '20000', 'INR');
    expect(c.withinBudget).toBe(true);
    expect(c.remaining.toString()).toBe('2090');
    expect(c.overBy.toString()).toBe('0');
    expect(c.percentUsed).toBe('89.55');
  });
  it('exactly at budget is allowed', () => {
    expect(compareToBudget('20000.00', '20000', 'INR').withinBudget).toBe(true);
  });
  it('over budget by one paisa fails', () => {
    const c = compareToBudget('20000.01', '20000', 'INR');
    expect(c.withinBudget).toBe(false);
    expect(c.overBy.toString()).toBe('0.01');
  });
});
