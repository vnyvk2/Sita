import { METADATA_CONSTANTS } from '../common/constants';

export class MetadataConfidence {
  public readonly score: number;

  constructor(score: number) {
    this.score = Math.max(
      METADATA_CONSTANTS.CONFIDENCE_MIN,
      Math.min(METADATA_CONSTANTS.CONFIDENCE_MAX, score)
    );
  }

  public isHighConfidence(): boolean {
    return this.score >= 0.8;
  }

  public isMediumConfidence(): boolean {
    return this.score >= 0.4 && this.score < 0.8;
  }

  public isLowConfidence(): boolean {
    return this.score < 0.4;
  }

  public static verified(): MetadataConfidence {
    return new MetadataConfidence(METADATA_CONSTANTS.CONFIDENCE_VERIFIED);
  }

  public static default(): MetadataConfidence {
    return new MetadataConfidence(METADATA_CONSTANTS.CONFIDENCE_DEFAULT);
  }

  public static low(): MetadataConfidence {
    return new MetadataConfidence(METADATA_CONSTANTS.CONFIDENCE_MIN);
  }
}
