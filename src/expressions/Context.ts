import { LexicalQualifiedName, ResolvedQualifiedName } from '../types/Options';
import ISequence from './dataTypes/ISequence';
import DynamicContext from './DynamicContext';
import { DecimalFormatProperties } from './functions/decimalFormat';
import ExecutionParameters from './ExecutionParameters';
import { FunctionProperties } from './functions/functionRegistry';

export default interface IContext {
	registeredDefaultFunctionNamespaceURI: string | null;
	registeredVariableBindingByHashKey: { [s: string]: string }[];
	registeredVariableDeclarationByHashKey: {
		[hash: string]: (
			dynamicContext: DynamicContext,
			executionParameters: ExecutionParameters,
		) => ISequence;
	};
	lookupDecimalFormat(
		name: { localName: string; namespaceURI: string } | null,
	): DecimalFormatProperties | undefined;
	lookupFunction(
		namespaceURI: string,
		localName: string,
		arity: number,
		skipExternal?: boolean,
	): FunctionProperties | null;
	lookupVariable(namespaceURI: string | null, localName: string): string | null;
	resolveFunctionName(lexicalQName: LexicalQualifiedName, arity: number): ResolvedQualifiedName;
	resolveNamespace(prefix: string, useExternalResolver?: boolean): string | null;
}
