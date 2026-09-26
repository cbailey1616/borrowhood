// Read-only configuration gate. Does not print values, contact providers, deploy,
// create a build, or imply that App Store Connect metadata has been verified.
import { createPrivateKey } from 'node:crypto';
const failures=[];
for(const name of ['APPLE_SIGN_IN_TEAM_ID','APPLE_SIGN_IN_KEY_ID','APPLE_SIGN_IN_PRIVATE_KEY','JWT_SECRET']) {
  if(!process.env[name])failures.push(`${name} must be configured securely on the API service.`);
}
if(process.env.APPLE_SIGN_IN_PRIVATE_KEY) {
  try {
    const key=createPrivateKey(process.env.APPLE_SIGN_IN_PRIVATE_KEY.replace(/\\n/g,'\n'));
    if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw new Error();
  } catch { failures.push('The Apple Sign in private key must be a valid P-256 key.'); }
}
if((process.env.VERIFICATION_PAYMENT_MODE||'free_launch')!=='free_launch')failures.push('This candidate requires free_launch verification mode.');
if(failures.length){for(const message of failures)console.error(message);process.exitCode=1;}
else console.log('Configuration checks passed. App Store metadata, Apple authorization, and physical-device review checks remain separate release gates.');
