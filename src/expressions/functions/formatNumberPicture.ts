import { errFODF1310 } from './FunctionOperationErrors';
import { DecimalFormatProperties } from './decimalFormat';

type CharClass =
	| 'decimal'
	| 'exponent'
	| 'grouping'
	| 'mandatory'
	| 'optional'
	| 'passive'
	| 'percent'
	| 'permille';

export type IntegerPartPicture = {
	// Whether the integer part contains at least one digit placeholder character (mandatory or
	// optional). An integer part picture may legally have none at all (e.g. picture ".00").
	readonly hasDigitPlaceholder: boolean;
	// Widths of the explicit grouping segments, ordered primary (closest to the decimal point,
	// index 0) to outermost (last index). Empty if the picture has no grouping-separator here.
	readonly groupingWidths: readonly number[];
	readonly minDigits: number;
};

export type FractionPartPicture = {
	// Widths of the explicit grouping segments, ordered near-the-decimal-point (index 0, i.e. as
	// written) outward. Empty if the picture has no grouping-separator here.
	readonly groupingWidths: readonly number[];
	// Whether the sub-picture had a decimal-separator character at all, regardless of whether any
	// fraction digit placeholders follow it.
	readonly hasDecimalSeparator: boolean;
	readonly maxDigits: number;
	readonly minDigits: number;
};

export type MantissaPicture = {
	readonly fractionPart: FractionPartPicture;
	readonly hasPerMille: boolean;
	readonly hasPercent: boolean;
	readonly integerPart: IntegerPartPicture;
	// Whether the (single) percent/per-mille character precedes the digit placeholders, so it
	// should be rendered before the rendered number rather than after it.
	readonly scalingCharacterIsLeading: boolean;
};

export type ExponentPicture = {
	readonly minDigits: number;
};

export type SubPicture = {
	readonly exponent: ExponentPicture | null;
	readonly mantissa: MantissaPicture;
	readonly prefix: string;
	readonly suffix: string;
};

export type ParsedPicture = {
	// Null if the picture only provided one sub-picture: negative numbers are then formatted
	// using the positive sub-picture, with the decimal-format's minus-sign prepended.
	readonly negative: SubPicture | null;
	readonly positive: SubPicture;
};

function classify(char: string, props: DecimalFormatProperties): CharClass {
	if (char === props.decimalSeparator) {
		return 'decimal';
	}
	if (char === props.groupingSeparator) {
		return 'grouping';
	}
	if (char === props.percent) {
		return 'percent';
	}
	if (char === props.perMille) {
		return 'permille';
	}
	if (char === props.exponentSeparator) {
		return 'exponent';
	}
	if (char === props.digit) {
		return 'optional';
	}
	const zeroDigitCodepoint = props.zeroDigit.codePointAt(0);
	const codepoint = char.codePointAt(0);
	if (codepoint >= zeroDigitCodepoint && codepoint <= zeroDigitCodepoint + 9) {
		return 'mandatory';
	}
	return 'passive';
}

/**
 * The exponent-separator is the only "active" character whose classification is context-
 * dependent: it only counts as an exponent-separator when immediately followed by a digit
 * placeholder. Anywhere else it is effectively passive/literal text - including while still
 * scanning for where the prefix ends, before any digit has been seen at all.
 */
function classifyEffective(chars: string[], i: number, props: DecimalFormatProperties): CharClass {
	const cls = classify(chars[i], props);
	if (cls !== 'exponent') {
		return cls;
	}
	const nextCls = i + 1 < chars.length ? classify(chars[i + 1], props) : 'passive';
	return DIGIT_CLASSES.has(nextCls) ? 'exponent' : 'passive';
}

const DIGIT_CLASSES = new Set<CharClass>(['mandatory', 'optional']);
const MANTISSA_CLASSES = new Set<CharClass>([
	'mandatory',
	'optional',
	'decimal',
	'grouping',
	'percent',
	'permille',
]);

/**
 * Split a run of grouping-separator-delimited digit segments (given in the order they appear in
 * the picture, left to right) into their widths, validating adjacency rules: only the segment at
 * `emptySegmentAllowedAt` may be empty (0 width); all others must contain at least one character.
 */
function splitGroupingSegments(
	chars: string[],
	props: DecimalFormatProperties,
	picture: string,
	emptySegmentAllowedAt: 'first' | 'last',
): string[][] {
	const segments: string[][] = [[]];
	for (const char of chars) {
		if (classify(char, props) === 'grouping') {
			segments.push([]);
		} else {
			segments[segments.length - 1].push(char);
		}
	}
	segments.forEach((segment, i) => {
		if (segment.length > 0) {
			return;
		}
		const isAllowed = emptySegmentAllowedAt === 'first' ? i === 0 : i === segments.length - 1;
		if (!isAllowed) {
			throw errFODF1310(picture);
		}
	});
	return segments;
}

function parseIntegerPart(
	chars: string[],
	props: DecimalFormatProperties,
	picture: string,
): IntegerPartPicture {
	const segments = splitGroupingSegments(chars, props, picture, 'first');
	const groupingWidths = segments.length > 1 ? segments.map((s) => s.length).reverse() : [];

	// Globally (ignoring grouping-separators), optional-digit-signs must all precede
	// mandatory-digit-signs: the mandatory digits must be contiguous and adjacent to the decimal
	// point.
	let seenMandatory = false;
	let minDigits = 0;
	let hasDigitPlaceholder = false;
	chars.forEach((char) => {
		const cls = classify(char, props);
		if (cls === 'mandatory') {
			seenMandatory = true;
			minDigits++;
			hasDigitPlaceholder = true;
		} else if (cls === 'optional') {
			if (seenMandatory) {
				throw errFODF1310(picture);
			}
			hasDigitPlaceholder = true;
		}
	});

	return { hasDigitPlaceholder, groupingWidths, minDigits };
}

function parseFractionPart(
	chars: string[],
	props: DecimalFormatProperties,
	picture: string,
): FractionPartPicture {
	const segments = splitGroupingSegments(chars, props, picture, 'last');
	const groupingWidths = segments.length > 1 ? segments.map((s) => s.length) : [];

	// Mirror of the integer part: mandatory-digit-signs must all precede optional-digit-signs
	// (mandatory digits adjacent to the decimal point).
	let seenOptional = false;
	let minDigits = 0;
	let maxDigits = 0;
	chars.forEach((char) => {
		const cls = classify(char, props);
		if (cls === 'mandatory') {
			if (seenOptional) {
				throw errFODF1310(picture);
			}
			minDigits++;
			maxDigits++;
		} else if (cls === 'optional') {
			seenOptional = true;
			maxDigits++;
		}
	});

	// The real value is filled in by the caller, which knows whether a decimal-separator preceded
	// this span at all.
	return { groupingWidths, hasDecimalSeparator: false, maxDigits, minDigits };
}

function parseMantissa(
	chars: string[],
	props: DecimalFormatProperties,
	picture: string,
): MantissaPicture {
	const decimalIndices: number[] = [];
	const scalingIndices: number[] = [];
	chars.forEach((char, i) => {
		const cls = classify(char, props);
		if (cls === 'decimal') {
			decimalIndices.push(i);
		} else if (cls === 'percent' || cls === 'permille') {
			scalingIndices.push(i);
		}
	});

	if (decimalIndices.length > 1 || scalingIndices.length > 1) {
		throw errFODF1310(picture);
	}

	const decimalIndex = decimalIndices.length ? decimalIndices[0] : -1;
	const scalingIndex = scalingIndices.length ? scalingIndices[0] : -1;

	const digitChars = chars.filter((char) => DIGIT_CLASSES.has(classify(char, props)));
	if (digitChars.length === 0) {
		throw errFODF1310(picture);
	}

	const integerChars = (decimalIndex === -1 ? chars : chars.slice(0, decimalIndex)).filter(
		(char) => classify(char, props) !== 'percent' && classify(char, props) !== 'permille',
	);
	const fractionChars = (decimalIndex === -1 ? [] : chars.slice(decimalIndex + 1)).filter(
		(char) => classify(char, props) !== 'percent' && classify(char, props) !== 'permille',
	);

	const integerPart = parseIntegerPart(integerChars, props, picture);
	const fractionPart = {
		...parseFractionPart(fractionChars, props, picture),
		hasDecimalSeparator: decimalIndex !== -1,
	};

	const firstDigitIndex = chars.findIndex((char) => DIGIT_CLASSES.has(classify(char, props)));

	return {
		fractionPart,
		hasPerMille: scalingIndex !== -1 && classify(chars[scalingIndex], props) === 'permille',
		hasPercent: scalingIndex !== -1 && classify(chars[scalingIndex], props) === 'percent',
		integerPart,
		scalingCharacterIsLeading: scalingIndex !== -1 && scalingIndex < firstDigitIndex,
	};
}

/**
 * Validate that the given span (typically what will become prefix/suffix text) does not contain
 * any active (special) characters. The exponent-separator character is the sole exception: each
 * occurrence is re-classified locally by what immediately follows it, so a literal, "inactive"
 * exponent-separator may legally appear as ordinary text.
 */
function validatePassiveSpan(chars: string[], props: DecimalFormatProperties, picture: string) {
	for (let i = 0; i < chars.length; i++) {
		const cls = classify(chars[i], props);
		if (cls === 'passive') {
			continue;
		}
		if (cls === 'exponent') {
			const nextCls = i + 1 < chars.length ? classify(chars[i + 1], props) : 'passive';
			if (DIGIT_CLASSES.has(nextCls)) {
				throw errFODF1310(picture);
			}
			continue;
		}
		throw errFODF1310(picture);
	}
}

function parseSubPicture(
	subPicture: string,
	props: DecimalFormatProperties,
	picture: string,
): SubPicture {
	const chars = Array.from(subPicture);

	let idx = 0;
	while (idx < chars.length && classifyEffective(chars, idx, props) === 'passive') {
		idx++;
	}
	const prefix = chars.slice(0, idx).join('');

	const mantissaStart = idx;
	while (idx < chars.length && MANTISSA_CLASSES.has(classify(chars[idx], props))) {
		idx++;
	}
	const mantissaChars = chars.slice(mantissaStart, idx);
	const mantissa = parseMantissa(mantissaChars, props, picture);

	let exponent: ExponentPicture | null = null;
	if (idx < chars.length && classify(chars[idx], props) === 'exponent') {
		const nextCls = idx + 1 < chars.length ? classify(chars[idx + 1], props) : 'passive';
		if (DIGIT_CLASSES.has(nextCls)) {
			idx++; // consume the exponent-separator itself
			const exponentDigitsStart = idx;
			while (idx < chars.length && DIGIT_CLASSES.has(classify(chars[idx], props))) {
				idx++;
			}
			exponent = { minDigits: idx - exponentDigitsStart };
		}
	}

	validatePassiveSpan(chars.slice(idx), props, picture);
	const suffix = chars.slice(idx).join('');

	return { exponent, mantissa, prefix, suffix };
}

export function parsePicture(picture: string, props: DecimalFormatProperties): ParsedPicture {
	const subPictures = picture.split(props.patternSeparator);
	if (subPictures.length > 2) {
		throw errFODF1310(picture);
	}

	const positive = parseSubPicture(subPictures[0], props, picture);
	const negative =
		subPictures.length === 2 ? parseSubPicture(subPictures[1], props, picture) : null;

	return { negative, positive };
}
