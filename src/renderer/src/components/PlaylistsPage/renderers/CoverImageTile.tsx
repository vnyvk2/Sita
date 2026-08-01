import DefaultImgCover from '../../../assets/images/webp/song_cover_default.webp';
import Img from '../../Img';

interface Props {
  src?: string;
  alt?: string;
  className?: string;
  clipPath?: string;
  style?: React.CSSProperties;
  enableImgFadeIns?: boolean;
}

const CoverImageTile = ({
  src,
  alt = 'Cover',
  className = '',
  clipPath,
  style,
  enableImgFadeIns = true
}: Props) => {
  const combinedStyle: React.CSSProperties = {
    ...(clipPath ? { clipPath } : {}),
    ...style
  };

  return (
    <div
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={combinedStyle}
    >
      <Img
        src={src || DefaultImgCover}
        fallbackSrc={DefaultImgCover}
        enableImgFadeIns={enableImgFadeIns}
        alt={alt}
        className="h-full w-full object-cover"
      />
    </div>
  );
};

export default CoverImageTile;
