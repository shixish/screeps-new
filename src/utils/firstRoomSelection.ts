/*
  First-room selection: rank candidate rooms before the player has a spawn.

  Runs from initialize() when Game.spawns is empty. Results are cached in
  Memory.firstRoom until the visible/known world changes or the TTL expires.
  Logs the recommendation once (no spam). While bootstrap is active (no owned
  spawn) and the player script is actually running, the world map shows the
  top 5 ranks via Game.map.visual; any of those rooms that are already visible
  also get an in-room rank label. The best visible room still gets a cyan flag.

  Official / sim empty worlds do not run player scripts before the first spawn,
  so Game.map.visual cannot appear on the room-picker UI. After any owned spawn
  exists, ranking settles and overlays stop (later ranking will change).

  Spawn placement still uses the existing in-room bootstrap once the player is
  in (or can act on) that room.

  Pass-1 (optional coarse CPU filter): E / (D + 1) from the sources+controller
  midpoint (swampCost=5). Pass-2 (published ranking / top 5 / map labels):
  score2 = E2 / (D2 + 1) from a placeable spawn with swamp=plain and
  E2 = 10*H harvest seats. Owned/NPC/reserved rooms are skipped.

  On private-server allOpen mode, every eligible candidate gets pass-2.
*/

import { FIRST_ROOM_MAP_TOP_N, paintTopFirstRoomsInVisibleRooms, paintTopFirstRoomsOnMap } from "./firstRoomMapVisual";
import {
  RankedFirstRoom,
  RankedFirstRoomPass2,
  compareFirstRoomPass2Scores,
  rankFirstRooms,
  rankFirstRoomsPass2
} from "./firstRoomScore";
import { RoomIndex, RoomRegion, defaultFirstRoomRegion, listRoomsInRegion } from "./roomNames";
import { TilePos } from "./spawnPlacement";

export { FIRST_ROOM_MAP_TOP_N };

export const FIRST_ROOM_TTL = 1000;
export const FIRST_ROOM_SCORED_PER_TICK = 4;
export const FIRST_ROOM_TOP_N = 10;
export const FIRST_ROOM_PASS2_TOP_N = 10;
export const FIRST_ROOM_PASS2_PER_TICK = 1;
export const FIRST_ROOM_PASS2_ALLOPEN_PER_TICK = 4;
export const FIRST_ROOM_FLAG = "first-room";

export interface StoredRoomIntel {
  sources: TilePos[];
  controller?: TilePos;
  minerals?: TilePos[];
  owner?: string | null;
  my?: boolean;
  reserved?: boolean;
  scannedAt: number;
}

export interface HarvestSeatMemory {
  x: number;
  y: number;
  seats: number;
}

export interface FirstRoomPathLegMemory {
  to: "source" | "controller";
  x: number;
  y: number;
  cost: number;
  seat?: TilePos;
}

export interface FirstRoomRankEntry {
  roomName: string;
  eligible: boolean;
  score: number;
  /** Pass-2 score when present; map visuals and published top 5 prefer this. */
  score2?: number;
  /** Pass-2 spawn score when numeric. */
  spawn?: number;
  energyPerTick: number;
  walkCost: number;
  sourceCount: number;
  midpoint?: TilePos;
  spawnPos?: TilePos;
  H?: number;
  E2?: number;
  D2?: number;
  harvestSeats?: HarvestSeatMemory[];
  legs?: FirstRoomPathLegMemory[];
  usedChebyshev: boolean;
  reason?: string;
}

export interface FirstRoomPass2Entry {
  roomName: string;
  eligible: boolean;
  spawnPos?: TilePos;
  H: number;
  E2: number;
  D2: number;
  score2: number;
  harvestSeats: HarvestSeatMemory[];
  legs?: FirstRoomPathLegMemory[];
  usedChebyshev: boolean;
  reason?: string;
}

export interface FirstRoomPass2Memory {
  ranked: FirstRoomPass2Entry[];
  pending: string[];
  complete: boolean;
  logged?: boolean;
  topN: number;
  shortlistKey: string;
  bestRoom?: string;
}

export interface FirstRoomMemory {
  bestRoom?: string;
  ranked: FirstRoomRankEntry[];
  candidates: string[];
  pending: string[];
  intel: { [roomName: string]: StoredRoomIntel };
  region: RoomRegion;
  worldKey: string;
  computedAt: number;
  complete: boolean;
  logged?: boolean;
  settled?: boolean;
  pass2?: FirstRoomPass2Memory;
}

declare global {
  interface Memory {
    firstRoom?: FirstRoomMemory;
    firstRoomRegion?: RoomRegion;
    /** Override pass-2 shortlist size. 0 = every pass-1 eligible room. */
    firstRoomPass2TopN?: number;
  }
}

function firstRoomMemory(): FirstRoomMemory | undefined {
  return Memory.firstRoom;
}

function setFirstRoomMemory(value: FirstRoomMemory): FirstRoomMemory {
  Memory.firstRoom = value;
  return value;
}

function visibleRoomNames(): string[] {
  return Game.rooms ? Object.keys(Game.rooms) : [];
}

function knownRoomNames(intel: { [roomName: string]: StoredRoomIntel }): string[] {
  const names = new Set<string>(Object.keys(intel));
  if (Memory.rooms) {
    for (const name in Memory.rooms) names.add(name);
  }
  return Array.from(names);
}

function liveRoomIndex(intel: { [roomName: string]: StoredRoomIntel }): RoomIndex {
  const map = typeof Game !== "undefined" ? Game.map : undefined;
  return {
    getWorldSize: map?.getWorldSize ? () => map.getWorldSize() : undefined,
    isRoomOpen: (roomName: string) => {
      if (!map) return true;
      if (map.getRoomStatus) {
        try {
          return map.getRoomStatus(roomName).status !== "closed";
        } catch {
          return true;
        }
      }
      if (map.isRoomAvailable) {
        try {
          return map.isRoomAvailable(roomName);
        } catch {
          return true;
        }
      }
      return true;
    },
    visibleRooms: visibleRoomNames,
    knownRooms: () => knownRoomNames(intel),
    describeExits: map?.describeExits
      ? (roomName: string) => {
          try {
            const exits = map.describeExits(roomName);
            if (!exits) return null;
            return Object.values(exits).filter((name): name is string => Boolean(name));
          } catch {
            return null;
          }
        }
      : undefined
  };
}

function configuredRegion(index: RoomIndex): RoomRegion {
  if (Memory.firstRoomRegion) return Memory.firstRoomRegion;
  return defaultFirstRoomRegion(index);
}

export function worldKeyForSelection(region: RoomRegion, candidates: string[], visible: string[]): string {
  const intelRooms = visible
    .map(name => {
      const room = Game.rooms?.[name];
      const sources = room?.find ? room.find(FIND_SOURCES).length : 0;
      const owner = room?.controller?.owner?.username ?? "";
      return `${name}:${sources}:${owner}`;
    })
    .sort()
    .join(",");
  return `${region.type}|${candidates.slice().sort().join(",")}|${intelRooms}`;
}

function terrainGetter(roomName: string): ((x: number, y: number) => number) | null {
  const visible = Game.rooms?.[roomName];
  if (visible?.getTerrain) {
    const terrain = visible.getTerrain();
    return (x, y) => terrain.get(x, y);
  }
  if (Game.map?.getRoomTerrain) {
    try {
      const terrain = Game.map.getRoomTerrain(roomName);
      return (x, y) => terrain.get(x, y);
    } catch {
      return null;
    }
  }
  return null;
}

export function intelFromRoom(room: Room, time: number): StoredRoomIntel | null {
  const controller = room.controller;
  if (!controller) return null;
  const sources = room.find(FIND_SOURCES);
  const minerals = room.find(FIND_MINERALS);
  return {
    sources: sources.map(source => ({ x: source.pos.x, y: source.pos.y })),
    controller: { x: controller.pos.x, y: controller.pos.y },
    minerals: minerals.map(mineral => ({ x: mineral.pos.x, y: mineral.pos.y })),
    owner: controller.owner?.username ?? null,
    my: Boolean(controller.my),
    reserved: Boolean(controller.reservation),
    scannedAt: time
  };
}

function isClaimableIntel(intel: StoredRoomIntel): boolean {
  if (intel.owner && !intel.my) return false;
  if (intel.reserved) return false;
  return Boolean(intel.controller);
}

function scanVisibleIntel(intel: { [roomName: string]: StoredRoomIntel }, time: number): void {
  if (!Game.rooms) return;
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    if (!room) continue;
    const snapshot = intelFromRoom(room, time);
    if (snapshot) intel[roomName] = snapshot;
  }
}

function scoreableInputs(
  roomNames: string[],
  intel: { [roomName: string]: StoredRoomIntel }
): {
  roomName: string;
  sources: TilePos[];
  controller?: TilePos;
  getTerrain: (x: number, y: number) => number;
  owner?: string | null;
  my?: boolean;
  reserved?: boolean;
  blockedTiles?: TilePos[];
}[] {
  const inputs = [];
  for (const roomName of roomNames) {
    const snapshot = intel[roomName];
    if (!snapshot || !isClaimableIntel(snapshot)) continue;
    const getTerrain = terrainGetter(roomName);
    if (!getTerrain) continue;
    inputs.push({
      roomName,
      sources: snapshot.sources,
      controller: snapshot.controller,
      owner: snapshot.owner,
      my: snapshot.my,
      reserved: snapshot.reserved,
      blockedTiles: snapshot.minerals,
      getTerrain
    });
  }
  return inputs;
}

export function toRankEntry(ranked: RankedFirstRoom): FirstRoomRankEntry {
  const entry: FirstRoomRankEntry = {
    roomName: ranked.roomName,
    eligible: ranked.eligible,
    score: ranked.score,
    energyPerTick: ranked.energyPerTick,
    walkCost: ranked.walkCost,
    sourceCount: ranked.sourceCount,
    usedChebyshev: ranked.usedChebyshev
  };
  if (ranked.midpoint) entry.midpoint = ranked.midpoint;
  if (ranked.reason) entry.reason = ranked.reason;
  return entry;
}

export function toPass2Entry(ranked: RankedFirstRoomPass2): FirstRoomPass2Entry {
  const entry: FirstRoomPass2Entry = {
    roomName: ranked.roomName,
    eligible: ranked.eligible,
    H: ranked.H,
    E2: ranked.E2,
    D2: ranked.D2,
    score2: ranked.score2,
    harvestSeats: ranked.harvestSeats,
    usedChebyshev: ranked.usedChebyshev
  };
  if (ranked.spawnPos) entry.spawnPos = ranked.spawnPos;
  if (ranked.legs) entry.legs = ranked.legs;
  if (ranked.reason) entry.reason = ranked.reason;
  return entry;
}

function applyPass2ToRankEntry(entry: FirstRoomRankEntry, pass2: FirstRoomPass2Entry): void {
  entry.eligible = pass2.eligible;
  entry.H = pass2.H;
  entry.E2 = pass2.E2;
  entry.D2 = pass2.D2;
  entry.score2 = pass2.score2;
  entry.harvestSeats = pass2.harvestSeats;
  if (pass2.spawnPos) entry.spawnPos = pass2.spawnPos;
  if (pass2.legs) entry.legs = pass2.legs;
  if (pass2.reason) entry.reason = pass2.reason;
  else delete entry.reason;
}

export function configuredPass2TopN(region?: RoomRegion): number {
  const override = typeof Memory !== "undefined" ? Memory.firstRoomPass2TopN : undefined;
  if (typeof override === "number" && override >= 0) return Math.floor(override);
  if (region?.type === "allOpen") return 0;
  return FIRST_ROOM_PASS2_TOP_N;
}

function pass2BatchSize(region?: RoomRegion): number {
  return region?.type === "allOpen" ? FIRST_ROOM_PASS2_ALLOPEN_PER_TICK : FIRST_ROOM_PASS2_PER_TICK;
}

function comparePass2Entries(a: FirstRoomPass2Entry, b: FirstRoomPass2Entry): number {
  const byScore = compareFirstRoomPass2Scores(a, b);
  if (byScore !== 0) return byScore;
  return a.roomName.localeCompare(b.roomName);
}

function comparePublishedEntries(a: FirstRoomRankEntry, b: FirstRoomRankEntry): number {
  if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
  const a2 = typeof a.score2 === "number" ? a.score2 : undefined;
  const b2 = typeof b.score2 === "number" ? b.score2 : undefined;
  if (a2 !== undefined && b2 !== undefined && a2 !== b2) return b2 - a2;
  if (a2 !== undefined && b2 === undefined) return -1;
  if (a2 === undefined && b2 !== undefined) return 1;
  if (a.H !== undefined && b.H !== undefined && a.H !== b.H) return b.H - a.H;
  if (a.D2 !== undefined && b.D2 !== undefined && a.D2 !== b.D2) return a.D2 - b.D2;
  if (a.score !== b.score) return b.score - a.score;
  return a.roomName.localeCompare(b.roomName);
}

function pass2IsPublished(memory: FirstRoomMemory): boolean {
  return Boolean(memory.pass2?.complete && memory.ranked.some(entry => entry.eligible && typeof entry.score2 === "number"));
}

/**
 * Published ranking for Memory / map labels / console.
 * After pass-2 finishes this is score2 order (real spawn + real paths).
 */
export function publishedFirstRoomRanks(
  memory: FirstRoomMemory,
  limit = FIRST_ROOM_MAP_TOP_N
): FirstRoomRankEntry[] {
  const eligible = (memory.ranked ?? []).filter(entry => entry.eligible);
  const ordered = pass2IsPublished(memory) ? eligible.slice().sort(comparePublishedEntries) : eligible;
  return ordered.slice(0, limit);
}

export function formatFirstRoomLog(memory: FirstRoomMemory): string {
  const overlayNote =
    `Map overlays (Game.map.visual) only appear while this script is already running with no spawn; ` +
    `they cannot show on the official/sim room picker, and they stop once a spawn exists.`;

  if (pass2IsPublished(memory)) {
    const top = publishedFirstRoomRanks(memory, FIRST_ROOM_MAP_TOP_N);
    if (!top.length) {
      return (
        `[first-room] No eligible rooms after pass-2 (need a placeable spawn, ≥2 sources, uncontrolled). ` +
        `score2 = E2 / (D2 + 1); E2 = 10 * H for the first spawn only (add-on spawns later use a different weighting).`
      );
    }
    const lines = top.map((entry, index) => {
      const spawn = entry.spawnPos ? ` spawn=(${entry.spawnPos.x},${entry.spawnPos.y})` : "";
      const seats = (entry.harvestSeats ?? []).map(seat => seat.seats).join("+");
      const seatLabel = seats ? ` seats=${seats}` : "";
      return (
        `  ${index + 1}. ${entry.roomName} score2=${(entry.score2 ?? 0).toFixed(4)} ` +
        `E2=${entry.E2} D2=${entry.D2} H=${entry.H}${seatLabel}${spawn}`
      );
    });
    return (
      `[first-room] Best room ${memory.bestRoom} (pass-2; higher score2 is better). ` +
      `Formula: score2 = E2 / (D2 + 1) with E2 = 10 * H for the first spawn only ` +
      `(add-on spawns later use a different weighting). ` +
      `H = open harvest seats around energy sources (early multi-miner proxy; not raw source count). ` +
      `D2 = walk cost from a placeable spawn to each source (adjacent tile) + controller; swamp=plain ` +
      `because roads make swamp negligible soon after start. See Memory.firstRoom. ${overlayNote}\n` +
      lines.join("\n")
    );
  }

  const top = memory.ranked.filter(entry => entry.eligible).slice(0, FIRST_ROOM_TOP_N);
  if (!top.length) {
    return (
      `[first-room] No eligible rooms yet (${memory.candidates.length} candidates, ` +
      `${Object.keys(memory.intel).length} with intel). Need an uncontrolled room with ≥2 sources. ` +
      `score = E / (D + 1); E = sources * 10, D = walk cost from sources+controller midpoint.`
    );
  }
  const lines = top.map((entry, index) => {
    const cheby = entry.usedChebyshev ? " chebyshev-fallback" : "";
    const mid = entry.midpoint ? ` mid=(${entry.midpoint.x},${entry.midpoint.y})` : "";
    return (
      `  ${index + 1}. ${entry.roomName} score=${entry.score.toFixed(4)} ` +
      `E=${entry.energyPerTick} D=${entry.walkCost} sources=${entry.sourceCount}${mid}${cheby}`
    );
  });
  return (
    `[first-room] Best room ${memory.bestRoom} (higher score is better). ` +
    `Formula: score = E / (D + 1) with E = numSources * (SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME), ` +
    `D = walk cost from midpoint(sources+controller). Minerals are not in D. See Memory.firstRoom. ` +
    `${overlayNote}\n` +
    lines.join("\n")
  );
}

function firstRoomFlagName(): string {
  return FIRST_ROOM_FLAG;
}

function ensureRecommendationFlag(room: Room, pos: TilePos): void {
  const name = firstRoomFlagName();
  const existing = Game.flags?.[name];
  const color = typeof COLOR_CYAN === "undefined" ? 4 : COLOR_CYAN;
  if (existing) {
    if (existing.pos.x !== pos.x || existing.pos.y !== pos.y || existing.pos.roomName !== room.name) {
      existing.setPosition(new RoomPosition(pos.x, pos.y, room.name));
    }
    return;
  }
  room.createFlag(pos.x, pos.y, name, color, color);
}

function removeRecommendationFlag(): void {
  const flag = Game.flags?.[firstRoomFlagName()];
  if (flag) flag.remove();
}

function recommendationFlagPos(room: Room, entry: FirstRoomRankEntry): TilePos {
  return entry.spawnPos ?? entry.midpoint ?? { x: room.controller?.pos.x ?? 25, y: room.controller?.pos.y ?? 3 };
}

function rankingReadyToLog(memory: FirstRoomMemory): boolean {
  if (!memory.complete) return false;
  if (!memory.pass2) return true;
  return Boolean(memory.pass2.complete);
}

function logOnce(memory: FirstRoomMemory): void {
  if (memory.logged || !rankingReadyToLog(memory)) return;
  memory.logged = true;
  if (memory.pass2) memory.pass2.logged = true;
  console.log(formatFirstRoomLog(memory));
}

export function settleFirstRoomSelection(): void {
  const memory = firstRoomMemory();
  if (memory) {
    memory.settled = true;
    memory.pending = [];
    if (memory.pass2) memory.pass2.pending = [];
  }
  removeRecommendationFlag();
}

function emptyMemory(region: RoomRegion, candidates: string[], worldKey: string, time: number): FirstRoomMemory {
  return {
    ranked: [],
    candidates,
    pending: [],
    intel: {},
    region,
    worldKey,
    computedAt: time,
    complete: false
  };
}

function compareEntries(a: FirstRoomRankEntry, b: FirstRoomRankEntry): number {
  if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
  if (a.score !== b.score) return b.score - a.score;
  if (a.sourceCount !== b.sourceCount) return b.sourceCount - a.sourceCount;
  if (a.walkCost !== b.walkCost) return a.walkCost - b.walkCost;
  return a.roomName.localeCompare(b.roomName);
}

function emptyPass2(topN: number, shortlist: string[]): FirstRoomPass2Memory {
  return {
    ranked: [],
    pending: shortlist.slice(),
    complete: shortlist.length === 0,
    logged: false,
    topN,
    shortlistKey: shortlist.join(",")
  };
}

function mergePass2OntoRanked(memory: FirstRoomMemory): void {
  if (!memory.pass2) return;
  const byName = new Map(memory.pass2.ranked.map(entry => [entry.roomName, entry]));
  for (const entry of memory.ranked) {
    const pass2 = byName.get(entry.roomName);
    if (pass2) applyPass2ToRankEntry(entry, pass2);
  }
}

function seedPreferredSpawn(memory: FirstRoomMemory): void {
  const pass2 = memory.pass2;
  if (!pass2?.complete || !memory.bestRoom) return;
  const room = Game.rooms?.[memory.bestRoom];
  if (!room) return;
  const entry = pass2.ranked.find(item => item.roomName === memory.bestRoom);
  if (!entry?.spawnPos) return;
  const previous = room.memory.spawnBootstrap;
  room.memory.spawnBootstrap = {
    x: entry.spawnPos.x,
    y: entry.spawnPos.y,
    cost: entry.D2,
    usedChebyshev: entry.usedChebyshev,
    logged: previous?.logged
  };
}

function pass2Shortlist(memory: FirstRoomMemory): { topN: number; rooms: string[] } {
  const eligible = memory.ranked.filter(entry => entry.eligible).map(entry => entry.roomName);
  const topN = configuredPass2TopN(memory.region);
  const rooms = topN === 0 ? eligible : eligible.slice(0, topN);
  return { topN, rooms };
}

/**
 * After pass-1 finishes, re-score shortlisted rooms from a placeable spawn
 * with swamp=plain. allOpen (private server) scores every eligible room.
 */
export function refreshPass2Ranking(memory: FirstRoomMemory): void {
  if (!memory.complete) {
    if (memory.pass2) memory.pass2.complete = false;
    return;
  }

  const { topN, rooms: shortlist } = pass2Shortlist(memory);
  const shortlistKey = shortlist.join(",");
  if (!memory.pass2 || memory.pass2.topN !== topN || memory.pass2.shortlistKey !== shortlistKey) {
    memory.pass2 = emptyPass2(topN, shortlist);
  }

  const pass2 = memory.pass2;
  const batch = pass2.pending.slice(0, pass2BatchSize(memory.region));
  pass2.pending = pass2.pending.slice(batch.length);

  if (batch.length) {
    const inputs = scoreableInputs(batch, memory.intel);
    const scoredByName = new Map(rankFirstRoomsPass2(inputs).map(ranked => [ranked.roomName, ranked]));
    const byName = new Map(pass2.ranked.map(entry => [entry.roomName, entry]));
    for (const roomName of batch) {
      const scored = scoredByName.get(roomName);
      if (scored) {
        byName.set(roomName, toPass2Entry(scored));
      } else {
        byName.set(roomName, {
          roomName,
          eligible: false,
          H: 0,
          E2: 0,
          D2: Number.POSITIVE_INFINITY,
          score2: 0,
          harvestSeats: [],
          usedChebyshev: false,
          reason: "no terrain"
        });
      }
    }
    pass2.ranked = Array.from(byName.values()).sort(comparePass2Entries);
  }

  pass2.complete = pass2.pending.length === 0;
  mergePass2OntoRanked(memory);
  if (pass2.complete) {
    memory.ranked = memory.ranked.slice().sort(comparePublishedEntries);
    const best = memory.ranked.find(entry => entry.eligible);
    pass2.bestRoom = best?.roomName;
    memory.bestRoom = best?.roomName;
    seedPreferredSpawn(memory);
  }
}

/**
 * Refresh ranking when there is no owned spawn. Safe to call every tick:
 * caches until TTL / worldKey change, scores a few rooms per tick.
 */
export function refreshFirstRoomRanking(time = Game.time): FirstRoomMemory {
  const previous = firstRoomMemory();
  const intel = { ...(previous?.intel ?? {}) };
  scanVisibleIntel(intel, time);

  const index = liveRoomIndex(intel);
  const region = configuredRegion(index);
  const candidates = listRoomsInRegion(region, index);
  const visible = visibleRoomNames();
  const worldKey = worldKeyForSelection(region, candidates, visible);

  let memory: FirstRoomMemory;
  const stale =
    !previous ||
    previous.worldKey !== worldKey ||
    time - previous.computedAt > FIRST_ROOM_TTL ||
    previous.region.type !== region.type;

  if (stale) {
    memory = emptyMemory(region, candidates, worldKey, time);
    memory.intel = intel;
  } else {
    memory = previous;
    memory.intel = intel;
    memory.candidates = candidates;
  }

  const pendingSet = new Set(
    memory.pending.filter(name => {
      const snapshot = intel[name];
      return Boolean(snapshot && isClaimableIntel(snapshot));
    })
  );
  for (const name of candidates) {
    const snapshot = intel[name];
    if (!snapshot || !isClaimableIntel(snapshot)) continue;
    if (!memory.ranked.some(entry => entry.roomName === name)) pendingSet.add(name);
  }
  const pending = Array.from(pendingSet);
  const batch = pending.slice(0, FIRST_ROOM_SCORED_PER_TICK);
  memory.pending = pending.slice(batch.length);

  if (batch.length) {
    const scored = rankFirstRooms(scoreableInputs(batch, intel));
    const byName = new Map(memory.ranked.map(entry => [entry.roomName, entry]));
    for (const ranked of scored) byName.set(ranked.roomName, toRankEntry(ranked));
    memory.ranked = Array.from(byName.values()).sort(compareEntries);
  }

  const eligible = memory.ranked.filter(entry => entry.eligible);
  memory.bestRoom = eligible[0]?.roomName;
  memory.complete = memory.pending.length === 0;
  if (stale) {
    memory.logged = false;
    memory.pass2 = undefined;
  }
  refreshPass2Ranking(memory);

  return setFirstRoomMemory(memory);
}

export function paintFirstRoomRecommendation(memory: FirstRoomMemory = firstRoomMemory()!): void {
  if (!memory || memory.settled) return;
  logOnce(memory);
  const overlayRanks = memory.pass2?.complete ? publishedFirstRoomRanks(memory, memory.ranked.length) : memory.ranked;
  if (overlayRanks.length) {
    paintTopFirstRoomsOnMap(overlayRanks);
    paintTopFirstRoomsInVisibleRooms(overlayRanks);
  }
  const best = memory.bestRoom;
  if (!best) {
    removeRecommendationFlag();
    return;
  }
  const room = Game.rooms?.[best];
  const entry = memory.ranked.find(item => item.roomName === best);
  if (room && entry) ensureRecommendationFlag(room, recommendationFlagPos(room, entry));
}

/**
 * Rank rooms and surface the pick when the player has no spawn yet.
 * Returns the recommended room name (if any) so spawn bootstrap can prefer it.
 *
 * If any owned spawn exists, ranking is settled and overlays are not painted.
 * Empty official/sim worlds never reach this loop before the first spawn.
 */
export function bootstrapFirstRoomSelection(): string | undefined {
  if (Object.keys(Game.spawns || {}).length > 0) {
    settleFirstRoomSelection();
    return undefined;
  }
  const memory = refreshFirstRoomRanking();
  paintFirstRoomRecommendation(memory);
  return memory.bestRoom;
}
