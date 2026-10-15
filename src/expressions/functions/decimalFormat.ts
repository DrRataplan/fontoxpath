export type DecimalFormatProperties = {
	decimalSeparator: string;
	digit: string;
	exponentSeparator: string;
	groupingSeparator: string;
	infinity: string;
	minusSign: string;
	nan: string;
	patternSeparator: string;
	perMille: string;
	percent: string;
	zeroDigit: string;
};

// The properties whose value must be exactly one Unicode codepoint. `infinity` and `nan` are
// arbitrary strings and are intentionally excluded.
export const SINGLE_CHARACTER_PROPERTY_NAMES: (keyof DecimalFormatProperties)[] = [
	'decimalSeparator',
	'digit',
	'exponentSeparator',
	'groupingSeparator',
	'minusSign',
	'patternSeparator',
	'perMille',
	'percent',
	'zeroDigit',
];

export const DEFAULT_DECIMAL_FORMAT_PROPERTIES: DecimalFormatProperties = {
	decimalSeparator: '.',
	digit: '#',
	exponentSeparator: 'e',
	groupingSeparator: ',',
	infinity: 'Infinity',
	minusSign: '-',
	nan: 'NaN',
	patternSeparator: ';',
	perMille: '‰',
	percent: '%',
	zeroDigit: '0',
};

// Maps the lexical name of a decimal-format property (as used in `declare decimal-format` and in
// the QT3 test catalog's <decimal-format> environment element) to its key on
// DecimalFormatProperties.
export const DECIMAL_FORMAT_PROPERTY_NAME_BY_LEXICAL_NAME: {
	[lexicalName: string]: keyof DecimalFormatProperties;
} = {
	'decimal-separator': 'decimalSeparator',
	digit: 'digit',
	'exponent-separator': 'exponentSeparator',
	'grouping-separator': 'groupingSeparator',
	infinity: 'infinity',
	'minus-sign': 'minusSign',
	NaN: 'nan',
	'pattern-separator': 'patternSeparator',
	'per-mille': 'perMille',
	percent: 'percent',
	'zero-digit': 'zeroDigit',
};
