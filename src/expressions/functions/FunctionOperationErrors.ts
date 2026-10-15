export const errFOAY0001 = () => new Error('FOAY0001: Array index out of bounds');

export const errFORG0006 = (
	message: string = 'A wrong argument type was specified in a function call.',
) => new Error(`FORG0006: ${message}`);

export const errFODF1280 = (name: string) =>
	new Error(`FODF1280: There is no statically known decimal-format named "${name}".`);

export const errFODF1310 = (picture: string) =>
	new Error(`FODF1310: The picture string "${picture}" is not valid.`);
