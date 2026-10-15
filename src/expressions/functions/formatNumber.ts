import createAtomicValue from '../dataTypes/createAtomicValue';
import type ISequence from '../dataTypes/ISequence';
import sequenceFactory from '../dataTypes/sequenceFactory';
import { ValueType } from '../dataTypes/Value';
import type StaticContext from '../StaticContext';
import { DEFAULT_DECIMAL_FORMAT_PROPERTIES, DecimalFormatProperties } from './decimalFormat';
import {
	doubleToExactDecimal,
	ExactDecimal,
	roundToFractionDigits,
	scaleByPowerOfTen,
	toDigitStrings,
} from './exactDecimal';
import { errFODF1280 } from './FunctionOperationErrors';
import type FunctionDefinitionType from './FunctionDefinitionType';
import {
	ExponentPicture,
	MantissaPicture,
	ParsedPicture,
	parsePicture,
	SubPicture,
} from './formatNumberPicture';

function resolveDecimalFormatName(
	value: string,
	staticContext: StaticContext,
): { localName: string; namespaceURI: string } {
	const clarkNotationMatch = /^Q\{([^{}]*)\}(.+)$/.exec(value);
	if (clarkNotationMatch) {
		return { localName: clarkNotationMatch[2], namespaceURI: clarkNotationMatch[1] };
	}

	const colonIndex = value.indexOf(':');
	if (colonIndex === -1) {
		return { localName: value, namespaceURI: '' };
	}

	const prefix = value.slice(0, colonIndex);
	const localName = value.slice(colonIndex + 1);
	const namespaceURI = staticContext.resolveNamespace(prefix);
	if (!namespaceURI) {
		// An unresolvable prefix is reported the same way as an unknown decimal-format name.
		throw errFODF1280(value);
	}
	return { localName, namespaceURI };
}

function groupIntegerDigits(
	digits: string,
	groupingWidths: readonly number[],
	separator: string,
): string {
	if (groupingWidths.length === 0 || digits.length === 0) {
		return digits;
	}

	// Regular (infinitely-repeating) grouping, using primary's width, requires every other
	// explicit segment to be no *wider* than primary (narrower or equal is fine, e.g. a single
	// leading "0," or a single narrower outer group); with 3+ segments, the secondary segment
	// (the one right outside primary) must additionally be *exactly* as wide as primary. Any
	// violation makes the whole picture "irregular": each explicit segment then keeps its own
	// width, with the outermost absorbing any remaining digits unsplit, regardless of its own
	// nominal width.
	const isRegular =
		groupingWidths.slice(1).every((w) => w <= groupingWidths[0]) &&
		(groupingWidths.length < 3 || groupingWidths[1] === groupingWidths[0]);
	const groups: string[] = [];
	let pos = digits.length;

	if (isRegular) {
		const width = groupingWidths[0];
		while (pos > 0) {
			const take = Math.min(width, pos);
			groups.unshift(digits.slice(pos - take, pos));
			pos -= take;
		}
	} else {
		for (let i = 0; i < groupingWidths.length && pos > 0; i++) {
			const isOutermost = i === groupingWidths.length - 1;
			const take = isOutermost ? pos : Math.min(groupingWidths[i], pos);
			groups.unshift(digits.slice(pos - take, pos));
			pos -= take;
		}
	}

	return groups.join(separator);
}

function groupFractionDigits(
	digits: string,
	groupingWidths: readonly number[],
	separator: string,
): string {
	if (groupingWidths.length === 0) {
		return digits;
	}

	const groups: string[] = [];
	let pos = 0;
	for (const width of groupingWidths) {
		groups.push(digits.slice(pos, pos + width));
		pos += width;
	}
	return groups.join(separator);
}

function trimTrailingZeros(digits: string, minLength: number): string {
	let end = digits.length;
	while (end > minLength && digits[end - 1] === '0') {
		end--;
	}
	return digits.slice(0, end);
}

/**
 * Translate a string of ASCII '0'-'9' digits to the decimal-format's configured digit family
 * (the 10 consecutive codepoints starting at zero-digit).
 */
function translateDigits(digits: string, props: DecimalFormatProperties): string {
	if (props.zeroDigit === '0') {
		return digits;
	}
	const zeroDigitCodepoint = props.zeroDigit.codePointAt(0);
	return Array.from(digits)
		.map((char) => String.fromCodePoint(zeroDigitCodepoint + (char.charCodeAt(0) - 48)))
		.join('');
}

/**
 * Render the (non-negative) magnitude of a number using a sub-picture's mantissa/exponent
 * structure and the active decimal-format's characters. Percent/per-mille scaling, rounding,
 * grouping and (if applicable) scientific-notation exponent selection all happen here.
 */
function renderMagnitude(
	magnitude: number,
	mantissa: MantissaPicture,
	exponentPicture: ExponentPicture | null,
	props: DecimalFormatProperties,
): string {
	// Percent/per-mille scaling is done as an ordinary floating point multiplication - matching
	// how the rest of the engine computes with numbers - rather than an exact decimal-point
	// shift, so that e.g. format-number($v, '...%') and format-number($v * 100, '...') agree bit
	// for bit even at extreme fraction-digit precision.
	const scaledMagnitude = mantissa.hasPercent
		? magnitude * 100
		: mantissa.hasPerMille
		? magnitude * 1000
		: magnitude;

	if (!Number.isFinite(scaledMagnitude)) {
		// Percent/per-mille scaling of a very large finite value can itself overflow to
		// infinity; render that the same way an actually-infinite input would be, but still with
		// the scaling character (it comes from the picture, not from the value).
		let overflowResult = props.infinity;
		if (mantissa.hasPercent) {
			overflowResult = mantissa.scalingCharacterIsLeading
				? props.percent + overflowResult
				: overflowResult + props.percent;
		} else if (mantissa.hasPerMille) {
			overflowResult = mantissa.scalingCharacterIsLeading
				? props.perMille + overflowResult
				: overflowResult + props.perMille;
		}
		return overflowResult;
	}

	const exact = doubleToExactDecimal(scaledMagnitude);

	let mantissaExact: ExactDecimal;
	let exponentValue = 0;

	if (exponentPicture) {
		// If the picture requires zero integer digits and provides no fraction-digit
		// placeholders at all (no fraction part, or an empty one like "#." or "#e0"), rounding to
		// the picture's own (zero) fraction-digit budget would discard the value entirely (e.g.
		// 0.2 -> "0"). A single fraction digit is synthesized for the rounding step in that case
		// so the mantissa keeps at least one significant digit; trimming still uses the picture's
		// real (zero) minimum, so an exact integer value still renders without one.
		const roundingFractionDigits =
			mantissa.integerPart.minDigits === 0 && mantissa.fractionPart.maxDigits === 0
				? 1
				: mantissa.fractionPart.maxDigits;

		if (exact.numerator === BigInt(0)) {
			mantissaExact = roundToFractionDigits(exact, roundingFractionDigits);
		} else {
			const targetIntegerDigits = mantissa.integerPart.minDigits;
			const magnitudeDigitCount = exact.numerator.toString().length - exact.scale;
			exponentValue = magnitudeDigitCount - targetIntegerDigits;
			// A rounding carry may leave more integer digits than targetIntegerDigits (e.g.
			// 0.99999999 rounding up to 1). That's fine - the exponent is *not* re-adjusted for
			// it, the integer part is simply allowed to grow beyond its nominal minimum.
			const scaled = scaleByPowerOfTen(exact, -exponentValue);
			mantissaExact = roundToFractionDigits(scaled, roundingFractionDigits);
		}
	} else {
		mantissaExact = roundToFractionDigits(exact, mantissa.fractionPart.maxDigits);
	}

	const { integerDigits, fractionDigits } = toDigitStrings(mantissaExact);

	const paddedInteger = integerDigits.padStart(mantissa.integerPart.minDigits, '0');
	const isIntegerZero = paddedInteger.replace(/0/g, '') === '';

	// A leading zero-valued integer part is suppressed entirely (no "0" is shown) when the
	// picture doesn't require any mandatory integer digits, but only if there is something else
	// (a fraction part) for the number to be rendered against - a plain integer-only picture like
	// "#" still shows "0", and so does one with a decimal-separator but no fraction placeholders
	// at all like "#." (there is nothing for the fraction part to show in its place either).
	// Scientific notation follows a different, already-confirmed rule: it suppresses based on
	// whether the picture has *any* integer-part placeholder character at all (mandatory or
	// optional), regardless of a fraction part.
	const suppressInteger = exponentPicture
		? !mantissa.integerPart.hasDigitPlaceholder && isIntegerZero
		: mantissa.fractionPart.maxDigits > 0 &&
		  mantissa.integerPart.minDigits === 0 &&
		  isIntegerZero;

	let renderedInteger = suppressInteger ? '' : paddedInteger;
	if (renderedInteger) {
		renderedInteger = groupIntegerDigits(
			translateDigits(renderedInteger, props),
			mantissa.integerPart.groupingWidths,
			props.groupingSeparator,
		);
	}

	let renderedFraction: string;
	if (mantissa.fractionPart.groupingWidths.length > 0) {
		renderedFraction = groupFractionDigits(
			translateDigits(fractionDigits, props),
			mantissa.fractionPart.groupingWidths,
			props.groupingSeparator,
		);
	} else {
		// In scientific notation, a picture whose integer part has no placeholder character at
		// all (e.g. ".#e0") is structurally "fraction-only" - even when a rounding carry forces
		// an integer digit to appear anyway, at least one fraction digit is still kept (rather
		// than trimmed away as a trailing zero) to preserve that shape.
		const minFractionDigitsForTrimming =
			exponentPicture && !mantissa.integerPart.hasDigitPlaceholder
				? Math.max(mantissa.fractionPart.minDigits, 1)
				: mantissa.fractionPart.minDigits;
		let trimmedFraction = trimTrailingZeros(fractionDigits, minFractionDigitsForTrimming);
		// Never render a completely empty number: if suppressing the integer part left nothing
		// to show at all, keep (at least) one fraction digit even if it would otherwise be
		// trimmed away.
		if (
			!exponentPicture &&
			!renderedInteger &&
			!trimmedFraction &&
			mantissa.fractionPart.hasDecimalSeparator &&
			fractionDigits.length > 0
		) {
			trimmedFraction = fractionDigits.slice(0, 1);
		}
		renderedFraction = translateDigits(trimmedFraction, props);
	}

	let result = renderedInteger;
	if (renderedFraction.length > 0) {
		result += props.decimalSeparator + renderedFraction;
	}

	if (mantissa.hasPercent) {
		result = mantissa.scalingCharacterIsLeading
			? props.percent + result
			: result + props.percent;
	} else if (mantissa.hasPerMille) {
		result = mantissa.scalingCharacterIsLeading
			? props.perMille + result
			: result + props.perMille;
	}

	if (exponentPicture) {
		const exponentDigits = translateDigits(
			Math.abs(exponentValue).toString().padStart(exponentPicture.minDigits, '0'),
			props,
		);
		const exponentSign = exponentValue < 0 ? props.minusSign : '';
		result += props.exponentSeparator + exponentSign + exponentDigits;
	}

	return result;
}

function renderSignedNumber(
	value: number,
	picture: ParsedPicture,
	props: DecimalFormatProperties,
): string {
	if (Number.isNaN(value)) {
		return props.nan;
	}

	const isNegative = value < 0 || Object.is(value, -0);
	const explicitSubPicture: SubPicture | null = isNegative ? picture.negative : null;
	const activeSubPicture = explicitSubPicture || picture.positive;

	let body: string;
	if (!Number.isFinite(value)) {
		body = activeSubPicture.prefix + props.infinity + activeSubPicture.suffix;
	} else {
		const digits = renderMagnitude(
			Math.abs(value),
			activeSubPicture.mantissa,
			activeSubPicture.exponent,
			props,
		);
		body = activeSubPicture.prefix + digits + activeSubPicture.suffix;
	}

	return isNegative && !explicitSubPicture ? props.minusSign + body : body;
}

const fnFormatNumber: FunctionDefinitionType = (
	_dynamicContext,
	_executionParameters,
	staticContext,
	sequence,
	pictureSequence,
	decimalFormatNameSequence,
) => {
	const pictureValue = pictureSequence.first().value as string;

	let decimalFormatName: { localName: string; namespaceURI: string } | null = null;
	if (decimalFormatNameSequence && !decimalFormatNameSequence.isEmpty()) {
		const nameValue = decimalFormatNameSequence.first().value as string;
		decimalFormatName = resolveDecimalFormatName(nameValue, staticContext);
	}

	let props: DecimalFormatProperties;
	if (decimalFormatName === null) {
		props = staticContext.lookupDecimalFormat(null) || DEFAULT_DECIMAL_FORMAT_PROPERTIES;
	} else {
		const found = staticContext.lookupDecimalFormat(decimalFormatName);
		if (!found) {
			throw errFODF1280(
				decimalFormatName.namespaceURI
					? `Q{${decimalFormatName.namespaceURI}}${decimalFormatName.localName}`
					: decimalFormatName.localName,
			);
		}
		props = found;
	}

	const parsedPicture = parsePicture(pictureValue, props);

	const valueItem = sequence.isEmpty() ? null : sequence.first();
	const numericValue = valueItem === null ? NaN : (valueItem.value as number);

	const result = renderSignedNumber(numericValue, parsedPicture, props);
	return sequenceFactory.singleton(createAtomicValue(result, ValueType.XSSTRING));
};

export default fnFormatNumber;
