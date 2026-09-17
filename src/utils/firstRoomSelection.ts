/*
  First-room selection: rank candidate rooms before the player has a spawn.

  Runs from initialize() when Game.spawns is empty. Results are cached in
  Memory.firstRoom until the visible/known world changes or the TTL expires.
  Logs the recommendation once (no spam) and marks the best visible room with
  a flag + RoomVisual. Spawn placement still uses the existing in-room
  bootstrap once the player is in (or can act on) that room.
*/

import { RankedFirstRoom, SOURCE_PAIR_WEIGHT, rankFirstRooms } from "./firstRoomScore";
import { RoomIndex, RoomRegion, defaultFirstRoomRegion, listRoomsInRegion } from "./roomNames";
import { TilePos } from "./spawnPlacement";

export const FIRST_ROOM_TTL = 1000;
export const FIRST_ROOM_SCORED_PER_TICK = 4;
export const FIRST_ROOM_TOP_N = 10;
export const FIRST_ROOM_FLAG = "first-room";

export interface StoredRoomIntel {
  sources: TilePos[];
  controller?: TilePos;
  owner?: string | null;
  my?: boolean;
  reserved?: boolean;
  scannedAt: number;
}

export interface FirstRoomRankEntry {
  roomName: string;
  eligible: boolean;
  rankCost: number;
  sourceCount: number;
  sourcePairCost: number;
  controllerCost: number;
  usedChebyshev: boolean;
  rendezvous?: TilePos;
  reason?: string;
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
}

declare global {
  interface Memory {
    firstRoom?: FirstRoomMemory;
    firstRoomRegion?: RoomRegion;
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
  return {
    sources: sources.map(source => ({ x: source.pos.x, y: source.pos.y })),
    controller: { x: controller.pos.x, y: controller.pos.y },
    owner: controller.owner?.username ?? null,
    my: Boolean(controller.my),
    reserved: Boolean(controller.reservation),
    scannedAt: time
  };
}

function isClaimableIntel(intel: StoredRoomIntel): boolean {
  if (intel.my) return true;
  if (intel.owner) return false;
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
): { roomName: string; sources: TilePos[]; controller?: TilePos; getTerrain: (x: number, y: number) => number }[] {
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
      getTerrain
    });
  }
  return inputs;
}

export function toRankEntry(ranked: RankedFirstRoom): FirstRoomRankEntry {
  const entry: FirstRoomRankEntry = {
    roomName: ranked.roomName,
    eligible: ranked.eligible,
    rankCost: ranked.rankCost,
    sourceCount: ranked.sourceCount,
    sourcePairCost: ranked.sourcePairCost,
    controllerCost: ranked.controllerCost,
    usedChebyshev: ranked.usedChebyshev
  };
  if (ranked.rendezvous) entry.rendezvous = ranked.rendezvous;
  if (ranked.reason) entry.reason = ranked.reason;
  return entry;
}

export function formatFirstRoomLog(memory: FirstRoomMemory): string {
  const top = memory.ranked.filter(entry => entry.eligible).slice(0, FIRST_ROOM_TOP_N);
  if (!top.length) {
    return (
      `[first-room] No eligible rooms yet (${memory.candidates.length} candidates, ` +
      `${Object.keys(memory.intel).length} with intel). Need a visible unowned controller and ≥2 sources. ` +
      `rankCost = sourcePairWalk * ${SOURCE_PAIR_WEIGHT} + controllerWalk (lower is better).`
    );
  }
  const lines = top.map((entry, index) => {
    const cheby = entry.usedChebyshev ? " chebyshev-fallback" : "";
    return (
      `  ${index + 1}. ${entry.roomName} rankCost=${entry.rankCost} ` +
      `sources=${entry.sourceCount} pair=${entry.sourcePairCost} controller=${entry.controllerCost}${cheby}`
    );
  });
  return (
    `[first-room] Best room ${memory.bestRoom} (lower rankCost is better). ` +
    `Formula: rankCost = closestSourcePairWalk * ${SOURCE_PAIR_WEIGHT} + rendezvous→controllerWalk. ` +
    `See Memory.firstRoom.\n${lines.join("\n")}`
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

function paintRecommendation(room: Room, entry: FirstRoomRankEntry): void {
  const pos = entry.rendezvous ?? room.controller?.pos ?? { x: 25, y: 3 };
  room.visual.rect(pos.x - 0.5, pos.y - 0.5, 1, 1, {
    fill: "transparent",
    stroke: "#33ffff",
    strokeWidth: 0.12,
    opacity: 0.9
  });
  room.visual.text(`BEST ROOM ${entry.rankCost}`, pos.x, pos.y - 0.7, {
    font: 0.45,
    color: "#33ffff",
    stroke: "#000000",
    strokeWidth: 0.12
  });
  ensureRecommendationFlag(room, { x: pos.x, y: pos.y });
}

function paintMapMarker(roomName: string): void {
  const visual = Game.map?.visual;
  if (!visual) return;
  try {
    const origin = new RoomPosition(0, 0, roomName);
    const label = new RoomPosition(25, 25, roomName);
    visual.rect(origin, 50, 50, { fill: "#00ffff", opacity: 0.12, stroke: "#00ffff" });
    visual.text(`BEST ${roomName}`, label, { color: "#00ffff", fontSize: 6 });
  } catch {
    // Room names like "sim" still work; ignore map-visual failures.
  }
}

function logOnce(memory: FirstRoomMemory): void {
  if (memory.logged || !memory.complete) return;
  memory.logged = true;
  console.log(formatFirstRoomLog(memory));
}

export function settleFirstRoomSelection(): void {
  const memory = firstRoomMemory();
  if (memory) {
    memory.settled = true;
    memory.pending = [];
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

  const pendingSet = new Set(memory.pending.filter(name => {
    const snapshot = intel[name];
    return Boolean(snapshot && isClaimableIntel(snapshot));
  }));
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
    memory.ranked = Array.from(byName.values()).sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      if (a.rankCost !== b.rankCost) return a.rankCost - b.rankCost;
      if (a.sourceCount !== b.sourceCount) return b.sourceCount - a.sourceCount;
      return a.roomName.localeCompare(b.roomName);
    });
  }

  const eligible = memory.ranked.filter(entry => entry.eligible);
  memory.bestRoom = eligible[0]?.roomName;
  memory.complete = memory.pending.length === 0;
  if (stale) memory.logged = false;

  return setFirstRoomMemory(memory);
}

export function paintFirstRoomRecommendation(memory: FirstRoomMemory = firstRoomMemory()!): void {
  if (!memory || memory.settled) return;
  logOnce(memory);
  const best = memory.bestRoom;
  if (!best) {
    removeRecommendationFlag();
    return;
  }
  paintMapMarker(best);
  const room = Game.rooms?.[best];
  const entry = memory.ranked.find(item => item.roomName === best);
  if (room && entry) paintRecommendation(room, entry);
}

/**
 * Rank rooms and surface the pick when the player has no spawn yet.
 * Returns the recommended room name (if any) so spawn bootstrap can prefer it.
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
