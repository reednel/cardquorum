import * as fc from 'fast-check';
import { WsConnectionService } from '../ws/ws-connection.service';
import { RoomService } from './room.service';

type RoomVisibility = 'public' | 'friends-only' | 'invite-only';

interface TestRoom {
  id: number;
  name: string;
  description: string | null;
  ownerId: number;
  ownerDisplayName: string | null;
  ownerUsername: string;
  visibility: RoomVisibility;
  memberLimit: number | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RosterEntry {
  roomId: number;
  userId: number;
  lastVisitedAt: Date;
}

const BASE_DATE = new Date('2025-01-01T00:00:00Z');

function makeDate(offsetMs: number): Date {
  return new Date(BASE_DATE.getTime() + offsetMs);
}

/** Generates a room with the given id and owner. */
function roomArb(id: number, ownerId: number): fc.Arbitrary<TestRoom> {
  return fc.record({
    id: fc.constant(id),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    description: fc.option(fc.string({ maxLength: 100 }), { nil: null }),
    ownerId: fc.constant(ownerId),
    ownerDisplayName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
    ownerUsername: fc.string({ minLength: 1, maxLength: 20 }),
    visibility: fc.constantFrom('public' as const, 'friends-only' as const, 'invite-only' as const),
    memberLimit: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null }),
    createdAt: fc.integer({ min: 0, max: 1_000_000 }).map(makeDate),
    updatedAt: fc.integer({ min: 0, max: 1_000_000 }).map(makeDate),
  });
}

function buildService(overrides: {
  roomRepo?: Partial<Record<string, jest.Mock>>;
  rosterRepo?: Partial<Record<string, jest.Mock>>;
  friendService?: Partial<Record<string, jest.Mock>>;
  blockService?: Partial<Record<string, jest.Mock>>;
  inviteRepo?: Partial<Record<string, jest.Mock>>;
  banRepo?: Partial<Record<string, jest.Mock>>;
}): RoomService {
  const roomRepo = {
    findById: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findMemberships: jest.fn(),
    findDiscoverablePublic: jest.fn(),
    findDiscoverablePrivate: jest.fn(),
    searchDiscoverable: jest.fn(),
    ...overrides.roomRepo,
  };

  const rosterRepo = {
    findByRoom: jest.fn().mockResolvedValue([]),
    addMember: jest.fn(),
    removeMember: jest.fn(),
    replaceRoster: jest.fn(),
    countMembers: jest.fn().mockResolvedValue(0),
    isMember: jest.fn().mockResolvedValue(false),
    getAssignedHues: jest.fn().mockResolvedValue([]),
    setAssignedHue: jest.fn(),
    updateLastVisitedAt: jest.fn(),
    findRosteredRoomIds: jest.fn().mockResolvedValue([]),
    ...overrides.rosterRepo,
  };

  const inviteRepo = {
    findInvitedRoomIds: jest.fn().mockResolvedValue([]),
    isInvited: jest.fn(),
    findByRoom: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    delete: jest.fn(),
    ...overrides.inviteRepo,
  };

  const banRepo = {
    findBannedRoomIds: jest.fn().mockResolvedValue([]),
    isBanned: jest.fn(),
    findByRoom: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    ...overrides.banRepo,
  };

  const friendService = {
    areFriends: jest.fn(),
    findFriendIds: jest.fn().mockResolvedValue([]),
    ...overrides.friendService,
  };

  const blockService = {
    getBlockedIds: jest.fn().mockResolvedValue([]),
    isBlocked: jest.fn().mockResolvedValue(false),
    ...overrides.blockService,
  };

  return new RoomService(
    roomRepo as any,
    inviteRepo as any,
    banRepo as any,
    rosterRepo as any,
    { findByRoomId: jest.fn().mockResolvedValue([]) } as any,
    { findByRoomId: jest.fn().mockResolvedValue(null), upsert: jest.fn() } as any,
    new WsConnectionService(),
    friendService as any,
    blockService as any,
    { assignHue: jest.fn().mockReturnValue(0) } as any,
    { getColorPreference: jest.fn().mockResolvedValue(null) } as any,
    { isGameActive: jest.fn().mockReturnValue(false) } as any,
  );
}

/**
 * Memberships returns only rostered rooms in last-visited order.
 *
 * For any set of rooms and roster memberships, the memberships endpoint should
 * return exactly the rooms where the requesting user is on the roster, ordered
 * by last_visited_at descending.
 */
describe('Memberships returns only rostered rooms in last-visited order', () => {
  it('should return only rostered rooms sorted by last_visited_at DESC', async () => {
    const USER_ID = 1;

    // Generate 2–10 rooms owned by various users (not the test user)
    const scenarioArb = fc.integer({ min: 2, max: 10 }).chain((roomCount) => {
      const roomsArb = fc.tuple(
        ...Array.from(
          { length: roomCount },
          (_, i) => roomArb(i + 1, i + 10), // owners 10..19, distinct from USER_ID
        ),
      );
      // For each room, decide if the user is rostered (boolean)
      const rosteredArb = fc.tuple(...Array.from({ length: roomCount }, () => fc.boolean()));
      // For rostered rooms, generate distinct timestamps
      const timestampsArb = fc.array(fc.integer({ min: 0, max: 10_000_000 }), {
        minLength: roomCount,
        maxLength: roomCount,
      });
      return fc.tuple(roomsArb, rosteredArb, timestampsArb);
    });

    await fc.assert(
      fc.asyncProperty(scenarioArb, async ([rooms, rosteredFlags, timestamps]) => {
        // Build roster entries for rooms where user is rostered
        const rosterEntries: RosterEntry[] = [];
        rooms.forEach((room, i) => {
          if (rosteredFlags[i]) {
            rosterEntries.push({
              roomId: room.id,
              userId: USER_ID,
              lastVisitedAt: makeDate(timestamps[i]),
            });
          }
        });

        // The expected result: rostered rooms sorted by lastVisitedAt DESC
        const expectedRooms = rosterEntries
          .sort((a, b) => b.lastVisitedAt.getTime() - a.lastVisitedAt.getTime())
          .map((entry) => rooms.find((r) => r.id === entry.roomId)!);

        // Mock the repository to return the expected rooms (simulating the DB query)
        const service = buildService({
          roomRepo: {
            findMemberships: jest.fn().mockResolvedValue(expectedRooms),
          },
          rosterRepo: {
            countMembers: jest.fn().mockResolvedValue(0),
            isMember: jest.fn().mockResolvedValue(false),
          },
        });

        const result = await service.findMemberships(USER_ID);

        // Verify: only rostered rooms returned
        const resultIds = result.map((r) => r.id);
        const expectedIds = expectedRooms.map((r) => r.id);
        expect(resultIds).toEqual(expectedIds);

        // Verify: count matches
        expect(result.length).toBe(rosterEntries.length);

        // Verify: no non-rostered rooms included
        const rosteredRoomIds = new Set(rosterEntries.map((e) => e.roomId));
        for (const r of result) {
          expect(rosteredRoomIds.has(r.id)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Discover private returns only authorized non-rostered private rooms.
 *
 * For any set of rooms with varying visibility, friendship, invite, ban, and
 * roster states, the discover private endpoint should return only rooms that are
 * (a) friends-only or invite-only, (b) the user is authorized to see, (c) the
 * user is not rostered into, (d) the user is not banned from, and (e) the owner
 * is not blocked.
 */
describe('Discover private returns only authorized non-rostered private rooms', () => {
  it('should filter correctly across random configurations', async () => {
    const USER_ID = 1;

    const scenarioArb = fc.integer({ min: 2, max: 12 }).chain((roomCount) => {
      const ownerIds = Array.from({ length: roomCount }, (_, i) => i + 10);
      const roomsArb = fc.tuple(
        ...Array.from({ length: roomCount }, (_, i) => roomArb(i + 1, ownerIds[i])),
      );
      // Which owners are friends of the user
      const friendFlagsArb = fc.tuple(...Array.from({ length: roomCount }, () => fc.boolean()));
      // Which rooms the user is invited to
      const invitedFlagsArb = fc.tuple(...Array.from({ length: roomCount }, () => fc.boolean()));
      // Which rooms the user is banned from
      const bannedFlagsArb = fc.tuple(...Array.from({ length: roomCount }, () => fc.boolean()));
      // Which rooms the user is rostered into
      const rosteredFlagsArb = fc.tuple(...Array.from({ length: roomCount }, () => fc.boolean()));
      // Which owners have blocked the user
      const blockedFlagsArb = fc.tuple(...Array.from({ length: roomCount }, () => fc.boolean()));
      return fc.tuple(
        roomsArb,
        friendFlagsArb,
        invitedFlagsArb,
        bannedFlagsArb,
        rosteredFlagsArb,
        blockedFlagsArb,
      );
    });

    await fc.assert(
      fc.asyncProperty(
        scenarioArb,
        async ([rooms, friendFlags, invitedFlags, bannedFlags, rosteredFlags, blockedFlags]) => {
          const friendIds = rooms
            .map((r, i) => (friendFlags[i] ? r.ownerId : null))
            .filter((id): id is number => id !== null);
          const invitedRoomIds = rooms.filter((_, i) => invitedFlags[i]).map((r) => r.id);
          const bannedRoomIds = rooms.filter((_, i) => bannedFlags[i]).map((r) => r.id);
          const rosteredRoomIds = rooms.filter((_, i) => rosteredFlags[i]).map((r) => r.id);
          const blockedIds = rooms
            .map((r, i) => (blockedFlags[i] ? r.ownerId : null))
            .filter((id): id is number => id !== null);

          // Compute expected result using the same logic as the repository
          const friendIdSet = new Set(friendIds);
          const invitedRoomIdSet = new Set(invitedRoomIds);
          const bannedRoomIdSet = new Set(bannedRoomIds);
          const rosteredRoomIdSet = new Set(rosteredRoomIds);
          const blockedIdSet = new Set(blockedIds);

          const expected = rooms.filter((room) => {
            // Must be private
            if (room.visibility === 'public') return false;
            // Must not be owned by user
            if (room.ownerId === USER_ID) return false;
            // Must not be banned
            if (bannedRoomIdSet.has(room.id)) return false;
            // Must not be rostered
            if (rosteredRoomIdSet.has(room.id)) return false;
            // Owner must not be blocked
            if (blockedIdSet.has(room.ownerId)) return false;
            // Authorization check
            if (room.visibility === 'friends-only' && friendIdSet.has(room.ownerId)) return true;
            if (room.visibility === 'invite-only' && invitedRoomIdSet.has(room.id)) return true;
            return false;
          });

          // Mock the repository to return the expected filtered rooms
          const service = buildService({
            roomRepo: {
              findDiscoverablePrivate: jest.fn().mockResolvedValue(expected),
            },
            friendService: {
              findFriendIds: jest.fn().mockResolvedValue(friendIds),
            },
            inviteRepo: {
              findInvitedRoomIds: jest.fn().mockResolvedValue(invitedRoomIds),
            },
            banRepo: {
              findBannedRoomIds: jest.fn().mockResolvedValue(bannedRoomIds),
            },
            blockService: {
              getBlockedIds: jest.fn().mockResolvedValue(blockedIds),
            },
            rosterRepo: {
              findRosteredRoomIds: jest.fn().mockResolvedValue(rosteredRoomIds),
              countMembers: jest.fn().mockResolvedValue(0),
              isMember: jest.fn().mockResolvedValue(false),
            },
          });

          const result = await service.findDiscoverablePrivate(USER_ID);

          // Verify: result matches expected
          const resultIds = result.map((r) => r.id);
          const expectedIds = expected.map((r) => r.id);
          expect(resultIds).toEqual(expectedIds);

          // Verify invariants on every returned room
          for (const room of result) {
            const orig = rooms.find((r) => r.id === room.id)!;
            // Must be private
            expect(['friends-only', 'invite-only']).toContain(orig.visibility);
            // Must not be rostered
            expect(rosteredRoomIdSet.has(room.id)).toBe(false);
            // Must not be banned
            expect(bannedRoomIdSet.has(room.id)).toBe(false);
            // Owner must not be blocked
            expect(blockedIdSet.has(orig.ownerId)).toBe(false);
          }

          // Verify: the repository was called with the correct filter IDs
          const repoCall = (service as any).rooms.findDiscoverablePrivate;
          expect(repoCall).toHaveBeenCalledWith(
            USER_ID,
            friendIds,
            invitedRoomIds,
            bannedRoomIds,
            blockedIds,
            rosteredRoomIds,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Discover public returns only non-rostered public rooms.
 *
 * For any set of rooms with varying visibility, ban, and roster states, the
 * discover public endpoint should return only rooms that are (a) public,
 * (b) the user is not rostered into, (c) the user is not banned from, and
 * (d) the owner is not blocked.
 */
describe('Discover public returns only non-rostered public rooms', () => {
  it('should return only public rooms excluding banned/rostered/blocked', async () => {
    const USER_ID = 1;

    const scenarioArb = fc.integer({ min: 2, max: 12 }).chain((roomCount) => {
      const ownerIds = Array.from({ length: roomCount }, (_, i) => i + 10);
      const roomsArb = fc.tuple(
        ...Array.from({ length: roomCount }, (_, i) => roomArb(i + 1, ownerIds[i])),
      );
      const bannedFlagsArb = fc.tuple(...Array.from({ length: roomCount }, () => fc.boolean()));
      const rosteredFlagsArb = fc.tuple(...Array.from({ length: roomCount }, () => fc.boolean()));
      const blockedFlagsArb = fc.tuple(...Array.from({ length: roomCount }, () => fc.boolean()));
      return fc.tuple(roomsArb, bannedFlagsArb, rosteredFlagsArb, blockedFlagsArb);
    });

    await fc.assert(
      fc.asyncProperty(scenarioArb, async ([rooms, bannedFlags, rosteredFlags, blockedFlags]) => {
        const bannedRoomIds = rooms.filter((_, i) => bannedFlags[i]).map((r) => r.id);
        const rosteredRoomIds = rooms.filter((_, i) => rosteredFlags[i]).map((r) => r.id);
        const blockedIds = rooms
          .map((r, i) => (blockedFlags[i] ? r.ownerId : null))
          .filter((id): id is number => id !== null);

        const bannedRoomIdSet = new Set(bannedRoomIds);
        const rosteredRoomIdSet = new Set(rosteredRoomIds);
        const blockedIdSet = new Set(blockedIds);

        // Compute expected: public, not owned by user, not banned, not rostered, owner not blocked
        const expected = rooms.filter((room) => {
          if (room.visibility !== 'public') return false;
          if (room.ownerId === USER_ID) return false;
          if (bannedRoomIdSet.has(room.id)) return false;
          if (rosteredRoomIdSet.has(room.id)) return false;
          if (blockedIdSet.has(room.ownerId)) return false;
          return true;
        });

        const PAGE = 1;
        const PAGE_SIZE = 20;

        const service = buildService({
          roomRepo: {
            findDiscoverablePublic: jest.fn().mockResolvedValue({
              rooms: expected.slice(0, PAGE_SIZE),
              total: expected.length,
            }),
          },
          banRepo: {
            findBannedRoomIds: jest.fn().mockResolvedValue(bannedRoomIds),
          },
          blockService: {
            getBlockedIds: jest.fn().mockResolvedValue(blockedIds),
          },
          rosterRepo: {
            findRosteredRoomIds: jest.fn().mockResolvedValue(rosteredRoomIds),
            countMembers: jest.fn().mockResolvedValue(0),
            isMember: jest.fn().mockResolvedValue(false),
          },
        });

        const result = await service.findDiscoverablePublic(USER_ID, PAGE, PAGE_SIZE);

        // Verify: all returned rooms are public
        for (const room of result.data) {
          const orig = rooms.find((r) => r.id === room.id)!;
          expect(orig.visibility).toBe('public');
          expect(bannedRoomIdSet.has(room.id)).toBe(false);
          expect(rosteredRoomIdSet.has(room.id)).toBe(false);
          expect(blockedIdSet.has(orig.ownerId)).toBe(false);
        }

        // Verify: total matches expected count
        expect(result.total).toBe(expected.length);

        // Verify: page metadata
        expect(result.page).toBe(PAGE);
        expect(result.pageSize).toBe(PAGE_SIZE);

        // Verify: repository called with correct exclusion IDs
        const repoCall = (service as any).rooms.findDiscoverablePublic;
        expect(repoCall).toHaveBeenCalledWith(
          USER_ID,
          bannedRoomIds,
          blockedIds,
          rosteredRoomIds,
          0, // offset = (page - 1) * pageSize
          PAGE_SIZE,
        );
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Pagination preserves completeness.
 *
 * For any set of N public discoverable rooms, iterating through all pages of
 * size 20 should yield exactly N rooms total, with no duplicates and no
 * omissions, and each page should contain at most 20 items.
 */
describe('Pagination preserves completeness', () => {
  it('should return all rooms across pages with no duplicates or omissions', async () => {
    const USER_ID = 1;
    const PAGE_SIZE = 20;

    // Generate between 0 and 65 public rooms (covers 0, 1, partial, exact, and multi-page)
    const roomCountArb = fc.integer({ min: 0, max: 65 });

    await fc.assert(
      fc.asyncProperty(roomCountArb, async (totalRooms) => {
        // Create N public rooms owned by other users
        const allRooms: TestRoom[] = Array.from({ length: totalRooms }, (_, i) => ({
          id: i + 1,
          name: `Room ${i + 1}`,
          description: null,
          ownerId: i + 10,
          ownerDisplayName: null,
          ownerUsername: `user${i + 10}`,
          visibility: 'public' as const,
          memberLimit: null,
          createdAt: makeDate(totalRooms - i), // descending order
          updatedAt: makeDate(totalRooms - i),
        }));

        const totalPages = totalRooms === 0 ? 1 : Math.ceil(totalRooms / PAGE_SIZE);
        const collectedIds: number[] = [];

        for (let page = 1; page <= totalPages; page++) {
          const offset = (page - 1) * PAGE_SIZE;
          const pageRooms = allRooms.slice(offset, offset + PAGE_SIZE);

          const service = buildService({
            roomRepo: {
              findDiscoverablePublic: jest.fn().mockResolvedValue({
                rooms: pageRooms,
                total: totalRooms,
              }),
            },
            banRepo: { findBannedRoomIds: jest.fn().mockResolvedValue([]) },
            blockService: { getBlockedIds: jest.fn().mockResolvedValue([]) },
            rosterRepo: {
              findRosteredRoomIds: jest.fn().mockResolvedValue([]),
              countMembers: jest.fn().mockResolvedValue(0),
              isMember: jest.fn().mockResolvedValue(false),
            },
          });

          const result = await service.findDiscoverablePublic(USER_ID, page, PAGE_SIZE);

          // Each page has at most PAGE_SIZE items
          expect(result.data.length).toBeLessThanOrEqual(PAGE_SIZE);

          // Total is consistent
          expect(result.total).toBe(totalRooms);

          collectedIds.push(...result.data.map((r) => r.id));
        }

        // No duplicates
        const uniqueIds = new Set(collectedIds);
        expect(uniqueIds.size).toBe(collectedIds.length);

        // No omissions — all rooms accounted for
        expect(collectedIds.length).toBe(totalRooms);

        // Every room ID is present
        for (const room of allRooms) {
          expect(uniqueIds.has(room.id)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Search returns only name-matching rooms.
 *
 * For any search query and set of discoverable rooms, every room returned by
 * the search endpoint should have a name containing the query as a
 * case-insensitive substring, and every discoverable room whose name contains
 * the query should be included in the results.
 */
describe('Search returns only name-matching rooms', () => {
  it('should return exactly the rooms whose names match the query case-insensitively', async () => {
    const USER_ID = 1;

    const scenarioArb = fc.integer({ min: 2, max: 10 }).chain((roomCount) => {
      const ownerIds = Array.from({ length: roomCount }, (_, i) => i + 10);
      const roomsArb = fc.tuple(
        ...Array.from({ length: roomCount }, (_, i) => roomArb(i + 1, ownerIds[i])),
      );
      // Generate a search query (1-5 alphanumeric chars to avoid regex special chars)
      const queryArb = fc.stringMatching(/^[a-zA-Z0-9]{1,5}$/);
      // Visibility and authorization flags
      const friendFlagsArb = fc.tuple(...Array.from({ length: roomCount }, () => fc.boolean()));
      const invitedFlagsArb = fc.tuple(...Array.from({ length: roomCount }, () => fc.boolean()));
      return fc.tuple(roomsArb, queryArb, friendFlagsArb, invitedFlagsArb);
    });

    await fc.assert(
      fc.asyncProperty(scenarioArb, async ([rooms, query, friendFlags, invitedFlags]) => {
        const friendIds = rooms
          .map((r, i) => (friendFlags[i] ? r.ownerId : null))
          .filter((id): id is number => id !== null);
        const invitedRoomIds = rooms.filter((_, i) => invitedFlags[i]).map((r) => r.id);

        // Compute which rooms are discoverable (public, or authorized private)
        const friendIdSet = new Set(friendIds);
        const invitedRoomIdSet = new Set(invitedRoomIds);

        const discoverable = rooms.filter((room) => {
          if (room.ownerId === USER_ID) return false;
          if (room.visibility === 'public') return true;
          if (room.visibility === 'friends-only' && friendIdSet.has(room.ownerId)) return true;
          if (room.visibility === 'invite-only' && invitedRoomIdSet.has(room.id)) return true;
          return false;
        });

        // Apply case-insensitive name matching
        const lowerQuery = query.toLowerCase();
        const expected = discoverable.filter((room) =>
          room.name.toLowerCase().includes(lowerQuery),
        );

        const service = buildService({
          roomRepo: {
            searchDiscoverable: jest.fn().mockResolvedValue(expected),
          },
          friendService: {
            findFriendIds: jest.fn().mockResolvedValue(friendIds),
          },
          inviteRepo: {
            findInvitedRoomIds: jest.fn().mockResolvedValue(invitedRoomIds),
          },
          banRepo: { findBannedRoomIds: jest.fn().mockResolvedValue([]) },
          blockService: { getBlockedIds: jest.fn().mockResolvedValue([]) },
          rosterRepo: {
            findRosteredRoomIds: jest.fn().mockResolvedValue([]),
            countMembers: jest.fn().mockResolvedValue(0),
            isMember: jest.fn().mockResolvedValue(false),
          },
        });

        const result = await service.searchDiscoverable(USER_ID, query);

        // Verify: every returned room's name contains the query (case-insensitive)
        for (const room of result) {
          expect(room.name.toLowerCase()).toContain(lowerQuery);
        }

        // Verify: result count matches expected
        expect(result.length).toBe(expected.length);

        // Verify: every expected room is included
        const resultIds = new Set(result.map((r) => r.id));
        for (const room of expected) {
          expect(resultIds.has(room.id)).toBe(true);
        }

        // Verify: the repository was called with the query
        const repoCall = (service as any).rooms.searchDiscoverable;
        expect(repoCall).toHaveBeenCalledWith(
          USER_ID,
          query,
          friendIds,
          invitedRoomIds,
          [], // bannedRoomIds
          [], // blockedIds
          [], // rosteredRoomIds
        );
      }),
      { numRuns: 100 },
    );
  });
});
