import atomize from '../dataTypes/atomize';
import castToType from '../dataTypes/castToType';
import isSubtypeOf from '../dataTypes/isSubtypeOf';
import promoteToType from '../dataTypes/promoteToType';
import ExecutionParameters from '../ExecutionParameters';

import ISequence from '../dataTypes/ISequence';
import TypeDeclaration from '../dataTypes/TypeDeclaration';

function mapItem(argumentItem, type, executionParameters, functionName) {
	if (isSubtypeOf(argumentItem.type, type)) {
		return argumentItem;
	}

	if (isSubtypeOf(argumentItem.type, 'node()')) {
		argumentItem = atomize(argumentItem, executionParameters);
	}
	// Everything is an anyAtomicType, so no casting necessary.
	if (type === 'xs:anyAtomicType') {
		return argumentItem;
	}
	if (isSubtypeOf(argumentItem.type, 'xs:untypedAtomic')) {
		// We might be able to cast this to the wished type
		const item = castToType(argumentItem, type);
		if (!item) {
			throw new Error(
				`XPTY0004 Unable to convert ${argumentItem.type} to type ${type} while calling ${functionName}`
			);
		}
		return item;
	}

	// We need to promote this
	const item = promoteToType(argumentItem, type);
	if (!item) {
		throw new Error(
			`XPTY0004 Unable to cast ${argumentItem.type} to type ${type} while calling ${functionName}`
		);
	}
	return item;
}

/**
 * Test whether the provided argument is valid to be used as an function argument of the given type
 */
export const transformArgument = (
	argumentType: TypeDeclaration,
	argument: ISequence,
	executionParameters: ExecutionParameters,
	functionName: string
): ISequence => {
	switch (argumentType.occurrence) {
		case '?':
			return argument.switchCases({
				default: () =>
					argument.map(value =>
						mapItem(value, argumentType.type, executionParameters, functionName)
					),
				multiple: () => {
					throw new Error(
						`XPTY0004: Multiplicity of function argument of type ${
							argumentType.type
						}${argumentType.occurrence ||
							''} for ${functionName} is incorrect. Expected "?", but got "+".`
					);
				}
			});
		case '+':
			return argument.switchCases({
				empty: () => {
					throw new Error(
						`XPTY0004: Multiplicity of function argument of type ${
							argumentType.type
						}${argumentType.occurrence ||
							''} for ${functionName} is incorrect. Expected "+", but got "empty-sequence()"`
					);
				},
				default: () =>
					argument.map(value =>
						mapItem(value, argumentType.type, executionParameters, functionName)
					)
			});
		case '*':
			return argument.map(value =>
				mapItem(value, argumentType.type, executionParameters, functionName)
			);
		default:
			// excactly one
			return argument.switchCases({
				singleton: () =>
					argument.map(value =>
						mapItem(value, argumentType.type, executionParameters, functionName)
					),
				default: () => {
					throw new Error(
						`XPTY0004: Multiplicity of function argument of type ${
							argumentType.type
						}${argumentType.occurrence ||
							''} for ${functionName} is incorrect. Expected exactly one`
					);
				}
			});
	}
};
