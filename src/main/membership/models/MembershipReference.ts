export type MembershipEntityKind = 'song' | 'artist' | 'album' | 'playlist' | 'genre';

export interface MembershipReference {
  readonly kind: MembershipEntityKind;
  readonly id: string | number;
}
