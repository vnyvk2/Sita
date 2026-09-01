import logger from '../../logger';

let currentListenBrainzGeneration = 0;
let activeAbortController: AbortController | null = null;

export function getCurrentListenBrainzGeneration(): number {
  return currentListenBrainzGeneration;
}

export function invalidateListenBrainzSession(): void {
  currentListenBrainzGeneration += 1;
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
  logger.info(
    'ListenBrainz session invalidated: bumped generation and aborted active HTTP requests',
    {
      newGeneration: currentListenBrainzGeneration
    }
  );
}

export function setActiveListenBrainzAbortController(controller: AbortController | null): void {
  activeAbortController = controller;
}

export function _resetListenBrainzSessionForTesting(): void {
  currentListenBrainzGeneration = 0;
  if (activeAbortController) {
    activeAbortController = null;
  }
}
