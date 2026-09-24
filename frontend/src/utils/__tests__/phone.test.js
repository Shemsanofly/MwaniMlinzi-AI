import { formatTzPhone, normalizeTzPhone } from '../phone.js';

describe('Tanzanian phone normalisation (mirrors the backend)', () => {
  test.each([
    ['+255777123456', '+255777123456'], ['255777123456', '+255777123456'], ['0777123456', '+255777123456'],
    ['0777 123 456', '+255777123456'], ['777123456', '+255777123456'], ['0655-123-456', '+255655123456'],
  ])('%s → %s', (input, out) => expect(normalizeTzPhone(input)).toBe(out));
  test.each(['', '12345', '+254712345678', '0577123456', 'abc'])('rejects %s', (input) => expect(normalizeTzPhone(input)).toBeNull());
  test('formats for display', () => expect(formatTzPhone('+255777123456')).toBe('+255 777 123 456'));
});
