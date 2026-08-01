import type { PlaylistCoverLayout } from '../../types/playlistCover';
import DefaultImgCover from '../../assets/images/webp/song_cover_default.webp';
import Img from '../Img';

type Props = {
  artworks: string[];
  layout?: PlaylistCoverLayout;
  className?: string;
  imgClassName?: string;
  holderClassName?: string;
  enableImgFadeIns?: boolean;
};

const MultipleArtworksCover = (props: Props) => {
  const {
    artworks = [],
    className = '',
    imgClassName = '',
    holderClassName = '',
    enableImgFadeIns = true
  } = props;

  const count = artworks.length;

  if (count === 0) {
    return (
      <div className={`relative overflow-hidden rounded-lg shadow-md aspect-square ${className}`}>
        <Img
          src={DefaultImgCover}
          alt="Default Cover"
          className={`h-full w-full object-cover ${imgClassName}`}
          enableImgFadeIns={enableImgFadeIns}
        />
      </div>
    );
  }

  if (count === 1) {
    return (
      <div className={`relative overflow-hidden rounded-lg shadow-md aspect-square ${className}`}>
        <Img
          src={artworks[0] || DefaultImgCover}
          fallbackSrc={DefaultImgCover}
          alt="Cover Artwork"
          className={`h-full w-full object-cover ${imgClassName}`}
          enableImgFadeIns={enableImgFadeIns}
        />
      </div>
    );
  }

  if (count === 2) {
    return (
      <div className={`relative overflow-hidden rounded-lg shadow-md aspect-square ${className}`}>
        <div className={`grid h-full w-full grid-cols-2 grid-rows-1 gap-0.5 ${holderClassName}`}>
          {artworks.slice(0, 2).map((art, i) => (
            <div key={i} className="relative h-full w-full overflow-hidden">
              <Img
                src={art}
                fallbackSrc={DefaultImgCover}
                alt={`Cover Artwork ${i + 1}`}
                className={`h-full w-full object-cover ${imgClassName}`}
                enableImgFadeIns={enableImgFadeIns}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (count === 3) {
    return (
      <div className={`relative overflow-hidden rounded-lg shadow-md aspect-square ${className}`}>
        <div className={`grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5 ${holderClassName}`}>
          <div className="col-span-2 row-span-1 relative h-full w-full overflow-hidden">
            <Img
              src={artworks[0]}
              fallbackSrc={DefaultImgCover}
              alt="Cover Artwork 1"
              className={`h-full w-full object-cover ${imgClassName}`}
              enableImgFadeIns={enableImgFadeIns}
            />
          </div>
          {artworks.slice(1, 3).map((art, i) => (
            <div key={i + 1} className="col-span-1 row-span-1 relative h-full w-full overflow-hidden">
              <Img
                src={art}
                fallbackSrc={DefaultImgCover}
                alt={`Cover Artwork ${i + 2}`}
                className={`h-full w-full object-cover ${imgClassName}`}
                enableImgFadeIns={enableImgFadeIns}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // count >= 4: 2x2 grid
  return (
    <div className={`relative overflow-hidden rounded-lg shadow-md aspect-square ${className}`}>
      <div className={`grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5 ${holderClassName}`}>
        {artworks.slice(0, 4).map((art, i) => (
          <div key={i} className="relative h-full w-full overflow-hidden">
            <Img
              src={art}
              fallbackSrc={DefaultImgCover}
              alt={`Cover Artwork ${i + 1}`}
              className={`h-full w-full object-cover ${imgClassName}`}
              enableImgFadeIns={enableImgFadeIns}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default MultipleArtworksCover;
