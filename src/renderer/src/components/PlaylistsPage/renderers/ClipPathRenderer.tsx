import DefaultImgCover from '../../../assets/images/webp/song_cover_default.webp';
import CoverImageTile from './CoverImageTile';

interface Props {
  artworks: string[];
  clipPaths: readonly string[];
  className?: string;
  enableImgFadeIns?: boolean;
}

const ClipPathRenderer = ({
  artworks,
  clipPaths,
  className = '',
  enableImgFadeIns = true
}: Props) => {
  const containerClass = `relative overflow-hidden aspect-square h-full w-full bg-neutral-900 ${className}`;

  return (
    <div className={containerClass}>
      {clipPaths.map((clipPath, index) => (
        <CoverImageTile
          key={index}
          src={artworks[index] || DefaultImgCover}
          enableImgFadeIns={enableImgFadeIns}
          alt={`Cover ${index + 1}`}
          className="absolute inset-0"
          clipPath={clipPath}
        />
      ))}
    </div>
  );
};

export default ClipPathRenderer;
