// Learn more about semantic versioning on https://semver.org/
// Semantic version checking regex from https://regex101.com/r/vkijKf/1/
// Pre-release is in the form (alpha|beta).YYYYMMDDNN where NN is a number in range 0 to 99.

const semVerRegex =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

interface VersionInfo {
  major: string;
  minor: string;
  patch: string;
}

interface ExtendedVersionInfo extends VersionInfo {
  preRelease?: string;
  releasePhase?: string;
}

export const getVersionInfoFromString = (
  versionString: string
): ExtendedVersionInfo | undefined => {
  const versionData = versionString.match(semVerRegex);

  if (versionData) {
    const [, major, minor, patch, preRelease] = versionData;
    const releasePhase = preRelease?.replace(/[^a-zA-Z]/gi, '');

    return { major, minor, patch, preRelease, releasePhase };
  }
  return undefined;
};

const compareMajorMinorAndPatch = (Lv: ExtendedVersionInfo, Cv: ExtendedVersionInfo) => {
  const lMajor = parseInt(Lv.major);
  const cMajor = parseInt(Cv.major);
  if (lMajor > cMajor) return -1;
  if (lMajor < cMajor) return 1;

  const lMinor = parseInt(Lv.minor);
  const cMinor = parseInt(Cv.minor);
  if (lMinor > cMinor) return -1;
  if (lMinor < cMinor) return 1;

  const lPatch = parseInt(Lv.patch);
  const cPatch = parseInt(Cv.patch);
  if (lPatch > cPatch) return -1;
  if (lPatch < cPatch) return 1;

  return 0;
};

const isLatestVersion = (latestVersionString: string, currentVersionString: string) => {
  const latestVersion = getVersionInfoFromString(latestVersionString);
  const currentVersion = getVersionInfoFromString(currentVersionString);

  if (latestVersion && currentVersion) {
    const baseComparison = compareMajorMinorAndPatch(latestVersion, currentVersion);
    
    // If base versions differ, rely on that comparison.
    // -1 means Lv > Cv (needs migration -> false)
    // 1 means Lv < Cv (up to date -> true)
    if (baseComparison !== 0) {
      return baseComparison === 1;
    }

    const { preRelease: LvPreRelease } = latestVersion;
    const { preRelease: CvPreRelease } = currentVersion;

    if (LvPreRelease === CvPreRelease) return true;

    // If only one has a pre-release, the one WITHOUT pre-release is NEWER.
    if (LvPreRelease && !CvPreRelease) return true; // Cv is newer (release vs alpha)
    if (!LvPreRelease && CvPreRelease) return false; // Lv is newer (release vs alpha)

    // Both are pre-releases. String comparison works for simple cases (alpha.4 vs alpha.5)
    if (!LvPreRelease || !CvPreRelease) return false;
    return LvPreRelease < CvPreRelease;
  }
  return false;
};

export default isLatestVersion;
