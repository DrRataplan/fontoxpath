export const errXUTY0008 = () => new Error('XUTY0008: The target of a replace expression must be a single element, attribute, text, comment, or processing instruction node.');
export const errXUDY0009 = (target) => new Error(`XUDY0009: The target ${target.outerHTML} for replacing a node must have a parent.`);
export const errXUTY0010 = () => new Error('XUTY0010: When replacing an an element, text, comment, or processing instruction node the new value must be a single node.');
export const errXUTY0011 = () => new Error('XUTY0011: When replacing an attribute the new value must be zero or more attribute nodes.');
export const errXUTY0012 = () => new Error('XUTY0012: The target of a rename expression must be a single element, attribute, or processing instruction node.');
export const errXUDY0016 = (target) => new Error(`XUDY0016: The target ${target.outerHTML} is used in more than one replace expression.`);
export const errXUDY0017 = (target) => new Error(`XUDY0017: The target ${target.outerHTML} is used in more than one replace value of expression.`);
export const errXUDY0024 = (namespaceURI) => new Error(`XUDY0024: The namespace binding ${namespaceURI} is conflicting.`);
export const errXUDY0027 = () => new Error('XUDY0027: The target for a replace expression should not be empty');
