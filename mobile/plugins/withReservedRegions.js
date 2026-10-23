const fs = require('fs');
const path = require('path');
const { withXcodeProject, IOSConfig } = require('expo/config-plugins');

function installReservedRegions(project, projectRoot, iosRoot) {
  const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
  const filepath = `${projectName}/BorrowhoodReservedRegions.m`;
  const destination = path.join(iosRoot, filepath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'ios/BorrowhoodReservedRegions.m'), destination);
  IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath, groupName: projectName, project });
  return project;
}
module.exports = config => withXcodeProject(config, mod => {
  mod.modResults = installReservedRegions(mod.modResults, mod.modRequest.projectRoot, mod.modRequest.platformProjectRoot);
  return mod;
});
module.exports.installReservedRegions = installReservedRegions;
