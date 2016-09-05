define([
	'../dataTypes/BooleanValue',
	'../dataTypes/DoubleValue',
	'../dataTypes/IntegerValue',
	'../dataTypes/QNameValue',
	'../dataTypes/Sequence',
	'../dataTypes/StringValue',
	'../dataTypes/sortNodeValues'

], function (
	BooleanValue,
	DoubleValue,
	IntegerValue,
	QNameValue,
	Sequence,
	StringValue,
	sortNodeValues
) {
	'use strict';

	function contextItemAsFirstArgument (fn, dynamicContext) {
		return fn(dynamicContext, dynamicContext.contextItem);
	}

	function fnBoolean (dynamicContext, sequence) {
		return Sequence.singleton(new BooleanValue(sequence.getEffectiveBooleanValue()));
	}

	function fnConcat (dynamicContext) {
		var stringSequences = Array.from(arguments).slice(1);
		stringSequences = stringSequences.map(function (sequence) { return sequence.atomize(); });
		var strings = stringSequences.map(function (sequence) {
				return sequence.value[0].value;
			});
		// RangeExpr is inclusive: 1 to 3 will make (1,2,3)
		return Sequence.singleton(new StringValue(strings.join('')));
	}

	function fnCount (dynamicContext, sequence) {
		return Sequence.singleton(new IntegerValue(sequence.value.length));
	}

	function fnFalse () {
		return Sequence.singleton(new BooleanValue(false));
	}

	function fnLast (dynamicContext) {
		return Sequence.singleton(new IntegerValue(dynamicContext.contextSequence.value.length));
	}

	function fnName (dynamicContext, sequence) {
		if (sequence.isEmpty()) {
			return sequence;
		}
		return fnString(dynamicContext, fnNodeName(dynamicContext, sequence));
	}

	function fnNodeName (dynamicContext, sequence) {
		if (sequence.isEmpty()) {
			return sequence;
		}
		return Sequence.singleton(new QNameValue(sequence.value[0].nodeName));
	}

	function fnNormalizeSpace (dynamicContext, arg) {
		if (arg.isEmpty()) {
			return Sequence.singleton(new StringValue(''));
		}
		var string = arg.value[0].value;
		return Sequence.singleton(new StringValue(string.replace(/\s\s/g, ' ')));
	}

	function fnNumber (dynamicContext, sequence) {
		if (sequence.isEmpty()) {
			return Sequence.singleton(new DoubleValue(NaN));
		}
		return Sequence.singleton(DoubleValue.cast(sequence.value[0]));
	}

	function fnPosition (dynamicContext) {
		// Note: +1 because XPath is one-based
		return Sequence.singleton(new IntegerValue(dynamicContext.contextSequence.value.indexOf(dynamicContext.contextItem.value[0]) + 1));
	}

	function fnReverse (dynamicContext, sequence) {
		return new Sequence(sequence.value.reverse());
	}

	function fnString (dynamicContext, sequence) {
		if (sequence.isEmpty()) {
			return Sequence.singleton(new StringValue(''));
		}
		if (sequence.value[0].instanceOfType('node()')) {
			return Sequence.singleton(sequence.value[0].getStringValue());
		}
		return Sequence.singleton(StringValue.cast(sequence.value[0]));
	}

	function fnStringJoin (dynamicContext, sequence, separator) {
		var separatorString = separator.value[0].value,
			joinedString = sequence.value.map(function (stringValue) {
				return stringValue.value;
			}).join(separatorString);
		return Sequence.singleton(new StringValue(joinedString));
	}

	function fnStringLength (dynamicContext, sequence) {
		if (sequence.isEmpty()) {
			return Sequence.singleton(new IntegerValue(0));
		}
		// In ES6, Array.from(💩).length === 1
		return Sequence.singleton(new IntegerValue(Array.from(sequence.value[0].value).length));
	}

	function fnTokenize (dynamicContext, input, pattern, flags) {
		if (input.isEmpty() || input.value[0].value.length === 0) {
			return Sequence.empty();
		}
		var string = input.value[0].value,
		patternString = pattern.value[0].value;
		return new Sequence(
			string.split(new RegExp(patternString))
				.map(function (token) {return new StringValue(token);}));
	}

	function fnTrue () {
		return Sequence.singleton(new BooleanValue(true));
	}

	function opTo (dynamicContext, fromValue, toValue) {
		var from = fromValue.value[0].value,
		to = toValue.value[0].value;
		if (from > to) {
			return Sequence.empty();
		}
		// RangeExpr is inclusive: 1 to 3 will make (1,2,3)
		return new Sequence(
			Array.apply(null, {length: to - from + 1})
				.map(function (_, i) {
					return new IntegerValue(from+i);
				}));
	}

	function opExcept (dynamicContext, firstNodes, secondNodes) {
		var allNodes = firstNodes.value.filter(function (nodeA) {
				return secondNodes.value.every(function (nodeB) {
					return nodeA.nodeId !== nodeB.nodeId;
				});
			});
		return new Sequence(sortNodeValues(dynamicContext.domFacade, allNodes));
	}

	function opIntersect (dynamicContext, firstNodes, secondNodes) {
		var allNodes = firstNodes.value.filter(function (nodeA) {
				return secondNodes.value.some(function (nodeB) {
					return nodeA.nodeId === nodeB.nodeId;
				});
			});
		return new Sequence(sortNodeValues(dynamicContext.domFacade, allNodes));
	}

	function fnNot (dynamicContext, sequence) {
		return Sequence.singleton(new BooleanValue(!sequence.getEffectiveBooleanValue()));
	}

	return [
		{
			name: 'boolean',
			typeDescription: ['item()*'],
			callFunction: fnBoolean
		},

		{
			name: 'concat',
			typeDescription: ['xs:anyAtomicType?', 'xs:anyAtomicType?', '...'],
			callFunction: fnConcat
		},

		{
			name: 'count',
			typeDescription: ['item()*'],
			callFunction: fnCount
		},

		{
			name: 'false',
			typeDescription: [],
			callFunction: fnFalse
		},

		{
			name: 'last',
			typeDescription: [],
			callFunction: fnLast
		},

		{
			name: 'name',
			typeDescription: ['node()?'],
			callFunction: fnName
		},

		{
			name: 'name',
			typeDescription: [],
			callFunction: contextItemAsFirstArgument.bind(undefined, fnName)
		},

		{
			name: 'node-name',
			typeDescription: ['node()?'],
			callFunction: fnNodeName
		},

		{
			name: 'node-name',
			typeDescription: [],
			callFunction: contextItemAsFirstArgument.bind(undefined, fnNodeName)
		},

		{
			name: 'normalize-space',
			typeDescription: ['xs:string?'],
			callFunction: fnNormalizeSpace
		},

		{
			name: 'normalize-space',
			typeDescription: [],
			callFunction: function (dynamicContext) {
				return fnNormalizeSpace(dynamicContext, fnString(dynamicContext, dynamicContext.contextItem));
			}
		},

		{
			name: 'not',
			typeDescription: ['item()*'],
			callFunction: fnNot
		},

		{
			name: 'number',
			typeDescription: ['xs:anyAtomicType?'],
			callFunction: fnNumber
		},

		{
			name: 'op:to',
			typeDescription: ['xs:integer', 'xs:integer'],
			callFunction: opTo
		},

		{
			name: 'op:intersect',
			typeDescription: ['node()*', 'node()*'],
			callFunction: opIntersect
		},

		{
			name: 'op:except',
			typeDescription: ['node()*', 'node()*'],
			callFunction: opExcept
		},

		{
			name: 'position',
			typeDescription: [],
			callFunction: fnPosition
		},

		{
			name: 'reverse',
			typeDescription: ['item()*'],
			callFunction: fnReverse
		},

		{
			name: 'string',
			typeDescription: ['item()?'],
			callFunction: fnString
		},

		{
			name: 'string',
			typeDescription: [],
			callFunction: contextItemAsFirstArgument.bind(undefined, fnString)
		},

		{
			name: 'string-join',
			typeDescription: ['xs:string*', 'xs:string'],
			callFunction: fnStringJoin
		},

		{
			name: 'string-join',
			typeDescription: ['xs:string*'],
			callFunction: function (dynamicContext, arg1) {
				return fnStringJoin(dynamicContext, arg1, Sequence.singleton(new StringValue('')));
			}
		},

		{
			name: 'string-length',
			typeDescription: ['xs:string?'],
			callFunction: fnStringLength
		},
		{
			name: 'number',
			typeDescription: [],
			callFunction: contextItemAsFirstArgument.bind(undefined, fnNumber)
		},

		{
			name: 'string-length',
			typeDescription: [],
			callFunction: function (dynamicContext) {
				return fnStringLength(dynamicContext, fnString(dynamicContext, dynamicContext.contextItem));
			}
		},

		{
			name: 'tokenize',
			typeDescription: ['xs:string?', 'xs:string', 'xs:string'],
			callFunction: function (dynamicContext, input, pattern, flags) {
				throw new Error('Not implemented: Using flags in tokenize is not supported');
			}
		},

		{
			name: 'tokenize',
			typeDescription: ['xs:string?', 'xs:string'],
			callFunction: fnTokenize
		},

		{
			name: 'tokenize',
			typeDescription: ['xs:string?'],
			callFunction: function (dynamicContext, input) {
				return fnTokenize(dynamicContext, fnNormalizeSpace(dynamicContext, input), Sequence.singleton(new StringValue(' ')));
			}
		},

		{
			name: 'true',
			typeDescription: [],
			callFunction: fnTrue
		}
	];
});