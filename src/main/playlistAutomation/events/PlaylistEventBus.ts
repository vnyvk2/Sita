import type { PlaylistAutomationEvent } from '../models/PlaylistAutomationEvent';

export type EventHandler = (event: PlaylistAutomationEvent) => void | Promise<void>;

export class PlaylistEventBus {
  private handlers = new Set<EventHandler>();

  subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  async publish(event: PlaylistAutomationEvent): Promise<void> {
    for (const handler of this.handlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error('Error handling PlaylistAutomationEvent:', error);
      }
    }
  }
}
