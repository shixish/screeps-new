/*
  World-map overlay for first-room ranking.

  Draws only the top 5 eligible rooms via Game.map.visual (CPU-light: a rect
  and a short label per room). Call from the first-room bootstrap loop; do not
  console.log here — the one-shot ranking log already lives in selection.
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

function resolveMapVisual(visual?: MapVisualLike): MapVisualLike | undefined {
  if (visual) return visual;
  const map = typeof Game !== "undefined" ? Game.map : undefined;
  return map?.visual as MapVisualLike | undefined;
}

function paintMarker(visual: MapVisualLike, marker: FirstRoomMapMarker): boolean {
  try {
    const origin = new RoomPosition(0, 0, marker.roomName);
    const labelPos = new RoomPosition(25, 22, marker.roomName);
    visual.rect?.(origin, 50, 50, {
      fill: marker.color,
      stroke: marker.color,
      strokeWidth: marker.strokeWidth,
      opacity: marker.fillOpacity
    });
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

/**
 * Draw rank `#1`…`#5` plus a short score on the world map.
 * Returns how many rooms were painted (0 when map visuals are unavailable).
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
