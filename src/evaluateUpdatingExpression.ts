import IDocumentWriter from './documentWriter/IDocumentWriter';
import IDomFacade from './domFacade/IDomFacade';
import buildContext from './evaluationUtils/buildContext';
import { printAndRethrowError } from './evaluationUtils/printAndRethrowError';
import DynamicContext from './expressions/DynamicContext';
import ExecutionParameters from './expressions/ExecutionParameters';
import Expression from './expressions/Expression';
import PossiblyUpdatingExpression from './expressions/PossiblyUpdatingExpression';
import UpdatingExpressionResult from './expressions/UpdatingExpressionResult';
import { IterationResult } from './expressions/util/iterators';
import INodesFactory from './nodesFactory/INodesFactory';

export type UpdatingOptions = {
	debug?: boolean;
	documentWriter?: IDocumentWriter;
	moduleImports?: { [s: string]: string };
	namespaceResolver?: (s: string) => string | null;
	nodesFactory?: INodesFactory;
};

/**
 * Evaluates an XPath on the given contextItem. Returns the string result as if the XPath is wrapped in string(...).
 *
 * @param  updateScript The updateScript to execute. Supports XPath 3.1.
 * @param  contextItem  The initial context for the script.
 * @param  domFacade    The domFacade (or DomFacade like interface) for retrieving relations.
 * @param  variables    Extra variables (name to value). Values can be number, string, boolean, nodes or object literals and arrays.
 * @param  options      Extra options for evaluating this XPath.
 *
 * @return The query result and pending update list.
 */
export default async function evaluateUpdatingExpression(
	updateScript: string,
	contextItem?: any | null,
	domFacade?: IDomFacade | null,
	variables?: { [s: string]: any } | null,
	options?: UpdatingOptions | null
): Promise<{ pendingUpdateList: object[]; xdmValue: any[] }> {
	options = options || {};

	let dynamicContext: DynamicContext;
	let executionParameters: ExecutionParameters;
	let expression: Expression;
	try {
		const context = buildContext(
			updateScript,
			contextItem,
			domFacade || null,
			variables || {},
			options || {},
			{
				allowUpdating: true,
				allowXQuery: true,
				debug: options['debug']
			}
		);
		dynamicContext = context.dynamicContext;
		executionParameters = context.executionParameters;
		expression = context.expression;
	} catch (error) {
		printAndRethrowError(updateScript, error);
	}

	if (!expression.isUpdating) {
		throw new Error(
			`The expression ${updateScript} is not updating and can not be executed as an updating expression.`
		);
	}

	let attempt: IterationResult<UpdatingExpressionResult>;
	try {
		const resultIterator = (expression as PossiblyUpdatingExpression).evaluateWithUpdateList(
			dynamicContext,
			executionParameters
		);

		attempt = resultIterator.next();
		while (!attempt.ready) {
			await attempt.promise;
			attempt = resultIterator.next();
		}
	} catch (error) {
		printAndRethrowError(updateScript, error);
	}

	return {
		['pendingUpdateList']: attempt.value.pendingUpdateList.map(update =>
			update.toTransferable()
		),
		['xdmValue']: attempt.value.xdmValue
	};
}