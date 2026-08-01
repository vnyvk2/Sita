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
  const count = artworks.length;
  const containerClass = `relative overflow-hidden aspect-square h-full w-full bg-neutral-900 ${className}`;

  return (
    <div className={containerClass}>
      {artworks.slice(0, count).map((art, index) => (
        <CoverImageTile
          key={index}
          src={art}
          enableImgFadeIns={enableImgFadeIns}
          alt={`Cover ${index + 1}`}
          className="absolute inset-0"
          clipPath={clipPaths[index]}
        />
      ))}
    </div>
  );
};

export default ClipPathRenderer;
