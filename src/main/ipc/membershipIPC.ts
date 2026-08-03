import { ipcMain } from 'electron';

import { MembershipBootstrap } from '../membership/bootstrap/MembershipBootstrap';
import type { MembershipEntityKind, MembershipReference } from '../membership/models/MembershipReference';

export function registerMembershipIPCHandlers(): void {
  ipcMain.handle(
    'membership:getMembers',
    async (_event, collection: MembershipReference, memberKind: MembershipEntityKind) => {
      const container = await MembershipBootstrap.getInstance();
      return container.service.getMembers(collection, memberKind);
    }
  );

  ipcMain.handle(
    'membership:getCollectionsContaining',
    async (_event, member: MembershipReference, collectionKind: MembershipEntityKind) => {
      const container = await MembershipBootstrap.getInstance();
      return container.service.getCollectionsContaining(member, collectionKind);
    }
  );

  ipcMain.handle(
    'membership:contains',
    async (_event, collection: MembershipReference, member: MembershipReference) => {
      const container = await MembershipBootstrap.getInstance();
      return container.service.contains(collection, member);
    }
  );

  ipcMain.handle(
    'membership:containsMany',
    async (_event, collection: MembershipReference, members: MembershipReference[]) => {
      const container = await MembershipBootstrap.getInstance();
      const resultMap = await container.service.containsMany(collection, members);
      return Object.fromEntries(resultMap.entries());
    }
  );

  ipcMain.handle(
    'membership:count',
    async (_event, collection: MembershipReference, memberKind: MembershipEntityKind) => {
      const container = await MembershipBootstrap.getInstance();
      return container.service.countMembers(collection, memberKind);
    }
  );
}
