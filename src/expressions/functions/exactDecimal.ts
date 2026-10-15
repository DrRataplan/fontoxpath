/**
 * Helpers for doing exact decimal arithmetic on top of a JS `number` (IEEE-754 double), using
 * BigInt. This is used exclusively by fn:format-number, to avoid the rounding artifacts that
 * plain floating point arithmetic would introduce when rendering a number to a fixed amount of
 * fraction digits.
 *
 * fontoxpath represents all numeric types (xs:integer, xs:decimal, xs:float and xs:double) as a
 * plain JS `number` internally, so the "exact value" computed here is the exact value of that
 * double, not necessarily the exact value of some higher-precision xs:decimal a user may have
 * intended. That is an existing, accepted limitation of the numeric type representation, not
 * something format-number can or should work around on its own.
 */

// value === (negative ? -1 : 1) * numerator / 10^scale. `numerator` is always non-negative,
// `scale` may be any integer (a negative scale means `numerator` should conceptually be padded
// with that many trailing zeros).
export type ExactDecimal = {
	negative: boolean;
	numerator: bigint;
	scale: number;
};

// Written as BigInt(...) calls rather than `0n` literals so this file does not require bumping
// the project's TypeScript compilation target.
const BIG_ZERO = BigInt(0);
const BIG_ONE = BigInt(1);
const BIG_TWO = BigInt(2);
const BIG_FIVE = BigInt(5);
const BIG_TEN = BigInt(10);

/**
 * Convert a finite JS number to its mathematically exact decimal representation.
 */
export function doubleToExactDecimal(value: number): ExactDecimal {
	const negative = value < 0 || Object.is(value, -0);
	if (value === 0) {
		return { negative, numerator: BIG_ZERO, scale: 0 };
	}

	const buffer = new ArrayBuffer(8);
	const view = new DataView(buffer);
	view.setFloat64(0, value);
	const high = view.getUint32(0);
	const low = view.getUint32(4);

	const biasedExponent = (high >>> 20) & 0x7ff;
	const mantissaHigh = BigInt(high & 0xfffff);
	const mantissaLow = BigInt(low >>> 0);
	const storedMantissa = (mantissaHigh << BigInt(32)) | mantissaLow;

	let binaryExponent: number;
	let mantissa: bigint;
	if (biasedExponent === 0) {
		// Subnormal number: no implicit leading bit.
		binaryExponent = -1074;
		mantissa = storedMantissa;
	} else {
		binaryExponent = biasedExponent - 1075;
		mantissa = storedMantissa | (BIG_ONE << BigInt(52));
	}

	// value = mantissa * 2^binaryExponent
	if (binaryExponent >= 0) {
		return {
			negative,
			numerator: mantissa << BigInt(binaryExponent),
			scale: 0,
		};
	}

	// Rewrite mantissa / 2^k as (mantissa * 5^k) / 10^k, turning the binary fraction into an
	// exact decimal fraction.
	const k = -binaryExponent;
	return {
		negative,
		numerator: mantissa * BIG_FIVE ** BigInt(k),
		scale: k,
	};
}

/**
 * Multiply the magnitude of an exact decimal by 10^power (power may be negative).
 */
export function scaleByPowerOfTen(value: ExactDecimal, power: number): ExactDecimal {
	return { ...value, scale: value.scale - power };
}

/**
 * Round the magnitude of an exact decimal to exactly `fractionDigits` digits after the decimal
 * point, using round-half-up (ties round away from zero on the magnitude).
 */
export function roundToFractionDigits(value: ExactDecimal, fractionDigits: number): ExactDecimal {
	if (value.scale <= fractionDigits) {
		return {
			negative: value.negative,
			numerator: value.numerator * BIG_TEN ** BigInt(fractionDigits - value.scale),
			scale: fractionDigits,
		};
	}

	const divisor = BIG_TEN ** BigInt(value.scale - fractionDigits);
	let quotient = value.numerator / divisor;
	const remainder = value.numerator % divisor;
	if (remainder * BIG_TWO >= divisor) {
		quotient += BIG_ONE;
	}

	return { negative: value.negative, numerator: quotient, scale: fractionDigits };
}

/**
 * The number of decimal digits in the integer part of the (rounded) value, i.e. floor(log10(v)) +
 * 1 for v >= 1, zero or negative for v < 1. Zero itself is reported as magnitude 1, matching the
 * convention needed for scientific-notation exponent selection.
 */
export function integerDigitCount(value: ExactDecimal): number {
	if (value.numerator === BIG_ZERO) {
		return 1 - value.scale;
	}
	return value.numerator.toString().length - value.scale;
}

/**
 * Render the (already rounded) exact decimal as separate integer-part and fraction-part decimal
 * digit strings (ASCII '0'-'9'), where the fraction part has exactly `value.scale` digits.
 */
export function toDigitStrings(value: ExactDecimal): {
	fractionDigits: string;
	integerDigits: string;
} {
	const digits = value.numerator.toString();
	if (value.scale <= 0) {
		return { integerDigits: digits + '0'.repeat(-value.scale), fractionDigits: '' };
	}
	const padded =
		digits.length <= value.scale
			? '0'.repeat(value.scale + 1 - digits.length) + digits
			: digits;
	return {
		fractionDigits: padded.slice(padded.length - value.scale),
		integerDigits: padded.slice(0, padded.length - value.scale) || '0',
	};
}
