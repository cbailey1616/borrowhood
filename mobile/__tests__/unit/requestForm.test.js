import { requestAudienceProblem, requestDatePreset } from '../../src/utils/requestForm';

it('blocks friends-only requests with no accepted friends', () => {
  expect(requestAudienceProblem(['close_friends'], { count: 0 }, false)).toMatch(/Nobody else/);
});
it('does not mistake a loading or failed friends check for an empty audience', () => {
  expect(requestAudienceProblem(['close_friends'], { loading: true }, false)).toMatch(/Checking/);
  expect(requestAudienceProblem(['close_friends'], { error: true }, false)).toMatch(/Could not check/);
});
it('requires explicit town visibility and verification', () => {
  expect(requestAudienceProblem(['town'], { count: 0 }, false)).toMatch(/Verify/);
  expect(requestAudienceProblem(['town'], { count: 0 }, true)).toBeNull();
  expect(requestAudienceProblem(['close_friends'], { count: 1 }, false)).toBeNull();
});
it('uses local dates for today and the current/upcoming weekend', () => {
  expect(requestDatePreset('today', new Date(2026, 8, 4))).toEqual({ neededFrom: '2026-09-04', neededUntil: '2026-09-04' });
  expect(requestDatePreset('weekend', new Date(2026, 8, 4))).toEqual({ neededFrom: '2026-09-05', neededUntil: '2026-09-06' });
  expect(requestDatePreset('weekend', new Date(2026, 8, 6))).toEqual({ neededFrom: '2026-09-06', neededUntil: '2026-09-06' });
});
