import { createFileRoute } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { store } from '@renderer/store/store';
import BatchSongTagsEditor from '@renderer/components/BatchSongTagsEditor';

export const Route = createFileRoute('/main-player/songs/batch-edit')({
  validateSearch: (search: Record<string, unknown>) => {
    let songIds: number[] | undefined;
    if (Array.isArray(search.songIds)) {
      songIds = search.songIds.map(Number).filter((n) => !isNaN(n));
    } else if (typeof search.songIds === 'string') {
      songIds = search.songIds
        .split(',')
        .map(Number)
        .filter((n) => !isNaN(n));
    }
    return { songIds };
  },
  component: BatchEditPage
});

function BatchEditPage() {
  const { songIds: querySongIds } = Route.useSearch();
  const multiSelections = useStore(
    store,
    (state) =>
      state.multipleSelectionsData.selectionType === 'songs'
        ? state.multipleSelectionsData.multipleSelections
        : []
  );

  const effectiveSongIds =
    querySongIds && querySongIds.length > 0 ? querySongIds : multiSelections;

  return <BatchSongTagsEditor initialSongIds={effectiveSongIds} />;
}

export default BatchEditPage;
