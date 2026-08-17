import {
  closeAbortController,
  closeAllAbortControllers,
  getAbortController,
  saveAbortController
} from '@main/fs/controlAbortControllers';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('controlAbortControllers', () => {
  beforeEach(() => {
    // Ensure clean state before every test by calling closeAllAbortControllers
    closeAllAbortControllers();
  });

  it('should register and retrieve an abort controller for a path', () => {
    const controller = new AbortController();
    saveAbortController('C:/Music/Rock', controller);

    const retrieved = getAbortController('C:/Music/Rock');
    expect(retrieved).toBe(controller);
    expect(retrieved?.signal.aborted).toBe(false);
  });

  it('should return undefined for an unregistered path', () => {
    const retrieved = getAbortController('C:/Music/NonExistent');
    expect(retrieved).toBeUndefined();
  });

  it('should abort and remove controller when closeAbortController is called', () => {
    const controller = new AbortController();
    const abortSpy = vi.spyOn(controller, 'abort');
    saveAbortController('C:/Music/Jazz', controller);

    closeAbortController('C:/Music/Jazz');

    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(controller.signal.aborted).toBe(true);
    expect(getAbortController('C:/Music/Jazz')).toBeUndefined();
  });

  it('should only close the specified controller without removing others', () => {
    const controller1 = new AbortController();
    const controller2 = new AbortController();
    saveAbortController('C:/Music/FolderA', controller1);
    saveAbortController('C:/Music/FolderB', controller2);

    closeAbortController('C:/Music/FolderA');

    expect(getAbortController('C:/Music/FolderA')).toBeUndefined();
    expect(controller1.signal.aborted).toBe(true);

    expect(getAbortController('C:/Music/FolderB')).toBe(controller2);
    expect(controller2.signal.aborted).toBe(false);
  });

  it('should abort all controllers and clear the tracking array on closeAllAbortControllers', () => {
    const controller1 = new AbortController();
    const controller2 = new AbortController();
    const controller3 = new AbortController();
    const spy1 = vi.spyOn(controller1, 'abort');
    const spy2 = vi.spyOn(controller2, 'abort');
    const spy3 = vi.spyOn(controller3, 'abort');

    saveAbortController('C:/Music/A', controller1);
    saveAbortController('C:/Music/B', controller2);
    saveAbortController('C:/Music/C', controller3);

    closeAllAbortControllers();

    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy2).toHaveBeenCalledTimes(1);
    expect(spy3).toHaveBeenCalledTimes(1);
    expect(controller1.signal.aborted).toBe(true);
    expect(controller2.signal.aborted).toBe(true);
    expect(controller3.signal.aborted).toBe(true);

    expect(getAbortController('C:/Music/A')).toBeUndefined();
    expect(getAbortController('C:/Music/B')).toBeUndefined();
    expect(getAbortController('C:/Music/C')).toBeUndefined();
  });

  it('should allow re-registering and creating a new active watcher after close (mode-switch cycle)', () => {
    // 1. Initial watcher setup in automatic mode
    const initialController = new AbortController();
    saveAbortController('C:/Music/Main', initialController);
    expect(getAbortController('C:/Music/Main')).toBe(initialController);

    // 2. Mode switched to manual -> stopWatchers() calls closeAllAbortControllers()
    closeAllAbortControllers();
    expect(initialController.signal.aborted).toBe(true);
    expect(getAbortController('C:/Music/Main')).toBeUndefined();

    // 3. Mode switched back to automatic -> addWatcherToFolder() checks getAbortController()
    // It must return undefined so that a new AbortController is created and attached
    const checkBeforeReAdd = getAbortController('C:/Music/Main');
    expect(checkBeforeReAdd).toBeUndefined();

    const newController = new AbortController();
    saveAbortController('C:/Music/Main', newController);

    const activeController = getAbortController('C:/Music/Main');
    expect(activeController).toBe(newController);
    expect(activeController?.signal.aborted).toBe(false);
  });
});
