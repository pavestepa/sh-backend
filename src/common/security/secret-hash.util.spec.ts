import { hashSecret, verifySecret } from './secret-hash.util';

describe('secret-hash util', () => {
  it('verifies a matching value against its hash', () => {
    const hash = hashSecret('123456', 'pepper');
    expect(verifySecret('123456', 'pepper', hash)).toBe(true);
  });

  it('rejects a non-matching value', () => {
    const hash = hashSecret('123456', 'pepper');
    expect(verifySecret('654321', 'pepper', hash)).toBe(false);
  });

  it('rejects the correct value with the wrong pepper', () => {
    const hash = hashSecret('123456', 'pepper-a');
    expect(verifySecret('123456', 'pepper-b', hash)).toBe(false);
  });

  it('never stores the plaintext value in the hash output', () => {
    const hash = hashSecret('999999', 'pepper');
    expect(hash).not.toContain('999999');
  });

  it('produces a different hash each time due to random salting', () => {
    const hash1 = hashSecret('123456', 'pepper');
    const hash2 = hashSecret('123456', 'pepper');
    expect(hash1).not.toBe(hash2);
  });
});
