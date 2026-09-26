// Older versions used steps 3–5 for optional introductions and completion.
// Never replay setup for completed accounts; RootNavigator owns that decision.
export function initialOnboardingRoute(step, user) {
  if (user?.isVerified) return 'OnboardingVerify';
  if (!user?.firstName?.trim() || !user?.city?.trim() || !user?.state?.trim()) return 'OnboardingTown';
  if (Number(step) >= 3) return 'OnboardingVerify';
  if (Number(step) === 2) return 'OnboardingNeighborhood';
  return 'OnboardingTown';
}
