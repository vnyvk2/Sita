import logger from '../logger';

const watcherInstances: { id: string; controller: AbortController }[] = [];

export const getAbortController = (pathOrId?: string) => {
  return watcherInstances.find((watcherInstance) => watcherInstance.id === pathOrId)?.controller;
};

export const closeAbortController = (pathOrId?: string) => {
  for (let i = 0; i < watcherInstances.length; i += 1) {
    const watcherInstance = watcherInstances[i];
    if (watcherInstance.id === pathOrId) {
      watcherInstance.controller.abort();
      watcherInstances.splice(i, 1);
      return;
    }
  }
  return logger.warn(
    `Failed to close a watcher. Watcher instance not found in watcherInstances array.`,
    { watcherPath: pathOrId }
  );
};

export const closeAllAbortControllers = () => {
  const abortControllerIds = watcherInstances.map((instance) => instance.id);
  for (let i = 0; i < watcherInstances.length; i += 1) {
    const watcherInstance = watcherInstances[i];
    watcherInstance.controller.abort();
  }
  watcherInstances.length = 0;
  return logger.debug(`Closed all abort controllers successfully.`, {
    closedAbortControllerIds: abortControllerIds
  });
};

export const saveAbortController = (IdOrPath: string, controller: AbortController) => {
  watcherInstances.push({ id: IdOrPath, controller });
};
