import { store } from '@renderer/store/store';
import { useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../../contexts/AppUpdateContext';
import useSelectAllHandler from '../../../hooks/useSelectAllHandler';
import Button from '../../Button';
import { Playlist } from '../../PlaylistsPage/Playlist';
import SecondaryContainer from '../../SecondaryContainer';

type Props = {
  playlists: Playlist[];
  searchInput: string;
  noOfVisiblePlaylists?: number;
  isSimilaritySearchEnabled: boolean;
};

const PlaylistSearchResultsContainer = (props: Props) => {
  const { playlists, searchInput, noOfVisiblePlaylists = 4, isSimilaritySearchEnabled } = props;
  const multipleSelectionsData = useStore(store, (state) => state.multipleSelectionsData);
  const isMultipleSelectionEnabled = useStore(
    store,
    (state) => state.multipleSelectionsData.isEnabled
  );
  const { toggleMultipleSelections } = useContext(AppUpdateContext);
  const { t } = useTranslation();
  const navigate = useNavigate();

  const selectAllHandler = useSelectAllHandler(playlists, 'playlist', 'playlistId');

  const playlistResults = useMemo(
    () =>
      playlists.length > 0
        ? playlists
            .map((playlist, index) => {
              if (index < noOfVisiblePlaylists)
                return (
                  <Playlist
                    index={index}
                    key={`${playlist.playlistId}-${playlist.name}`}
                    name={playlist.name}
                    playlistId={playlist.playlistId}
                    createdDate={playlist.createdDate}
                    songs={playlist.songs}
                    isArtworkAvailable={playlist.isArtworkAvailable}
                    artworkPaths={playlist.artworkPaths}
                    selectAllHandler={selectAllHandler}
                  />
                );
              return undefined;
            })
            .filter((x) => x !== undefined)
        : [],
    [noOfVisiblePlaylists, playlists, selectAllHandler]
  );

  return (
    <SecondaryContainer
      className={`secondary-container playlists-list-container ${
        playlists.length > 0 ? 'mt-4' : ''
      }`}
    >
      <>
        <div className="title-container text-font-color-highlight dark:text-dark-font-color-highlight mb-8 flex items-center pr-4 text-2xl font-medium">
          <div className="container flex">
            {t('common.playlist_other')}{' '}
            <div className="other-stats-container text-font-color-black dark:text-font-color-white ml-12 flex items-center text-xs">
              {isMultipleSelectionEnabled ? (
                <div className="text-font-color-highlight dark:text-dark-font-color-highlight text-sm">
                  {t('common.selectionWithCount', {
                    count: multipleSelectionsData.multipleSelections.length
                  })}
                </div>
              ) : (
                <span className="no-of-playlists">
                  {t(
                    `searchPage.${
                      playlists.length > noOfVisiblePlaylists
                        ? 'resultAndVisibleCount'
                        : 'resultCount'
                    }`,
                    {
                      count: playlists.length,
                      noVisible: noOfVisiblePlaylists
                    }
                  )}
                </span>
              )}
            </div>
          </div>
          <div className="other-controls-container flex">
            {isMultipleSelectionEnabled && multipleSelectionsData.selectionType === 'playlist' && (
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
                isMultipleSelectionEnabled && multipleSelectionsData.selectionType === 'playlist'
                  ? 'remove_done'
                  : 'checklist'
              }
              clickHandler={() => toggleMultipleSelections(!isMultipleSelectionEnabled, 'playlist')}
              isDisabled={
                isMultipleSelectionEnabled && multipleSelectionsData.selectionType !== 'playlist'
              }
              tooltipLabel={t(`common.${isMultipleSelectionEnabled ? 'unselectAll' : 'select'}`)}
            />
            {playlists.length > noOfVisiblePlaylists && (
              <Button
                label={t('common.showAll')}
                iconName="apps"
                className="show-all-btn text-sm font-normal"
                clickHandler={() =>
                  navigate({
                    to: '/main-player/search/all',
                    search: {
                      keyword: searchInput,
                      isSimilaritySearchEnabled,
                      filterBy: 'Playlists'
                    }
                  })
                }
              />
            )}
          </div>
        </div>
        <div className="playlists-container flex h-full flex-wrap">{playlistResults}</div>
      </>
    </SecondaryContainer>
  );
};

export default PlaylistSearchResultsContainer;
