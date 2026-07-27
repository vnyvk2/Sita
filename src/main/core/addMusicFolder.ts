import path from 'path';

import parseFolderStructuresForSongPaths, {
  doesFolderExistInFolderStructure
} from '../fs/parseFolderStructuresForSongPaths';
import logger from '../logger';
import { dataUpdateEvent, sendMessageToRenderer } from '../main';

import { tryToParseSong } from '../parseSong/parseSong';
import { timeEnd, timeStart } from '../utils/measureTimeUsage';
import { libraryScheduler } from '../workers/jobScheduler';
import { ArtworkJob } from '../workers/jobs/artworkJob';

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
  const songPathsData = await parseFolderStructuresForSongPaths(eligableStructures);

  if (songPathsData) {
    const startTime = timeStart();

    // We process metadata using a bounded concurrency queue (Phase 2 Fast Path)
    const MAX_CONCURRENT_PARSES = 8;
    const albumAssetsToQueue = new Map<number, string>(); // albumId -> sampleSongPath

    let index = 0;
    let hasAborted = false;

    const worker = async () => {
      while (true) {
        if (hasAborted || index >= songPathsData.length) break;
        
        if (abortSignal?.aborted) {
          hasAborted = true;
          logger.warn('Parsing songs in music folders aborted by an abortController signal.', {
            reason: abortSignal?.reason
          });
          break;
        }

        const currentIndex = index++;
        const songPathData = songPathsData[currentIndex];
        
        try {
          const result = await tryToParseSong(
            songPathData.songPath, 
            songPathData.folder.id, 
            false, 
            currentIndex >= 10
          );

          if (result?.relevantAlbum) {
            if (!albumAssetsToQueue.has(result.relevantAlbum.id)) {
              albumAssetsToQueue.set(result.relevantAlbum.id, songPathData.songPath);
            }
          }

          sendMessageToRenderer({
            messageCode: 'AUDIO_PARSING_PROCESS_UPDATE',
            data: { total: songPathsData.length, value: currentIndex + 1 }
          });
        } catch (error) {
          logger.error(`Failed to parse '${path.basename(songPathData.songPath)}'.`, {
            error,
            songPath: songPathData.songPath
          });
        }
      }
    };

    // Kick off the initial workers
    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(MAX_CONCURRENT_PARSES, songPathsData.length); i++) {
      workers.push(worker());
    }

    // Wait for all workers to finish
    await Promise.all(workers);

    timeEnd(startTime, 'Time to parse the whole folder');

    // Enqueue background artwork jobs for all collected unique albums
    if (albumAssetsToQueue.size > 0) {
      for (const [albumId, sampleSongPath] of albumAssetsToQueue.entries()) {
        libraryScheduler.enqueue(new ArtworkJob(albumId, sampleSongPath, libraryScheduler));
      }
    }
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
