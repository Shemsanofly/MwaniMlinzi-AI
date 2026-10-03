import { validateRegistration } from '../Register.jsx';

const base = { fullName: 'Asha', email: '', phone: '0777 123 456', password: 'Passw0rd', confirm: 'Passw0rd', consent: true };

describe('registration validation', () => {
  test('phone is required and must be Tanzanian; email is optional', () => {
    expect(validateRegistration(base)).toEqual({});
    expect(validateRegistration({ ...base, phone: '' }).phone).toBe('required');
    expect(validateRegistration({ ...base, phone: '12345' }).phone).toBe('phone');
    expect(validateRegistration({ ...base, email: 'nope' }).email).toBe('email');
    expect(validateRegistration({ ...base, email: 'a@b.tz' })).toEqual({});
  });
  test('password rules and consent', () => {
    expect(validateRegistration({ ...base, password: 'short', confirm: 'short' }).password).toBe('passwordLength');
    expect(validateRegistration({ ...base, password: 'onlyletters', confirm: 'onlyletters' }).password).toBe('passwordMix');
    expect(validateRegistration({ ...base, confirm: 'other' }).confirm).toBe('passwordMatch');
    expect(validateRegistration({ ...base, consent: false }).consent).toBe('consent');
  });
});
