// Ad-hoc code-sign the macOS app during packaging.
//
// Our builds are unsigned (no paid Apple Developer ID). Without any signature,
// macOS on Apple Silicon refuses to launch the downloaded app as "damaged".
// An ad-hoc signature is NOT a real Developer ID (Gatekeeper still shows the
// "unidentified developer" prompt once), but it downgrades that hard block to
// the soft one the user can clear with right-click → Open, no Terminal needed.
const { execFileSync } = require('node:child_process')
const path = require('node:path')

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
}
