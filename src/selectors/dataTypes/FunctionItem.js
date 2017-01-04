import Item from './Item';
import Sequence from './Sequence';
import DynamicContext from '../DynamicContext';

/**
 * @constructor
 * @extends {Item}
 * @param  {!function(!DynamicContext, !Sequence): !Sequence}  value
 * @param  {!Array<string>}                                     argumentTypes
 * @param  {!number}                                            arity
 * @param  {!string}                                            returnType
 */
function FunctionItem (value, argumentTypes, arity, returnType) {
    Item.call(this, value);

    this._argumentTypes = argumentTypes;
    this._arity = arity;
    this._returnType = returnType;
}

FunctionItem.prototype = Object.create(Item.prototype);
FunctionItem.prototype.constructor = FunctionItem;

FunctionItem.prototype.atomize = function () {
    throw new Error('FOTY0013: Not supported on this type');
};

FunctionItem.prototype.getEffectiveBooleanValue = function () {
    throw new Error('FORG0006: Not supported on this type');
};

FunctionItem.prototype.instanceOfType = function (simpleTypeName) {
    return simpleTypeName === 'function(*)' ||
        Item.prototype.instanceOfType.call(this, simpleTypeName);
};

FunctionItem.prototype.getArgumentTypes = function () {
    return this._argumentTypes;
};

FunctionItem.prototype.getReturnType = function () {
    return this._returnType;
};

FunctionItem.prototype.getArity = function () {
    return this._arity;
};

export default FunctionItem;