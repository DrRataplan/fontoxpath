import Expression from '../Expression';
import Specificity from '../Specificity';

import { DONE_TOKEN, ready } from '../util/iterators';
import createNodeValue from '../dataTypes/createNodeValue';
import isSubtypeOf from '../dataTypes/isSubtypeOf';
import atomize from '../dataTypes/atomize';
import Sequence from '../dataTypes/Sequence';
import castToType from '../dataTypes/castToType';
import concatSequences from '../util/concatSequences';

function getAttributeValueForNamespaceDeclaration (partialValueExpressions) {
	if (!partialValueExpressions.length) {
		return null;
	}
	if (partialValueExpressions.length > 1 || typeof partialValueExpressions[0] !== 'string') {
		throw new Error('XQST0022: The value of namespace declaration attributes may not contain enclosed expressions.');
	}

	return partialValueExpressions[0];
}

/**
 * @extends {Expression}
 */
class DirElementConstructor extends Expression {
	/**
	 * @param  {{prefix:string, localName: string}}
	 * @param  {!Array<!{name:Expression,partialValues:!Array<!Expression>}>}  attributes
	 * @param  {!Array<!{prefix: string, uri: string}>}     namespaceDeclarations
	 * @param  {!Array<!Expression>}  contents  Strings and enclosed expressions
	 */
	constructor (name, attributes, namespaceDeclarations, contents) {
		super(
			new Specificity({}),
			contents.concat(attributes),
			{
				canBeStaticallyEvaluated: false,
				resultOrder: Expression.RESULT_ORDERINGS.UNSORTED
			});

		this._prefix = name.prefix;
		this._name = name.localName;
		/**
		 * @type {string|null}
		 */
		this._namespaceURI = null;

		/**
		 * @type {!Object<!string, !string>}
		 */
		this._namespacesInScope = namespaceDeclarations.reduce(
			(namespacesInScope, namespaceDecl) => {
				if (namespaceDecl.prefix in namespacesInScope) {
					throw new Error(`XQST0071: The namespace declaration with the prefix ${namespaceDecl.prefix} has already been declared on the constructed element.`);
				}
				namespacesInScope[namespaceDecl.prefix] = namespaceDecl.uri;
				return namespacesInScope;
			}, {});


		this._attributes = attributes;

		this._contents = contents;
	}

	performStaticEvaluation (staticContext) {
		// Register namespace related things
		staticContext.introduceScope();
		Object.keys(this._namespacesInScope)
			.forEach(prefix => staticContext.registerNamespace(prefix, this._namespacesInScope[prefix]));

		this._childExpressions.forEach(subselector => subselector.performStaticEvaluation(staticContext));

		const namespaceURI = staticContext.resolveNamespace(this._prefix);

		if (namespaceURI === undefined && this._prefix) {
			throw new Error(`XPST0081: The prefix ${this._prefix} could not be resolved.`);
		}
		this._namespaceURI = namespaceURI || null;

		staticContext.removeScope();
	}

	evaluate (dynamicContext, executionParameters) {
		/**
		 * @type {INodesFactory}
		 */
		const nodesFactory = executionParameters.nodesFactory;

		const attributes = this._attributes.map(attribute => ({
			value: null,
			sequence: attribute.evaluateMaybeStatically(
				dynamicContext,
				executionParameters)
		}));

		let attributePhaseDone = false;

		let childNodesPhaseDone = false;
		let childNodesSequences;

		let done = false;
		return new Sequence({
			next: () => {
				if (done) {
					return DONE_TOKEN;
				}
				if (!attributePhaseDone) {
					let unfinishedAttributeRetrieve = attributes.find(attr => !attr.value);
					while (unfinishedAttributeRetrieve) {
						const attributeValues = unfinishedAttributeRetrieve.sequence.tryGetAllValues();
						if (!attributeValues.ready) {
							return attributeValues;
						}
						unfinishedAttributeRetrieve.value = vals
							.map(val => val.value.map(v => castToType(v, 'xs:string').value).join(' ')).join('');
						unfinishedAttributeRetrieve.hasAllValues = true;
						unfinishedAttributeRetrieve = attributes.find(attr => !attr.hasAllValues);
					}
					attributePhaseDone = true;
				}

				if (!childNodesPhaseDone) {
					// Accumulate all children
					childNodesSequences = concatSequences(
						this._contents.map(
							contentExpression => contentExpression.evaluateMaybeStatically(dynamicContext, executionParameters)
								.mapAll(allValues => new Sequence([allValues]))));
					childNodesPhaseDone = true;
				}

				const allChildNodesItrResult = childNodesSequences.tryGetAllValues();
				if (!allChildNodesItrResult.ready) {
					return allChildNodesItrResult;
				}

				const element = nodesFactory.createElementNS(
					this._namespaceURI,
					this._prefix ? this._prefix + ':' + this._name : this._name);

				// Plonk all attribute on the element
				attributes.forEach(attr => {
					const attrName = attr.qualifiedName.prefix ? attr.qualifiedName.prefix + ':' + attr.qualifiedName.localPart : attr.qualifiedName.localPart;
					const attributeNamespaceURI = attr.qualifiedName.namespaceURI;
					if (element.hasAttributeNS(attributeNamespaceURI, attr.qualifiedName.localPart)) {
						throw new Error(`XQST0040: The attribute ${attrName} is already present on a constructed element.`);
					}
					element.setAttributeNS(attributeNamespaceURI, attrName, attr.value);
				});

				// Plonk all childNodes, these are special though
				allChildNodesItrResult.value.forEach(/** {!Array<!Value>} */childNodes => {
					childNodes.forEach((childNode, i) => {
						if (isSubtypeOf(childNode.type, 'xs:anyAtomicType')) {
							const atomizedValue = castToType(atomize(childNode, executionParameters), 'xs:string').value;
							if (i !== 0 && isSubtypeOf(childNodes[i - 1].type, 'xs:anyAtomicType')) {
								element.appendChild(nodesFactory.createTextNode(' ' + atomizedValue));
								return;
							}
							element.appendChild(nodesFactory.createTextNode('' + atomizedValue));
							return;
						}
						if (isSubtypeOf(childNode.type, 'attribute()')) {
							const attrNode = /** @type {!Attr} */ (childNode.value);
							// The contents may include attributes, 'clone' them and set them on the element
							if (element.hasAttributeNS(attrNode.namespaceURI, attrNode.localName)) {
								throw new Error(
									`XQST0040: The attribute ${attrNode.name} is already present on a constructed element.`);
							}
							element.setAttributeNS(
								attrNode.namespaceURI,
								attrNode.prefix ?
									attrNode.prefix + ':' + attrNode.localName : attrNode.localName,
								attrNode.value);
							return;
						}

						if (isSubtypeOf(childNode.type, 'node()')) {
							// Deep clone child elements
							// TODO: skip copy if the childNode has already been created in the expression
							element.appendChild(childNode.value.cloneNode(true));
							return;
						}

						// We now only have unatomizable types left
						// (function || map) && !array
						if (isSubtypeOf(childNode.type, 'function(*)') && !isSubtypeOf(childNode.type, 'array(*)')) {
							throw new Error(`FOTY0013: Atomization is not supported for ${childNode.type}.`);
						}
						throw new Error(`Atomizing ${childNode.type} is not implemented.`);
					});
				});

				element.normalize();

				done = true;

				return ready(createNodeValue(element));
			}
		});
	}
}

export default DirElementConstructor;
