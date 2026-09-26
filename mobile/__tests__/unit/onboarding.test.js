import { initialOnboardingRoute } from '../../src/utils/onboarding';
const user = { firstName: 'Chris', city: 'Upton', state: 'MA' };
it('starts new accounts with town setup even when registration provided a name', () => {
  expect(initialOnboardingRoute(1, user)).toBe('OnboardingTown');
});
it('repairs missing basics before resuming a later step from an older build', () => {
  expect(initialOnboardingRoute(3, { firstName: 'Chris' })).toBe('OnboardingTown');
  expect(initialOnboardingRoute(2, { ...user, firstName: '' })).toBe('OnboardingTown');
});
it('resumes neighborhood selection or optional verification from saved progress', () => {
  expect(initialOnboardingRoute(2, user)).toBe('OnboardingNeighborhood');
  [3, 4, 5].forEach(step => expect(initialOnboardingRoute(step, user)).toBe('OnboardingVerify'));
});
it('lets already verified users finish without editing locked identity fields', () => {
  expect(initialOnboardingRoute(1, { ...user, isVerified: true })).toBe('OnboardingVerify');
});
