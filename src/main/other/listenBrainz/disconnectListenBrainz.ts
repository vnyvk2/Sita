import { clearScrobbleQueue } from '@main/db/queries/scrobble_queue';
import { saveUserSettings } from '@main/db/queries/settings';

import logger from '../../logger';
import { dataUpdateEvent } from '../../main';
import { invalidateListenBrainzSession } from './listenBrainzSession';

export const disconnectListenBrainz = async (): Promise<boolean> => {
  try {
    logger.info('Disconnecting ListenBrainz account');
    invalidateListenBrainzSession();
    await clearScrobbleQueue('listenbrainz');

    await saveUserSettings({
      listenBrainzUsername: null,
      listenBrainzUserToken: null,
      sendSongScrobblingDataToListenBrainz: false,
      sendSongFavoritesDataToListenBrainz: false,
      sendNowPlayingSongDataToListenBrainz: false
    });

    dataUpdateEvent('userData');
    return true;
  } catch (error) {
    logger.error('Failed to disconnect ListenBrainz', { error });
    throw error;
  }
};

export default disconnectListenBrainz;
