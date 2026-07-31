import type { PlaylistDto } from '@main/collections/ipc/dtos';
import { useCallback, useContext, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CollectionClient } from '../../api/CollectionClient';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { useMergePlaylists } from '../../hooks/collections/useCollectionMutations';
import { useRootCollections } from '../../hooks/collections/useCollectionQueries';
import Button from '../Button';

interface Props {
  sourcePlaylistIds: number[];
  sourcePlaylistNames?: string[];
}

export const MergePlaylistsPrompt = ({ sourcePlaylistIds, sourcePlaylistNames = [] }: Props) => {
  const { changePromptMenuData, toggleMultipleSelections, addNewNotifications } = useContext(AppUpdateContext);
  const { t } = useTranslation();
  const { data: allPlaylists = [] } = useRootCollections();
  const mergeMutation = useMergePlaylists();

  const candidateTargets = useMemo(() => {
    const sourceSet = new Set(sourcePlaylistIds);
    return allPlaylists.filter((p: PlaylistDto) => !sourceSet.has(p.id));
  }, [allPlaylists, sourcePlaylistIds]);

  const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null);

  useEffect(() => {
    if (candidateTargets.length > 0 && selectedTargetId == null) {
      setSelectedTargetId(candidateTargets[0].id);
    }
  }, [candidateTargets, selectedTargetId]);

  const handleMerge = useCallback(() => {
    if (!selectedTargetId) return;

    mergeMutation.mutate(
      {
        sourcePlaylistIds,
        targetPlaylistId: selectedTargetId
      },
      {
        onSuccess: () => {
          changePromptMenuData(false);
          toggleMultipleSelections(false);
          const targetName = allPlaylists.find((p: PlaylistDto) => p.id === selectedTargetId)?.name || 'Playlist';
          const sourcesText = sourcePlaylistNames.length > 0 ? sourcePlaylistNames.join(', ') : `${sourcePlaylistIds.length} playlists`;
          addNewNotifications([
            {
              id: 'playlistsMerged',
              duration: 5000,
              iconName: 'call_merge',
              content: `Merged ${sourcesText} into '${targetName}'`
            }
          ]);
        },
        onError: (err) => {
          addNewNotifications([
            {
              id: 'playlistsMergeFailed',
              duration: 5000,
              content: (err as Error).message
            }
          ]);
        }
      }
    );
  }, [selectedTargetId, sourcePlaylistIds, sourcePlaylistNames, mergeMutation, changePromptMenuData, toggleMultipleSelections, allPlaylists, addNewNotifications]);

  return (
    <div className="flex flex-col gap-4 p-2">
      <div className="text-2xl font-medium text-font-color-black dark:text-font-color-white">
        {t('playlistsPage.mergePlaylistsTitle', 'Merge Playlists')}
      </div>

      <p className="text-sm opacity-80 text-font-color-black dark:text-font-color-white">
        {t('playlistsPage.mergeDescription', {
          count: sourcePlaylistIds.length,
          defaultValue: `Select a target playlist to merge ${sourcePlaylistIds.length} playlists into:`
        })}
      </p>

      {sourcePlaylistNames.length > 0 && (
        <div className="rounded-xl bg-background-color-2/50 dark:bg-dark-background-color-2/50 p-3 text-xs opacity-75">
          <span className="font-semibold block mb-1">Source Playlists:</span>
          <ul className="list-disc list-inside">
            {sourcePlaylistNames.map((name, i) => (
              <li key={i}>{name}</li>
            ))}
          </ul>
        </div>
      )}

      {candidateTargets.length > 0 ? (
        <div className="flex flex-col gap-2 my-2">
          <label className="text-xs font-semibold uppercase tracking-wider opacity-60">
            {t('playlistsPage.targetPlaylistLabel', 'Target Playlist')}
          </label>
          <select
            className="w-full rounded-xl bg-background-color-2 dark:bg-dark-background-color-2 px-4 py-3 text-base text-font-color-black dark:text-font-color-white outline-none cursor-pointer"
            value={selectedTargetId ?? ''}
            onChange={(e) => setSelectedTargetId(Number(e.target.value))}
          >
            {candidateTargets.map((playlist: PlaylistDto) => (
              <option key={playlist.id} value={playlist.id}>
                {playlist.name} ({playlist.itemCount} songs)
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="py-4 text-center text-sm opacity-60">
          {t('playlistsPage.noTargetPlaylistFound', 'No available target playlist found.')}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-3">
        <Button
          label={t('common.cancel', 'Cancel')}
          className="border-none bg-background-color-2/50 hover:bg-background-color-2 dark:bg-dark-background-color-2/50 dark:hover:bg-dark-background-color-2"
          clickHandler={() => changePromptMenuData(false)}
        />
        <Button
          label={t('playlistsPage.merge', 'Merge')}
          iconName="call_merge"
          className="bg-font-color-highlight! text-font-color-black! hover:brightness-110"
          isDisabled={!selectedTargetId || mergeMutation.isPending}
          clickHandler={handleMerge}
        />
      </div>
    </div>
  );
};
export default MergePlaylistsPrompt;
