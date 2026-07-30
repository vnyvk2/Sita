import { CollectionClient } from '@renderer/api/CollectionClient';
import { store } from '@renderer/store/store';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { useMemo } from 'react';

import DefaultImgCover from '../../assets/images/webp/song_cover_default.webp';
import Img from '../Img';

type Props = {
  className?: string;
  songIds?: number[];
  collectionId?: number;
  imgClassName?: string;
  holderClassName?: string;
  type?: number;
  enableImgFadeIns?: boolean;
  artworks?: ArtworkPaths[];
};

const MultipleArtworksCover = (props: Props) => {
  const enableArtworkFromSongCovers = useStore(
    store,
    (state) => state.localStorage.preferences.enableArtworkFromSongCovers
  );
  const shuffleArtworkFromSongCovers = useStore(
    store,
    (state) => state.localStorage.preferences.shuffleArtworkFromSongCovers
  );
  const {
    className,
    artworks,
    imgClassName,
    holderClassName,
    type = 2,
    enableImgFadeIns = true
  } = props;

  const { data: artworkPaths = artworks ?? [] } = useQuery({
    queryKey: ['collectionArtworks', props.collectionId ? `collectionId=${props.collectionId}` : `songIds=${props.songIds?.join(',')}`],
    queryFn: async () => {
      let idsToFetch = props.songIds || [];
      if (props.collectionId !== undefined && idsToFetch.length === 0) {
        const entries = await CollectionClient.getEntries(props.collectionId, 0, 4);
        idsToFetch = entries.map(e => e.songId);
      }
      if (idsToFetch.length === 0) return [];
      const data = await CollectionClient.getArtworks(idsToFetch);
      return data?.map((x) => x.artworkPaths) || [];
    },
    enabled: !artworks && enableArtworkFromSongCovers && (!!props.collectionId || (props.songIds && props.songIds.length > 0))
  });



  const images = useMemo(() => {
    if (artworkPaths.length > 1) {
      const repeatedArtworksPaths: string[] = [];

      while (repeatedArtworksPaths.length < 10) {
        repeatedArtworksPaths.push(...artworkPaths.map((art) => art.artworkPath));
      }

      if (shuffleArtworkFromSongCovers) {
        for (let i = repeatedArtworksPaths.length - 1; i > 0; i -= 1) {
          const randomIndex = Math.floor(Math.random() * (i + 1));
          [repeatedArtworksPaths[i], repeatedArtworksPaths[randomIndex]] = [
            repeatedArtworksPaths[randomIndex],
            repeatedArtworksPaths[i]
          ];
        }
      }

      return repeatedArtworksPaths
        .filter((_, i) => i < (type === 1 ? 10 : 5))
        .map((artwork, i) => {
          const cond = (i + (type === 1 ? 1 : 0)) % 2 === 1;

          return (
            <Img
              key={i}
              className={`inline shadow-xl ${type === 1 ? 'rounded-md' : 'rounded-xs'} ${
                cond && 'col-span-2 row-span-2 rounded-md!'
              } ${imgClassName}`}
              src={artwork}
              fallbackSrc={DefaultImgCover}
              enableImgFadeIns={enableImgFadeIns}
            />
          );
        });
    }
    return [];
  }, [artworkPaths, enableImgFadeIns, imgClassName, shuffleArtworkFromSongCovers, type]);

  return (
    <div className={`relative overflow-hidden rounded-lg shadow-md ${className}`}>
      <div
        className={`relative grid scale-150 rotate-45 grid-flow-row gap-1 p-1 ${
          type === 1 ? 'grid-cols-5' : 'grid-cols-3'
        } ${holderClassName}`}
      >
        {images}
      </div>
    </div>
  );
};

export default MultipleArtworksCover;
