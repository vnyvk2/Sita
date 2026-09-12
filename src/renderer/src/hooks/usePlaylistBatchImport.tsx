import { useContext, useEffect } from 'react';

import { CollectionClient } from '../api/CollectionClient';
import { AppUpdateContext } from '../contexts/AppUpdateContext';

const NOTIFICATION_ID = 'batch-playlist-import';

export function usePlaylistBatchImport() {
  const { updateNotifications } = useContext(AppUpdateContext);

  useEffect(() => {
    const unsubscribe = CollectionClient.onBatchProgress((progress) => {
      const { sessionId, current, total, currentPlaylistName, status } = progress;

      if (status === 'COMPLETED' || status === 'CANCELLED' || status === 'FAILED') {
        updateNotifications((curr) => curr.filter((n) => n.id !== NOTIFICATION_ID));
        return;
      }

      if (status === 'CANCELLING') {
        updateNotifications((curr) =>
          curr.map((n) => {
            if (n.id === NOTIFICATION_ID) {
              return {
                ...n,
                content: 'Cancelling import after current playlist...',
                buttons: []
              };
            }
            return n;
          })
        );
        return;
      }

      const content =
        current > 0
          ? `Importing playlists — ${current}/${total} · ${currentPlaylistName || 'Processing'}`
          : `Importing playlists — 0/${total} · Starting...`;


      updateNotifications((curr) => {
        const existing = curr.find((n) => n.id === NOTIFICATION_ID);
        if (existing) {
          return curr.map((n) => {
            if (n.id === NOTIFICATION_ID) {
              return {
                ...n,
                content,
                progressBarData: { total, value: current }
              };
            }
            return n;
          });
        }

        const newNotif: AppNotification = {
          id: NOTIFICATION_ID,
          type: 'WITH_PROGRESS_BAR',
          iconName: 'publish',
          content,
          duration: 99999999,
          progressBarData: { total, value: current },
          buttons: [
            {
              label: 'Cancel',
              clickHandler: () => {
                CollectionClient.cancelImportBatch(sessionId);
              }
            }
          ]
        };
        return [newNotif, ...curr];
      });
    });

    return () => {
      unsubscribe?.();
    };
  }, [updateNotifications]);
}
