import isSameMapKey from './isSameMapKey';
import Sequence from '../dataTypes/Sequence';
import DynamicContext from '../DynamicContext';

/**
 * @param   {!DynamicContext}  _dynamicContext
 * @param   {!Sequence}        mapSequence
 * @param   {!Sequence}        key
 * @return  {!Sequence}
 */
export default function mapGet (_dynamicContext, mapSequence, key) {
	var map = mapSequence.value[0];
	var matchingPair = map.keyValuePairs.find(function (keyValuePair) {
			return isSameMapKey(keyValuePair.key, key.value[0]);
		});

	if (!matchingPair) {
		return Sequence.empty();
	}
	return matchingPair.value;
}