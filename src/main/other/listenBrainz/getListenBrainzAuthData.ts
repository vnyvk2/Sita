import { getUserSettings } from '@main/db/queries/settings';

import { decrypt } from '../../utils/safeStorage';

export interface ListenBrainzAuthData {
  userToken: string;
  userName: string | null;
}

const getListenBrainzAuthData = async (): Promise<ListenBrainzAuthData> => {
  const { listenBrainzUserToken: encryptedUserToken, listenBrainzUsername: userName } =
    await getUserSettings();

  if (!encryptedUserToken) {
    throw new Error('Encrypted ListenBrainz User Token not found');
  }

  const userToken = decrypt(encryptedUserToken);
  return { userToken, userName };
};

export default getListenBrainzAuthData;
