define([
	'./Selector',
	'./CompositeSelector',
	'../adaptNodeSpecToSelector',

	'./AttributeSelector',
	'./HasAncestorSelector',
	'./HasChildSelector',
	'./HasDescendantSelector',
	'./HasParentSelector',
	'./InvertedSelector',
	'./NodeNameSelector',
	'./NodePredicateSelector',
	'./NodeTypeSelector'
], function (
	Selector,
	CompositeSelector,
	adaptNodeSpecToSelector,

	AttributeSelector,
	HasAncestorSelector,
	HasChildSelector,
	HasDescendantSelector,
	HasParentSelector,
	InvertedSelector,
	NodeNameSelector,
	NodePredicateSelector
) {
	'use strict';

	/**
	 * @param  {String}           attributeName
	 * @param  {String|String[]}  [attributeValues]  if omitted, the selector matches if the attribute is present
	 */
	Selector.prototype.requireAttribute = function (attributeName, attributeValues) {
		if (attributeValues !== undefined && !Array.isArray(attributeValues)) {
			attributeValues = [attributeValues];
		}

		return new CompositeSelector(this, new AttributeSelector(attributeName, attributeValues));
	};

	/**
	 * @param  {Selector|NodeSpec}  ancestorSelector
	 */
	Selector.prototype.requireAncestor = function (ancestorSelector) {
		return new CompositeSelector(
			this,
			new HasAncestorSelector(adaptNodeSpecToSelector(ancestorSelector)));
	};

	/**
	 * @param  {Selector|NodeSpec}  childSelector
	 */
	Selector.prototype.requireChild = function (childSelector) {
		return new CompositeSelector(
			this,
			new HasChildSelector(adaptNodeSpecToSelector(childSelector)));
	};

	/**
	 * @param  {Selector|NodeSpec}  descendantSelector
	 */
	Selector.prototype.requireDescendant = function (descendantSelector) {
		return new CompositeSelector(
			this,
			new HasDescendantSelector(adaptNodeSpecToSelector(descendantSelector)));
	};

	/**
	 * @param  {Selector|NodeSpec}  parentSelector
	 */
	Selector.prototype.requireParent = function (parentSelector) {
		return new CompositeSelector(
			this,
			new HasParentSelector(adaptNodeSpecToSelector(parentSelector)));
	};

	/**
	 * @param  {Selector|NodeSpec}  selectorToInvert
	 */
	Selector.prototype.requireNot = function (selectorToInvert) {
		return new CompositeSelector(
			this,
			new InvertedSelector(adaptNodeSpecToSelector(selectorToInvert)));
	};

	/**
	 * @param  {Function}  isMatchingNode
	 */
	Selector.prototype.requireNodePredicate = function (isMatchingNode) {
		return new CompositeSelector(this, new NodePredicateSelector(isMatchingNode));
	};
});
