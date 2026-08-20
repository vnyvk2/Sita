import { useEffect, useState } from 'react';

const useNetworkConnectivity = () => {
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    setIsOnline(navigator.onLine);

    window.addEventListener(
      'online',
      () => {
        setIsOnline(true);
        window.api.audioLibraryControls?.flushScrobbleQueue?.().catch(() => {});
      },
      {
        signal: controller.signal
      }
    );
    window.addEventListener('offline', () => setIsOnline(false), {
      signal: controller.signal
    });

    return () => controller.abort();
  }, []);

  return { isOnline };
};

export default useNetworkConnectivity;
