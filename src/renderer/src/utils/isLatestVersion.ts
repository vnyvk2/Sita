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

const getPhaseRank = (phase?: string): number => {
  if (!phase || phase === 'stable') return 3;
  if (phase === 'rc' || phase === 'beta') return 2;
  if (phase === 'alpha' || phase === 'dev') return 1;
  return 0;
};

const comparePreRelease = (lPre: string, cPre: string): number => {
  const lRank = getPhaseRank(lPre.split('.')[0]?.replace(/[^a-zA-Z]/gi, ''));
  const cRank = getPhaseRank(cPre.split('.')[0]?.replace(/[^a-zA-Z]/gi, ''));
  if (lRank > cRank) return -1;
  if (lRank < cRank) return 1;

  const lParts = lPre.split('.');
  const cParts = cPre.split('.');
  const len = Math.max(lParts.length, cParts.length);

  for (let i = 0; i < len; i++) {
    const lSeg = lParts[i];
    const cSeg = cParts[i];

    if (lSeg === undefined) return 1; // shorter pre-release has lower precedence in semver, but here stable has rank 3 already; for alpha.1 vs alpha.1.2, alpha.1.2 > alpha.1
    if (cSeg === undefined) return -1;
    if (lSeg === cSeg) continue;

    const lNum = /^\d+$/.test(lSeg) ? parseInt(lSeg, 10) : NaN;
    const cNum = /^\d+$/.test(cSeg) ? parseInt(cSeg, 10) : NaN;

    if (!isNaN(lNum) && !isNaN(cNum)) {
      return lNum > cNum ? -1 : 1;
    }
    if (!isNaN(lNum) && isNaN(cNum)) return 1; // numeric has lower precedence than string in semver
    if (isNaN(lNum) && !isNaN(cNum)) return -1;

    return lSeg.localeCompare(cSeg) > 0 ? -1 : 1;
  }
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

    const lPre = latestVersion.preRelease || '';
    const cPre = currentVersion.preRelease || '';

    if (lPre === cPre) return true;

    const preReleaseComparison = comparePreRelease(lPre, cPre);
    return preReleaseComparison !== -1;
  }
  return false;
};

export default isLatestVersion;
