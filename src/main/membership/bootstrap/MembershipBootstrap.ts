import { MembershipCache } from '../cache/MembershipCache';
import { MembershipEventBus } from '../events/MembershipEventBus';
import { DatabaseMembershipRepository } from '../repository/DatabaseMembershipRepository';
import { MembershipService } from '../service/MembershipService';

export interface MembershipContainer {
  service: MembershipService;
  repository: DatabaseMembershipRepository;
  cache: MembershipCache;
  eventBus: MembershipEventBus;
}

export class MembershipBootstrap {
  private static instancePromise: Promise<MembershipContainer> | null = null;

  public static async getInstance(): Promise<MembershipContainer> {
    if (!this.instancePromise) {
      this.instancePromise = this.bootstrap();
    }
    return this.instancePromise;
  }

  public static async bootstrap(): Promise<MembershipContainer> {
    const repository = new DatabaseMembershipRepository();
    const cache = new MembershipCache();
    const eventBus = new MembershipEventBus();

    const service = new MembershipService({
      repository,
      cache,
      eventBus
    });

    return {
      service,
      repository,
      cache,
      eventBus
    };
  }
}
