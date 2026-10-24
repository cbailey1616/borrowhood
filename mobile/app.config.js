const fs = require('fs');
const path = require('path');

// EAS provides this ignored file through a file environment variable.
module.exports = ({ config }) => {
  const android = { ...config.android };
  const local = path.join(__dirname, 'google-services.json');
  const services = process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(local) ? local : null);
  if (services) android.googleServicesFile = services;
  else delete android.googleServicesFile;
  return { ...config, android, extra: { ...config.extra, androidPushConfigured: Boolean(services) } };
};
