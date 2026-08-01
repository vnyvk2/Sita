import { CollectionClient } from '@renderer/api/CollectionClient';
import { store } from '@renderer/store/store';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { useMemo } from 'react';

import type { PlaylistCoverLayout } from '../../types/playlistCover';
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
  artworks?: ArtworkPaths[] | string[];
  layout?: PlaylistCoverLayout;
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
    className = '',
    artworks,
    imgClassName = '',
    holderClassName = '',
    type = 2,
    enableImgFadeIns = true,
    layout
  } = props;

  // Check if string array of resolved artwork URLs is passed (Phase 1 PlaylistCover mode)
  const isResolvedStringArtworks =
    Array.isArray(artworks) && (artworks.length === 0 || typeof artworks[0] === 'string');

  const resolvedArtworksList = isResolvedStringArtworks ? (artworks as string[]) : undefined;

  // Legacy TanStack Query for callers passing collectionId or songIds
  const { data: fetchedArtworkPaths = [] } = useQuery({
    queryKey: [
      'collectionArtworks',
      props.collectionId
        ? `collectionId=${props.collectionId}`
        : `songIds=${props.songIds?.join(',')}`
    ],
    queryFn: async () => {
      let idsToFetch = props.songIds || [];
      if (props.collectionId !== undefined && idsToFetch.length === 0) {
        const entries = await CollectionClient.getEntries(props.collectionId, 0, 4);
        idsToFetch = entries.map((e) => e.songId);
      }
      if (idsToFetch.length === 0) return [];
      const data = await CollectionClient.getArtworks(idsToFetch);
      return data?.map((x) => x.artworkPaths) || [];
    },
    enabled:
      !isResolvedStringArtworks &&
      !artworks &&
      enableArtworkFromSongCovers &&
      (!!props.collectionId || (props.songIds && props.songIds.length > 0))
  });

  // --- 1. Phase 1 Custom Grid Layout Rendering ---
  if (isResolvedStringArtworks || layout === 'grid') {
    const list = resolvedArtworksList || [];
    const count = list.length;

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
            src={list[0] || DefaultImgCover}
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
            {list.slice(0, 2).map((art, i) => (
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
                src={list[0]}
                fallbackSrc={DefaultImgCover}
                alt="Cover Artwork 1"
                className={`h-full w-full object-cover ${imgClassName}`}
                enableImgFadeIns={enableImgFadeIns}
              />
            </div>
            {list.slice(1, 3).map((art, i) => (
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
          {list.slice(0, 4).map((art, i) => (
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

  // --- 2. Original Legacy Nora Diamond Grid Rendering ---
  const legacyArtworks = (artworks as ArtworkPaths[]) ?? fetchedArtworkPaths;

  const legacyImages = useMemo(() => {
    if (legacyArtworks.length > 1) {
      const repeatedArtworksPaths: string[] = [];

      while (repeatedArtworksPaths.length < 10) {
        repeatedArtworksPaths.push(...legacyArtworks.map((art) => art.artworkPath));
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
  }, [enableImgFadeIns, imgClassName, legacyArtworks, shuffleArtworkFromSongCovers, type]);

  return (
    <div className={`relative overflow-hidden rounded-lg shadow-md ${className}`}>
      <div
        className={`relative grid scale-150 rotate-45 grid-flow-row gap-1 p-1 ${
          type === 1 ? 'grid-cols-5' : 'grid-cols-3'
        } ${holderClassName}`}
      >
        {legacyImages}
      </div>
    </div>
  );
};

export default MultipleArtworksCover;
