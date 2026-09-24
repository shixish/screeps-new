import { isBuildableCoord, packRoadPos, unpackRoadPosX, unpackRoadPosY } from "./earlyEconomy";

/*
  Fatigue heatmap ("desire lines"), observe-only.

  The planned road layers (priority roads, exit routes, pod rings, circulation lattice) all pave what a
  planner *thinks* the room needs. This layer measures what the room actually walks, and for now it only
  measures: it places nothing. The point is to put live numbers on the floor of W1N4 so a paving threshold
  can be picked from observed traffic instead of guessed at - the promotion path comes later, once the
  numbers on a real room say where the line is.

  Why fatigue and not a plain step counter: fatigue is already the game's own measure of "this step hurt".
  It is zero on roads, zero for a creep with spare MOVE, and it scales with terrain (swamp is 5x plain)
  and with how loaded the creep is - so a laden courier cutting a swamp corner scores heavily while the
  same courier running home empty over paved ground scores nothing. That is exactly the desire line worth
  paving, and it needs no pathing, no plan and no memory beyond the sparse counters below.
*/

//Packed positions are numbers, but Memory is JSON so object keys come back as strings either way.
export type FatigueHeatMap = Record<string, number>;
const fatigueHeatKey = (packed:number)=>String(packed);

/*
  Uniform fade, so the map shows current traffic rather than everything that ever happened.

  Subtract-a-fixed-amount, not a decay factor, deliberately: with a flat -15 every 25 ticks (0.6 heat per
  tick) the numbers on screen count down at a rate that can be read off the overlay, so a tile's value is
  directly comparable to "how much fatigue per tick does this tile charge the fleet". A multiplicative
  decay would instead park every tile at its own equilibrium and make the displayed number a function of
  the factor, which is exactly the thing that's hard to eyeball a threshold from.

  Consequences worth knowing while watching the room: one laden 1:1 courier crossing a swamp tile scores
  ~150 (50+40+30+20+10 as the fatigue timer is sampled down), so a one-off detour is fully gone in ~250
  ticks, while a lane crossed every ~50 ticks outruns the fade by a wide margin and climbs into the
  hundreds. Both are intended - the absolute value ranks lanes, and the fade guarantees that a route the
  fleet abandons returns to zero and its key leaves Memory entirely.
*/
export const FATIGUE_HEAT_COOL_INTERVAL = 25;
export const FATIGUE_HEAT_COOL_AMOUNT = 15;

export const getFatigueHeatMap = (room:Room)=>room.memory.fatigueHeat || (room.memory.fatigueHeat = {});

/*
  Charges a tile for one tick of fatigue and returns the tile's new total. Zero (or negative, which can't
  happen) is not a charge: a creep with spare MOVE for the terrain it's on tells us nothing about that
  tile, so it must not leave a key behind.
*/
export function addFatigueHeat(heat:FatigueHeatMap, x:number, y:number, fatigue:number){
  const key = fatigueHeatKey(packRoadPos(x, y));
  if (fatigue <= 0) return heat[key] ?? 0;
  return heat[key] = (heat[key] ?? 0) + fatigue;
}

/*
  Cools every tile by the same amount and drops the ones that hit zero. Uniform on purpose: the goal is
  that a room with no traffic fades back to an empty map (and then to no `fatigueHeat` key at all), so
  Memory never accumulates tiles nobody walks any more. Returns how many keys were dropped.
*/
export function coolFatigueHeatMap(heat:FatigueHeatMap, amount = FATIGUE_HEAT_COOL_AMOUNT){
  let dropped = 0;
  for (const key in heat){
    const value = heat[key] - amount;
    if (value <= 0){
      delete heat[key];
      dropped++;
    }else{
      heat[key] = value;
    }
  }
  return dropped;
}

/*
  One tick of sampling: every one of our creeps standing in this room that is currently paying fatigue
  charges the tile it's standing on.

  We add the live `creep.fatigue` timer every tick it's above zero rather than a flat +1 per step, because
  the timer is what actually stalls the creep. A step that generates 50 fatigue costs five ticks of
  standing still, and each of those ticks charges the tile again (50, 40, 30, 20, 10) - so the weight a
  tile accrues is roughly quadratic in how expensive the step was, and the tiles that cost the fleet the
  most standing-around time are the ones that stand out on the overlay. It also means a creep parked on a
  tile it can't afford to leave keeps charging that tile, which is the correct signal.

  Game.creeps only ever holds our own creeps, but the `my` check is kept so a hostile or an ally walking
  through can never teach us where the room wants roads. Returns how many creeps were sampled.
*/
export function sampleFatigueHeat(room:Room){
  const heat = getFatigueHeatMap(room);
  let sampled = 0;
  for (const name in Game.creeps){
    const creep = Game.creeps[name];
    if (!creep.my || creep.fatigue <= 0) continue;
    if (creep.room?.name !== room.name) continue;
    //The room rim can't hold a structure, so fatigue paid there could never turn into a road anyway -
    //same filter every other road layer applies, kept here so the overlay shows only pavable tiles.
    if (!isBuildableCoord(creep.pos.x, creep.pos.y)) continue;
    addFatigueHeat(heat, creep.pos.x, creep.pos.y, creep.fatigue);
    sampled++;
  }
  return sampled;
}

/*
  Throttled cool pass. Runs once every FATIGUE_HEAT_COOL_INTERVAL ticks; pass force to run it now (the
  tests do). Returns how many tiles were dropped.
*/
export function coolFatigueHeat(room:Room, force = false){
  if (!force && Game.time % FATIGUE_HEAT_COOL_INTERVAL !== 0) return 0;
  const heat = room.memory.fatigueHeat;
  if (!heat) return 0;
  const dropped = coolFatigueHeatMap(heat);
  //An empty map is still a serialised object in Memory for as long as the room exists - drop the key and
  //let the next sample remake it, so a quiet room really does end up back at empty.
  if (Object.keys(heat).length === 0) delete room.memory.fatigueHeat;
  return dropped;
}

/*
  Colour bands, so the shape of the traffic reads at a glance before any threshold exists: cool blue for
  noise a single crossing leaves behind, through yellow and orange, to red for the lanes that are costing
  the fleet real standing-around time. The boundaries are round numbers in "crossings of a swamp tile by a
  laden courier" (~150 each), not tuned values - they're there to group the overlay, not to decide
  anything.
*/
export const FATIGUE_HEAT_COLOR_BANDS:[number, string][] = [
  [150, '#99ccff'],
  [450, '#ffff99'],
  [900, '#ffaa55']
];
export const fatigueHeatColor = (value:number)=>FATIGUE_HEAT_COLOR_BANDS.find(([limit])=>value < limit)?.[1] ?? '#ff5555';

/*
  Draws the current heat on every hot tile. Only tiles with heat above zero get text - a cooled tile's key
  is already gone, so this doubles as a visible confirmation that the fade is emptying Memory. Values are
  rounded for display only (the stored number stays exact); the font is small enough that three digits fit
  inside one tile.
*/
export function drawFatigueHeat(room:Room){
  const heat = room.memory.fatigueHeat;
  if (!heat) return 0;
  let drawn = 0;
  for (const key in heat){
    const value = heat[key];
    if (value <= 0) continue;
    const packed = Number(key);
    room.visual.text(String(Math.round(value)), unpackRoadPosX(packed), unpackRoadPosY(packed), {
      font: 0.45,
      color: fatigueHeatColor(value),
      opacity: 0.85,
      backgroundColor: '#000000',
      backgroundPadding: 0.05
    });
    drawn++;
  }
  return drawn;
}

/*
  The whole layer, one call per tick from HomeFlag.work. Sample first so this tick's fatigue counts, then
  cool (self-throttled to one pass every FATIGUE_HEAT_COOL_INTERVAL ticks), then draw the numbers that
  remain. Nothing here places a construction site: this is observation only, and paving comes later once a
  threshold has been read off these visuals. Returns how many tiles were drawn.
*/
export function processFatigueHeat(room:Room){
  sampleFatigueHeat(room);
  coolFatigueHeat(room);
  return drawFatigueHeat(room);
}
