import { store } from '@renderer/store/store';
import { useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../../contexts/AppUpdateContext';
import useSelectAllHandler from '../../../hooks/useSelectAllHandler';
import { Artist } from '../../ArtistPage/Artist';
import Button from '../../Button';
import SecondaryContainer from '../../SecondaryContainer';

type Props = {
  artists: Artist[];
  searchInput: string;
  isSimilaritySearchEnabled: boolean;
  noOfVisibleArtists?: number;
};

const ArtistsSearchResultsContainer = (props: Props) => {
  const { artists, searchInput, noOfVisibleArtists = 5, isSimilaritySearchEnabled } = props;
  const multipleSelectionsData = useStore(store, (state) => state.multipleSelectionsData);
  const isMultipleSelectionEnabled = useStore(
    store,
    (state) => state.multipleSelectionsData.isEnabled
  );

  const { toggleMultipleSelections } = useContext(AppUpdateContext);
  const { t } = useTranslation();
  const navigate = useNavigate();

  const selectAllHandler = useSelectAllHandler(artists, 'artist', 'artistId');

  const artistResults = useMemo(
    () =>
      artists.length > 0
        ? artists
            .map((artist, index) => {
              if (index < noOfVisibleArtists) {
                return (
                  <Artist
                    key={artist.artistId}
                    index={index}
                    artistId={artist.artistId}
                    name={artist.name}
                    artworkPaths={artist.artworkPaths}
                    onlineArtworkPaths={artist.onlineArtworkPaths}
                    songIds={artist.songs.map((song) => song.songId)}
                    isAFavorite={artist.isAFavorite}
                  />
                );
              }
              return undefined;
            })
            .filter((artist) => artist !== undefined)
        : [],
    [artists, noOfVisibleArtists]
  );

  return (
    <SecondaryContainer
      className={`secondary-container artists-list-container ${artists.length > 0 ? 'mt-4' : ''}`}
    >
      <>
        <div className="title-container text-font-color-highlight dark:text-dark-font-color-highlight mb-8 flex items-center pr-4 text-2xl font-medium">
          <div className="container flex">
            {t('common.artist_other')}{' '}
            <div className="other-stats-container text-font-color-black dark:text-font-color-white ml-12 flex items-center text-xs">
              {isMultipleSelectionEnabled ? (
                <div className="text-font-color-highlight dark:text-dark-font-color-highlight text-sm">
                  {t('common.selectionWithCount', {
                    count: multipleSelectionsData.multipleSelections.length
                  })}
                </div>
              ) : (
                <span className="no-of-artists">
                  {t(
                    `searchPage.${
                      artists.length > noOfVisibleArtists ? 'resultAndVisibleCount' : 'resultCount'
                    }`,
                    { count: artists.length, noVisible: noOfVisibleArtists }
                  )}
                </span>
              )}
            </div>
          </div>
          <div className="other-controls-container flex">
            {isMultipleSelectionEnabled && multipleSelectionsData.selectionType === 'artist' && (
              <Button
                key="select-all-btn"
                className="select-all-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
                iconName="select_all"
                clickHandler={() => selectAllHandler()}
                tooltipLabel={t('common.selectAll')}
              />
            )}
            <Button
              className="select-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
              iconName={
                isMultipleSelectionEnabled && multipleSelectionsData.selectionType === 'artist'
                  ? 'remove_done'
                  : 'checklist'
              }
              clickHandler={() => toggleMultipleSelections(!isMultipleSelectionEnabled, 'artist')}
              isDisabled={
                isMultipleSelectionEnabled && multipleSelectionsData.selectionType !== 'artist'
              }
              tooltipLabel={t(`common.${isMultipleSelectionEnabled ? 'unselectAll' : 'select'}`)}
            />
            {artists.length > noOfVisibleArtists && (
              <Button
                label={t('common.showAll')}
                iconName="apps"
                className="show-all-btn text-sm font-normal"
                clickHandler={() =>
                  navigate({
                    to: '/main-player/search/all',
                    search: { keyword: searchInput, isSimilaritySearchEnabled, filterBy: 'Artists' }
                  })
                }
              />
            )}
          </div>
        </div>
        <div className="artists-container mb-12 flex flex-wrap">{artistResults}</div>
      </>
    </SecondaryContainer>
  );
};

export default ArtistsSearchResultsContainer;
