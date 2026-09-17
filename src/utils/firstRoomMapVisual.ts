/*
  Overlays for first-room ranking (pre-spawn only).

  World map: Game.map.visual draws the top 5 eligible rooms (a rect and a
  short label per room). In-room: RoomVisual rank/score text when that room
  is already visible.

  These visuals only exist while the player script is running and there is
  still no owned spawn. Official/sim empty worlds do not run player code
  before the first spawn, so nothing can appear on the room-picker UI.
  After a spawn exists, selection settles and must not keep painting.

  Do not console.log here — the one-shot ranking log lives in selection.
*/

export const FIRST_ROOM_MAP_TOP_N = 5;

/** Rank 1 is gold; 2–5 stay distinct but quieter. */
export const FIRST_ROOM_MAP_RANK_COLORS = ["#ffd54a", "#7ecbff", "#9dff8a", "#d7a6ff", "#ffb07c"] as const;

export interface FirstRoomMapRank {
  roomName: string;
  eligible?: boolean;
  score?: number;
  /** Pass-2 score when present; preferred over pass-1 `score`. */
  score2?: number;
  /** Pass-2 spawn score when numeric. */
  spawn?: number;
  energyPerTick?: number;
  walkCost?: number;
  midpoint?: { x: number; y: number };
  spawnPos?: { x: number; y: number };
}

export interface FirstRoomMapMarker {
  roomName: string;
  rank: number;
  label: string;
  color: string;
  fillOpacity: number;
  fontSize: number;
  strokeWidth: number;
}

export interface MapVisualStyle {
  fill?: string;
  color?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  fontSize?: number;
  align?: string;
}

export interface MapVisualLike {
  rect?(pos: RoomPosition, width: number, height: number, style?: MapVisualStyle): unknown;
  text?(text: string, pos: RoomPosition, style?: MapVisualStyle): unknown;
}

export interface RoomVisualLike {
  rect?(x: number, y: number, width: number, height: number, style?: MapVisualStyle): unknown;
  text?(
    text: string,
    x: number,
    y: number,
    style?: {
      font?: number | string;
      color?: string;
      stroke?: string;
      strokeWidth?: number;
    }
  ): unknown;
}

export interface VisibleRoomLike {
  name: string;
  controller?: { pos: { x: number; y: number } };
  visual?: RoomVisualLike;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Prefer pass-2 (`score2`, then numeric `spawn`) when those fields exist;
 * otherwise use pass-1 `score`.
 */
export function bestAvailableScore(entry: FirstRoomMapRank): number | undefined {
  return finiteNumber(entry.score2) ?? finiteNumber(entry.spawn) ?? finiteNumber(entry.score);
}

export function formatShortScore(entry: FirstRoomMapRank): string {
  const score = bestAvailableScore(entry);
  if (score !== undefined) {
    const rounded = Math.round(score * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  }
  const energy = finiteNumber(entry.energyPerTick);
  const walk = finiteNumber(entry.walkCost);
  if (energy !== undefined && walk !== undefined) {
    return `${Math.round(energy)}/${Math.round(walk)}`;
  }
  return "";
}

export function formatRankLabel(rank: number, entry: FirstRoomMapRank): string {
  const short = formatShortScore(entry);
  return short ? `#${rank} ${short}` : `#${rank}`;
}

export function rankColor(rank: number): string {
  return FIRST_ROOM_MAP_RANK_COLORS[rank - 1] ?? FIRST_ROOM_MAP_RANK_COLORS[FIRST_ROOM_MAP_RANK_COLORS.length - 1];
}

export function topFirstRoomRanks(
  ranked: readonly FirstRoomMapRank[],
  limit = FIRST_ROOM_MAP_TOP_N
): FirstRoomMapRank[] {
  const top: FirstRoomMapRank[] = [];
  if (!ranked) return top;
  for (const entry of ranked) {
    if (top.length >= limit) break;
    if (!entry?.roomName) continue;
    if (entry.eligible === false) continue;
    top.push(entry);
  }
  return top;
}

export function firstRoomMapMarkers(
  ranked: readonly FirstRoomMapRank[],
  limit = FIRST_ROOM_MAP_TOP_N
): FirstRoomMapMarker[] {
  const top = topFirstRoomRanks(ranked, limit);
  return top.map((entry, index) => {
    const rank = index + 1;
    return {
      roomName: entry.roomName,
      rank,
      label: formatRankLabel(rank, entry),
      color: rankColor(rank),
      fillOpacity: rank === 1 ? 0.16 : 0.08,
      fontSize: rank === 1 ? 7 : 5,
      strokeWidth: rank === 1 ? 2 : 0.8
    };
  });
}

/**
 * MapVisual.rect uses `opacity`. Markers store that value as `fillOpacity`
 * (not `fillsOpacity`) so the interface name matches the field we read.
 */
export function mapMarkerRectStyle(marker: FirstRoomMapMarker): MapVisualStyle {
  return {
    fill: marker.color,
    stroke: marker.color,
    strokeWidth: marker.strokeWidth,
    opacity: marker.fillOpacity
  };
}

export function inRoomOverlayAnchor(
  room: VisibleRoomLike,
  entry?: Pick<FirstRoomMapRank, "midpoint" | "spawnPos">
): { x: number; y: number } {
  if (entry?.spawnPos) return { x: entry.spawnPos.x, y: entry.spawnPos.y };
  if (room.controller?.pos) return { x: room.controller.pos.x, y: room.controller.pos.y };
  if (entry?.midpoint) return { x: entry.midpoint.x, y: entry.midpoint.y };
  return { x: 25, y: 25 };
}

function resolveMapVisual(visual?: MapVisualLike): MapVisualLike | undefined {
  if (visual) return visual;
  const map = typeof Game !== "undefined" ? Game.map : undefined;
  return map?.visual as MapVisualLike | undefined;
}

function resolveVisibleRooms(rooms?: { [roomName: string]: VisibleRoomLike }): { [roomName: string]: VisibleRoomLike } | undefined {
  if (rooms) return rooms;
  return typeof Game !== "undefined" ? (Game.rooms as { [roomName: string]: VisibleRoomLike } | undefined) : undefined;
}

function paintMarker(visual: MapVisualLike, marker: FirstRoomMapMarker): boolean {
  try {
    const origin = new RoomPosition(0, 0, marker.roomName);
    const labelPos = new RoomPosition(25, 22, marker.roomName);
    visual.rect?.(origin, 50, 50, mapMarkerRectStyle(marker));
    visual.text?.(marker.label, labelPos, {
      color: marker.color,
      fontSize: marker.fontSize,
      align: "center",
      stroke: "#111111",
      strokeWidth: 0.4
    });
    return true;
  } catch {
    return false;
  }
}

function paintInRoomMarker(room: VisibleRoomLike, marker: FirstRoomMapMarker, entry?: FirstRoomMapRank): boolean {
  const visual = room.visual;
  if (!visual) return false;
  const pos = inRoomOverlayAnchor(room, entry);
  try {
    visual.rect?.(pos.x - 0.5, pos.y - 0.5, 1, 1, {
      fill: "transparent",
      stroke: marker.color,
      strokeWidth: 0.12,
      opacity: 0.9
    });
    visual.text?.(marker.label, pos.x, pos.y - 0.7, {
      font: 0.45,
      color: marker.color,
      stroke: "#000000",
      strokeWidth: 0.12
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Draw rank `#1`…`#5` plus a short score on the world map.
 * Returns how many rooms were painted (0 when map visuals are unavailable).
 * Call only while bootstrap is active (no owned spawn).
 */
export function paintTopFirstRoomsOnMap(
  ranked: readonly FirstRoomMapRank[] | undefined,
  visual?: MapVisualLike
): number {
  const mapVisual = resolveMapVisual(visual);
  if (!mapVisual || !ranked || !ranked.length) return 0;
  const markers = firstRoomMapMarkers(ranked);
  let painted = 0;
  for (const marker of markers) {
    if (paintMarker(mapVisual, marker)) painted += 1;
  }
  return painted;
}

/**
 * Draw rank `#1`…`#5` in any currently visible top room (RoomVisual).
 * Useful only while there is no owned spawn and the player already has
 * visibility into that room — rare on an empty official/sim world.
 */
export function paintTopFirstRoomsInVisibleRooms(
  ranked: readonly FirstRoomMapRank[] | undefined,
  rooms?: { [roomName: string]: VisibleRoomLike }
): number {
  const visible = resolveVisibleRooms(rooms);
  if (!visible || !ranked || !ranked.length) return 0;
  const byName = new Map(ranked.map(entry => [entry.roomName, entry]));
  const markers = firstRoomMapMarkers(ranked);
  let painted = 0;
  for (const marker of markers) {
    const room = visible[marker.roomName];
    if (!room) continue;
    if (paintInRoomMarker(room, marker, byName.get(marker.roomName))) painted += 1;
  }
  return painted;
}
