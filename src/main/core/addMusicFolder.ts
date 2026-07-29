
import parseFolderStructuresForSongPaths, {
  doesFolderExistInFolderStructure
} from '../fs/parseFolderStructuresForSongPaths';
import logger from '../logger';
import { dataUpdateEvent, sendMessageToRenderer } from '../main';
import { processSongsWithWorkerPool } from './songWorkerPool';

import { timeEnd, timeStart } from '../utils/measureTimeUsage';

const removeAlreadyAvailableStructures = async (structures: FolderStructure[]) => {
  const parents: FolderStructure[] = [];
  for (const structure of structures) {
    const doesParentStructureExist = await doesFolderExistInFolderStructure(structure.path);

    if (doesParentStructureExist) {
      if (structure.subFolders.length > 0) {
        const subFolders = await removeAlreadyAvailableStructures(structure.subFolders);
        parents.push(...subFolders);
      }
    } else {
      const subFolders = await removeAlreadyAvailableStructures(structure.subFolders);
      parents.push({ ...structure, subFolders });
    }
  }
  return parents;
};

const addMusicFromFolderStructures = async (
  structures: FolderStructure[],
  abortSignal?: AbortSignal
) => {
  logger.debug('Started the process of linking a music folders to the library.');

  logger.info(`Added new song folders to the app.`, {
    folderPaths: structures.map((x) => x.path)
  });

  const eligableStructures = await removeAlreadyAvailableStructures(structures);
  logger.info(`After removeAlreadyAvailableStructures`, { eligableStructures: eligableStructures.map(x => x.path) });
  const songPathsData = await parseFolderStructuresForSongPaths(eligableStructures);
  logger.info(`After parseFolderStructuresForSongPaths`, { songPathsDataLength: songPathsData?.length });

  if (songPathsData) {
    const startTime = timeStart();
    
    const mappedSongs = songPathsData.map((data) => ({
      songPath: data.songPath,
      folderId: data.folder.id
    }));

    await processSongsWithWorkerPool(mappedSongs, abortSignal, (current, total) => {
      sendMessageToRenderer({
        messageCode: 'AUDIO_PARSING_PROCESS_UPDATE',
        data: { total, value: current }
      });
    });

    timeEnd(startTime, 'Time to parse the whole folder');
  } else throw new Error('Failed to get song paths from music folders.');

  logger.debug(
    `Successfully parsed ${songPathsData.length} songs from the selected music folders.`,
    {
      folderPaths: eligableStructures.map((x) => x.path)
    }
  );
  dataUpdateEvent('userData/musicFolder');
};

export default addMusicFromFolderStructures;

