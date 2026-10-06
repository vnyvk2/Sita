const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
const path = require('path');

exports.default = async function (context) {
  const { appOutDir, electronPlatformName } = context;
  const ext = electronPlatformName === 'win32' ? '.exe' : '';
  const execPath = path.join(appOutDir, `${context.packager.appInfo.productFilename}${ext}`);

  console.log(`[afterPack] Flipping Electron fuses for: ${execPath}`);
  await flipFuses(execPath, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true
  });
  console.log('[afterPack] Electron fuses successfully applied.');
};
