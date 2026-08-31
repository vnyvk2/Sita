import { clearScrobbleQueue } from '@main/db/queries/scrobble_queue';
import { getUserSettings, saveUserSettings } from '@main/db/queries/settings';
import type { ListenBrainzValidateTokenResponse } from '../../../types/listen_brainz_api';
import logger from '../../logger';
import { dataUpdateEvent, sendMessageToRenderer } from '../../main';
import { encrypt } from '../../utils/safeStorage';
import { flushScrobbleQueue } from '../lastFm/flushScrobbleQueue';
import { invalidateListenBrainzSession } from './listenBrainzSession';
import {
  fetchWithTimeout,
  getListenBrainzUserAgent,
  LISTENBRAINZ_BASE_URL,
  LISTENBRAINZ_REQUEST_TIMEOUT_MS
} from './listenBrainzUtils';

export const validateAndSaveListenBrainzToken = async (
  rawToken: string
): Promise<{ success: boolean; userName: string }> => {
  const token = rawToken.trim();
  if (!token) {
    throw new Error('ListenBrainz user token cannot be empty.');
  }

  try {
    const url = new URL(`${LISTENBRAINZ_BASE_URL}/validate-token`);

    const res = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: `Token ${token}`,
          'User-Agent': getListenBrainzUserAgent()
        }
      },
      LISTENBRAINZ_REQUEST_TIMEOUT_MS
    );

    const json: ListenBrainzValidateTokenResponse = await res.json().catch(() => ({
      code: res.status,
      message: 'Failed to parse response',
      valid: false
    }));

    if (res.ok && json.valid && json.user_name) {
      const { user_name: userName } = json;
      const encryptedKey = encrypt(token);
      logger.info('Successfully validated ListenBrainz user token', { userName });

      const currentSettings = await getUserSettings();
      if (
        currentSettings.listenBrainzUserToken &&
        currentSettings.listenBrainzUsername !== userName
      ) {
        logger.info(
          'Switching ListenBrainz accounts: invalidating session and clearing queue',
          {
            previousUser: currentSettings.listenBrainzUsername,
            newUser: userName
          }
        );
        invalidateListenBrainzSession();
        await clearScrobbleQueue('listenbrainz');
      }

      await saveUserSettings({
        listenBrainzUsername: userName,
        listenBrainzUserToken: encryptedKey
      });

      dataUpdateEvent('userData');

      flushScrobbleQueue().catch((error) => {
        logger.error('Failed to flush scrobble queue after ListenBrainz login', { error });
      });

      sendMessageToRenderer({ messageCode: 'LISTENBRAINZ_LOGIN_SUCCESS' });
      return { success: true, userName };
    }

    const errMessage = json.message || 'Invalid ListenBrainz User Token.';
    logger.warn('ListenBrainz token validation failed', { status: res.status, message: errMessage });
    throw new Error(errMessage);
  } catch (error) {
    logger.error('Error occurred when authenticating ListenBrainz user data.', {
      error: error instanceof Error ? error.message : error
    });
    throw error;
  }
};

export default validateAndSaveListenBrainzToken;
