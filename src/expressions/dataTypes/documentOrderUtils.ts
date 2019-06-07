import {
	ConcreteNode,
	NODE_TYPES,
	ConcreteChildNode,
	ConcreteAttributeNode
} from '../../domFacade/ConcreteNode';
import IDomFacade from '../../domFacade/IDomFacade';
import IWrappingDomFacade from '../../domFacade/IWrappingDomFacade';
import isSubtypeOf from './isSubtypeOf';
import Value from './Value';

/**
 * Compares positions of given nodes in the given state, assuming they share a common parent
 *
 * @param  domFacade The domFacade in which to consider the nodes
 * @param  node1     The first node
 * @param  node2      The second node
 *
 * @return Returns 0 if node1 equals node2, -1 if node1 precedes node2, and 1 otherwise
 */
function compareSiblingElements(
	domFacade: IDomFacade,
	node1: ConcreteNode,
	node2: ConcreteNode
): number {
	if (node1 === node2) {
		return 0;
	}

	const parentNode = domFacade.getParentNode(node1, null);
	const childNodes = domFacade.getChildNodes(parentNode, null);
	for (let i = 0, l = childNodes.length; i < l; ++i) {
		const childNode = childNodes[i];
		if (childNode === node1) {
			return -1;
		}
		if (childNode === node2) {
			return 1;
		}
	}
	throw new Error('Nodes are not in same tree');
}

/**
 * Find all ancestors of the given node
 *
 * @param	domFacade  The domFacade to consider relations in
 * @param	node       The node to find all ancestors of
 * @return	All of the ancestors of the given node
 */
function findAllAncestors(domFacade: IWrappingDomFacade, node: ConcreteNode): ConcreteNode[] {
	const ancestors: ConcreteNode[] = [];
	for (
		let ancestor = node;
		ancestor;
		ancestor =
			node.nodeType === NODE_TYPES.DOCUMENT_NODE
				? null
				: domFacade.getParentNode(
						ancestor as ConcreteChildNode | ConcreteAttributeNode,
						null
				  )
	) {
		ancestors.unshift(ancestor);
	}

	return ancestors;
}

/**
 * Compares the given positions w.r.t. document order in this state
 *
 * @param tieBreakerArr  Results of earlier comparisons, used as a tie breaker for compares between documents
 * @param domFacade        The domFacade in which to consider the nodes
 * @param nodeA
 * @param nodeB
 *
 * @return Returns 0 if the positions are equal, -1 if the first position precedes the second,
 *						and 1 otherwise.
 */
function compareElements(
	tieBreakerArr: ConcreteNode[],
	domFacade: IWrappingDomFacade,
	nodeA: ConcreteNode,
	nodeB: ConcreteNode
): number {
	if (nodeA === nodeB) {
		return 0;
	}
	const ancestors1 = findAllAncestors(domFacade, nodeA);
	const ancestors2 = findAllAncestors(domFacade, nodeB);
	const topAncestor1 = ancestors1[0];
	const topAncestor2 = ancestors2[0];

	if (topAncestor1 !== topAncestor2) {
		// Separate trees, use earlier determined tie breakers
		let index1 = tieBreakerArr.indexOf(topAncestor1);
		let index2 = tieBreakerArr.indexOf(topAncestor2);
		if (index1 === -1) {
			index1 = tieBreakerArr.push(topAncestor1);
		}
		if (index2 === -1) {
			index2 = tieBreakerArr.push(topAncestor2);
		}
		return index1 - index2;
	}

	// Skip common ancestors
	let i, l;
	for (i = 0, l = Math.min(ancestors1.length, ancestors2.length); i < l; ++i) {
		if (ancestors1[i] !== ancestors2[i]) {
			break;
		}
	}

	if (!ancestors1[i]) {
		// All nodes under a node are higher in document order than said node
		return -1;
	}
	if (!ancestors2[i]) {
		// All nodes under a node are higher in document order than said node
		return 1;
	}
	// Compare positions under the common ancestor
	return compareSiblingElements(domFacade, ancestors1[i], ancestors2[i]);
}
function compareNodePositionsWithTieBreaker(tieBreakerArr, domFacade, node1, node2) {
	let value1, value2;
	if (isSubtypeOf(node1.type, 'attribute()') && !isSubtypeOf(node2.type, 'attribute()')) {
		value1 = domFacade.getParentNode(node1.value);
		value2 = node2.value;
		if (value1 === value2) {
			// Same element, so A
			return 1;
		}
	} else if (isSubtypeOf(node2.type, 'attribute()') && !isSubtypeOf(node1.type, 'attribute()')) {
		value1 = node1.value;
		value2 = domFacade.getParentNode(node2.value);
		if (value1 === value2) {
			// Same element, so B before A
			return -1;
		}
	} else if (isSubtypeOf(node1.type, 'attribute()') && isSubtypeOf(node2.type, 'attribute()')) {
		if (domFacade.getParentNode(node2.value) === domFacade.getParentNode(node1.value)) {
			// Sort on attributes name
			return node1.value.localName > node2.value.localName ? 1 : -1;
		}
		value1 = domFacade.getParentNode(node1.value);
		value2 = domFacade.getParentNode(node2.value);
	} else {
		value1 = node1.value;
		value2 = node2.value;
	}

	return compareElements(tieBreakerArr, domFacade, value1, value2);
}

export const compareNodePositions = function(domFacade, node1, node2) {
	return compareNodePositionsWithTieBreaker(
		domFacade.orderOfDetachedNodes,
		domFacade,
		node1,
		node2
	);
};

/**
 * Sort (and deduplicate) the nodeValues in DOM order
 * Attributes are placed after their elements, before childnodes.
 * Attributes are sorted alphabetically by their names
 *
 * @param	domFacade
 * @param	nodeValues
 *
 * @return  The sorted nodes
 */
export const sortNodeValues = function sortNodeValues(
	domFacade: IWrappingDomFacade,
	nodeValues: Value[]
): Value[] {
	return nodeValues
		.sort(function(node1, node2) {
			return compareNodePositionsWithTieBreaker(
				domFacade.orderOfDetachedNodes,
				domFacade,
				node1,
				node2
			);
		})
		.filter(function(nodeValue, i, sortedNodes) {
			if (i === 0) {
				return true;
			}
			return nodeValue !== sortedNodes[i - 1];
		});
};
