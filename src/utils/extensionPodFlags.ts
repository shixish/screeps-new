import { ExtensionPodMemory, ExtensionPodPlanMemory, getExtensionPodPlan, getNextExtensionPod, refreshExtensionPodPlan } from "./extensionPods";

/*
  Extension pod flags.

  drawExtensionPodPlan paints the pod plan with RoomVisual, which is only visible while the room is open
  in the client. These flags are the durable version of the same information - one real Flag per planned
  pod, sitting on the pod centre, visible on the world map, surviving a reload - and they double as the
  build order: flag colour says which pod is next.

  Unlike the exit trails these are not sparse: the cap is EXTENSION_POD_MAX, so a room is at most 12
  flags however big the plan gets.

  The `build` prefix is a real FlagType, so each of these gets a BuildFlag manager. That is intentional -
  it matches how these get named by hand - and harmless: BuildFlag only audits, it doesn't place
  anything. The `-pod${order}` suffix is what keeps manually placed `build:extension:${random()}` flags
  out of the orphan sweep.
*/

//Flag names are `build:extension:${roomName}-pod${order}`, e.g. `build:extension:W1N4-pod0`. Flag names
//are global across the world, so the room name is mandatory - two rooms would otherwise fight over pod0.
export const EXTENSION_POD_FLAG_PREFIX = 'build:extension:';

export const extensionPodFlagName = (roomName:string, order:number)=>(
  `${EXTENSION_POD_FLAG_PREFIX}${roomName}-pod${order}`
);

/*
  Every pod flag this room owns, and nothing else. A hand placed `build:extension:7f3a` never matches,
  and neither does another room's `build:extension:W2N4-pod0`, so the orphan sweep can only ever remove
  flags this planner created.
*/
export const isExtensionPodFlagName = (roomName:string, name:string)=>(
  name.startsWith(`${EXTENSION_POD_FLAG_PREFIX}${roomName}-pod`)
);

export enum ExtensionPodFlagState{
  Planned, //In the plan, nothing placed yet.
  Next, //The pod the next STRUCTURE_EXTENSION pop will build, or the one currently going up.
  Built, //Every extension tile has a structure or a site.
}

/*
  Colours, read lazily because the COLOR_* globals only exist inside the game runtime:
    planned / not started  -> COLOR_WHITE  primary, COLOR_BLUE secondary
    next to build / in progress -> COLOR_ORANGE primary, COLOR_BLUE secondary
    built                  -> COLOR_GREEN  primary, COLOR_BLUE secondary
  The secondary stays COLOR_BLUE across all three so the whole family reads as one layer on the map and
  only the primary carries the state.
*/
export const EXTENSION_POD_FLAG_SECONDARY_COLOR = ():ColorConstant=>COLOR_BLUE;

export const getExtensionPodFlagColor = (state:ExtensionPodFlagState):ColorConstant=>{
  switch (state){
    case ExtensionPodFlagState.Built: return COLOR_GREEN;
    case ExtensionPodFlagState.Next: return COLOR_ORANGE;
    default: return COLOR_WHITE;
  }
};

export const getExtensionPodFlagState = (pod:ExtensionPodMemory, nextOrder?:number):ExtensionPodFlagState=>{
  if (pod.built) return ExtensionPodFlagState.Built;
  return pod.order === nextOrder ? ExtensionPodFlagState.Next : ExtensionPodFlagState.Planned;
};

export interface DesiredExtensionPodFlag{
  name: string;
  x: number;
  y: number;
  order: number;
  state: ExtensionPodFlagState;
  color: ColorConstant;
  secondaryColor: ColorConstant;
}

/* The full set of flags the current plan wants - one per pod, on the pod centre. */
export function getDesiredExtensionPodFlags(roomName:string, plan:ExtensionPodPlanMemory):DesiredExtensionPodFlag[]{
  const nextOrder = getNextExtensionPod(plan)?.order;
  return plan.pods.map(pod=>{
    const state = getExtensionPodFlagState(pod, nextOrder);
    return {
      name: extensionPodFlagName(roomName, pod.order),
      x: pod.x,
      y: pod.y,
      order: pod.order,
      state,
      color: getExtensionPodFlagColor(state),
      secondaryColor: EXTENSION_POD_FLAG_SECONDARY_COLOR(),
    };
  });
}

/*
  Pod flags for this room the plan no longer wants - a replan that shrank the plan, or a plan that was
  cleared entirely. Only names carrying this room's pod prefix are ever returned, so manual build flags
  and every other flag type are never removal candidates.
*/
export function findOrphanExtensionPodFlags(roomName:string, desiredNames:string[], existingNames:string[]):string[]{
  const desired = new Set(desiredNames);
  return existingNames.filter(name=>isExtensionPodFlagName(roomName, name) && !desired.has(name));
}

/*
  Reconciles the map against the plan: create what's missing, drag a flag whose centre moved under a
  replan, recolour one whose state changed, and remove what's orphaned. Throttled for the same two
  reasons the exit flags are - a created flag doesn't show up in Game.flags until the next tick, so
  running every tick would just retry the same creations, and the plan only changes on a replan.
*/
export const EXTENSION_POD_FLAG_SYNC_INTERVAL = 25;

export function syncExtensionPodFlags(room:Room, force = false){
  const plan = getExtensionPodPlan(room);
  if (!plan) return;
  //A replan moves every centre at once, so reconcile on the tick it happens instead of leaving up to a
  //whole interval of flags sitting on the abandoned lattice. plan.planned is the tick the planner ran,
  //and HomeFlag ensures the plan before it syncs, so this fires in the same tick as the replan.
  if (!force && plan.planned !== Game.time && Game.time % EXTENSION_POD_FLAG_SYNC_INTERVAL !== 0) return;
  refreshExtensionPodPlan(room, plan); //Colours are only useful if `built` is current.

  const standing = room.find(FIND_FLAGS).reduce((out, flag)=>{
    out[flag.name] = flag;
    return out;
  }, {} as Record<string, Flag>);

  const desired = getDesiredExtensionPodFlags(room.name, plan);
  let created = 0;
  desired.forEach(flag=>{
    const existing = standing[flag.name];
    if (!existing){
      //createFlag hands back the name on success, or an error code (ERR_NAME_EXISTS from a flag placed
      //this same tick, ERR_FULL at the 10k cap, ERR_INVALID_ARGS for a bad position). Markers aren't
      //worth failing a tick over, so a failure just means the flag gets another try next sync.
      const result = room.createFlag(flag.x, flag.y, flag.name, flag.color, flag.secondaryColor);
      if (typeof result === 'string') created++;
      return;
    }
    if (existing.pos.x !== flag.x || existing.pos.y !== flag.y) existing.setPosition(flag.x, flag.y);
    if (existing.color !== flag.color || existing.secondaryColor !== flag.secondaryColor){
      existing.setColor(flag.color, flag.secondaryColor); //Same pod, new state - recolour rather than churn the flag.
    }
  });

  findOrphanExtensionPodFlags(room.name, desired.map(flag=>flag.name), Object.keys(standing)).forEach(name=>{
    standing[name].remove();
  });

  //Log the naming pattern once on first successful sync so the user knows what to look for.
  if (created > 0 && !room.memory.extensionPodFlagsLogged){
    room.memory.extensionPodFlagsLogged = true;
    console.log(`[${room.name}] extension pod flags synced: ${desired.length} pod flags. Pattern: build:extension:${room.name}-pod{order}`);
  }
}
