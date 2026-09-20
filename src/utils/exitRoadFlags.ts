import { EXIT_ROAD_SEGMENT_SIZE, ExitRoadRouteMemory, getExitRoadPlan, unpackRoadPosX, unpackRoadPosY } from "./earlyEconomy";

/*
  Exit road flags.

  drawExitRoadPlan paints the planned routes with RoomVisual, which is only visible while the room is
  open in the client - the plan is invisible on the world map and gone the moment the tab is closed.
  These flags are the durable version of the same information: a sparse trail of real Flag objects that
  shows up on the map, survives a reload, and can be clicked to read the route back.

  Sparse on purpose. A route is up to ~50 tiles and a room has up to four of them, so one flag per tile
  would be hundreds of flags per room against a global 10k cap, for something that is purely a marker.
  Instead one flag is dropped every EXIT_FLAG_SPACING tiles plus one on the route's final tile, which
  lands at ~4-11 flags per route.

  Nothing here builds anything - these are markers only, and the exit roads are still only promoted
  segment by segment through promoteExitRoadSegment. 'exit' is deliberately not a FlagType either:
  initFlagManager returns undefined for unknown prefixes, so these flags carry no manager and cost no
  CPU beyond this sync.
*/

//Flag names are `exit:${roomName}:${dir}:${index}`. Flag names are global across the world, so the room
//name is mandatory - two rooms both planning a north route would otherwise fight over the same name.
export const EXIT_FLAG_PREFIX = 'exit:';

//Tiles between waypoints. Matches the promotable segment size, so every flag is a segment boundary.
export const EXIT_FLAG_SPACING = EXIT_ROAD_SEGMENT_SIZE;

//Hard cap per route. A longer route widens its spacing instead of dropping more flags on the map.
export const EXIT_FLAG_MAX_WAYPOINTS = 12;

//Compass labels, matching the TOP/RIGHT/BOTTOM/LEFT exit constants. Short because the name is already long.
export const EXIT_FLAG_DIRECTION_LABELS:Record<number, string> = { 1: 'N', 3: 'E', 5: 'S', 7: 'W' };

export const getExitFlagDirectionLabel = (exit:ExitConstant)=>EXIT_FLAG_DIRECTION_LABELS[exit] ?? `X${exit}`;

export interface ExitFlagWaypoint{
  x: number;
  y: number;
  index: number; //Waypoint ordinal along the route, 0 nearest the spawn.
  last: boolean; //The route's final tile, i.e. the tile against the room edge.
}

export interface DesiredExitFlag extends ExitFlagWaypoint{
  name: string;
  color: ColorConstant;
  secondaryColor: ColorConstant;
}

export const exitFlagName = (roomName:string, exit:ExitConstant, index:number)=>(
  `${EXIT_FLAG_PREFIX}${roomName}:${getExitFlagDirectionLabel(exit)}:${index}`
);

/* Every exit-plan flag this room owns, and nothing else - home/harvest/upgrade flags never match. */
export const isExitFlagName = (roomName:string, name:string)=>name.startsWith(`${EXIT_FLAG_PREFIX}${roomName}:`);

/*
  Colour per exit direction, so a glance at the map says which way a trail runs:
    N (TOP)    -> COLOR_CYAN
    E (RIGHT)  -> COLOR_GREEN
    S (BOTTOM) -> COLOR_YELLOW
    W (LEFT)   -> COLOR_PURPLE
  Read lazily rather than as a module constant: the COLOR_* globals only exist inside the game runtime.
*/
export const getExitFlagColor = (exit:ExitConstant):ColorConstant=>{
  switch (exit){
    case FIND_EXIT_RIGHT: return COLOR_GREEN;
    case FIND_EXIT_BOTTOM: return COLOR_YELLOW;
    case FIND_EXIT_LEFT: return COLOR_PURPLE;
    default: return COLOR_CYAN; //FIND_EXIT_TOP, and anything unexpected.
  }
};

/*
  The secondary colour marks the terminus: intermediate waypoints get a white centre, the tile against
  the room edge gets a solid flag in the direction colour, so the end of each trail is obvious.
*/
export const getExitFlagSecondaryColor = (exit:ExitConstant, last:boolean):ColorConstant=>(
  last ? getExitFlagColor(exit) : COLOR_WHITE
);

/*
  Sparse waypoints along one route: every `spacing` tiles from the spawn end, plus the final tile.
  Start and end are always included. Routes longer than EXIT_FLAG_MAX_WAYPOINTS*spacing stretch their
  spacing instead of exceeding the cap.
*/
export function getExitFlagWaypoints(route:ExitRoadRouteMemory, spacing = EXIT_FLAG_SPACING):ExitFlagWaypoint[]{
  const path = route.path;
  if (!path.length) return [];
  const step = Math.max(spacing, Math.ceil(path.length/Math.max(EXIT_FLAG_MAX_WAYPOINTS-1, 1)));
  const tiles:number[] = [];
  for (let i = 0; i < path.length; i += step) tiles.push(i);
  const lastTile = path.length-1;
  if (tiles[tiles.length-1] !== lastTile) tiles.push(lastTile);
  return tiles.map((tile, index)=>({
    x: unpackRoadPosX(path[tile]),
    y: unpackRoadPosY(path[tile]),
    index,
    last: tile === lastTile,
  }));
}

/* The full set of flags the current plan wants, across every planned route. */
export function getDesiredExitFlags(roomName:string, routes:ExitRoadRouteMemory[]):DesiredExitFlag[]{
  return routes.reduce((out, route)=>{
    getExitFlagWaypoints(route).forEach(waypoint=>out.push({
      ...waypoint,
      name: exitFlagName(roomName, route.exit, waypoint.index),
      color: getExitFlagColor(route.exit),
      secondaryColor: getExitFlagSecondaryColor(route.exit, waypoint.last),
    }));
    return out;
  }, [] as DesiredExitFlag[]);
}

/*
  Exit-plan flags for this room that the plan no longer wants - a replan that shortened a route, or a
  direction that dropped out of the plan entirely. Only names carrying this room's exit prefix are ever
  returned, so a stray flag of any other type is never a removal candidate.
*/
export function findOrphanExitFlags(roomName:string, desiredNames:string[], existingNames:string[]):string[]{
  const desired = new Set(desiredNames);
  return existingNames.filter(name=>isExitFlagName(roomName, name) && !desired.has(name));
}

/*
  Reconciles the map against the plan: create what's missing, drag a flag whose waypoint moved under a
  replan, and remove what's orphaned. Throttled because a created flag doesn't appear in Game.flags
  until the next tick - running every tick would just retry the same creations - and because the plan
  only ever changes when the room is replanned.
*/
export const EXIT_FLAG_SYNC_INTERVAL = 25;

export function syncExitRoadFlags(room:Room, force = false){
  if (!force && Game.time % EXIT_FLAG_SYNC_INTERVAL !== 0) return;
  const plan = getExitRoadPlan(room);
  if (!plan) return;

  const standing = room.find(FIND_FLAGS).reduce((out, flag)=>{
    out[flag.name] = flag;
    return out;
  }, {} as Record<string, Flag>);

  const desired = getDesiredExitFlags(room.name, plan.routes);
  let created = 0;
  desired.forEach(flag=>{
    const existing = standing[flag.name];
    if (!existing){
      //createFlag hands back the name on success, or an error code (ERR_NAME_EXISTS from a flag placed
      //this same tick, ERR_FULL at the 10k cap, ERR_INVALID_ARGS for a bad position). Markers aren't
      //worth failing a tick over, so a failure just means the flag gets another try next sync.
      const result = room.createFlag(flag.x, flag.y, flag.name, flag.color, flag.secondaryColor);
      if (typeof result === 'string') created++;
    }else if (existing.pos.x !== flag.x || existing.pos.y !== flag.y){
      existing.setPosition(flag.x, flag.y); //Same waypoint, new route - move it rather than churn the flag.
    }
  });

  findOrphanExitFlags(room.name, desired.map(flag=>flag.name), Object.keys(standing)).forEach(name=>{
    standing[name].remove();
  });

  //Log the naming pattern once on first successful sync so the user knows what to look for.
  if (created > 0 && !room.memory.exitRoadFlagsLogged){
    room.memory.exitRoadFlagsLogged = true;
    const directions = plan.routes.map(r=>getExitFlagDirectionLabel(r.exit)).join(', ');
    console.log(`[${room.name}] exit road flags synced: ${desired.length} flags across ${plan.routes.length} routes (${directions}). Pattern: exit:${room.name}:{N|E|S|W}:{index}`);
  }
}
