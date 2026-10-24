// A signing key made for the tests: signatures must be sealed, and the gate counts only sealed ones.
import { generateSigningKey, sealerFrom } from '../src/seal.ts';

export const TEST_KEY = generateSigningKey();
export const TEST_SEALER = sealerFrom({ RAMA_SIGNING_KEY: TEST_KEY.privateKey })!;
