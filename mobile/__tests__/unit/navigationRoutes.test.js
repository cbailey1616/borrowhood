const auditNavigation = require('../../scripts/audit-navigation.cjs');
const { detailRouteIds } = require('../../src/navigation/routeIdentity');

it('connects literal navigation destinations to registered routes with the required parameters', () => {
  const audit = auditNavigation();
  expect(audit.modules).toBeGreaterThan(100);
  expect(audit.issues).toEqual([]);
});

it('wires entity identity into the real navigator so detail screens preserve history', () => {
  const audit = auditNavigation();
  for (const name of Object.keys(detailRouteIds)) {
    expect(audit.routes.find(route => route.name === name)?.hasIdentity).toBe(true);
  }
});
