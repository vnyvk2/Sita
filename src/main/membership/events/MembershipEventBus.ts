import { EventEmitter } from 'events';

import type { MembershipEntityKind, MembershipReference } from '../models/MembershipReference';

export type MembershipChangeType = 'added' | 'removed' | 'cleared' | 'replaced';

export interface MembershipChangedPayload {
  readonly type: MembershipChangeType;
  readonly collection: MembershipReference;
  readonly memberKind: MembershipEntityKind;
  readonly members?: readonly MembershipReference[];
}

export class MembershipEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  public emitMembershipChanged(payload: MembershipChangedPayload): void {
    this.emitter.emit('MembershipChanged', payload);
  }

  public onMembershipChanged(handler: (payload: MembershipChangedPayload) => void): () => void {
    this.emitter.on('MembershipChanged', handler);
    return () => {
      this.emitter.off('MembershipChanged', handler);
    };
  }
}
