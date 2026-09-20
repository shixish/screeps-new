/*
  Sticky pathing: plot a course and stay on it.

  moveTo repaths whenever its cached path expires, and a repath counts other creeps as walls. At a
  narrow choke point that makes a briefly occupied gap look impassable, so the creep swaps to the
  long way around, the gap clears, the next repath swaps back, and it ping-pongs without ever
  covering ground. The cure is to keep the cached path (a high reusePath) and only throw it away
  once the creep has genuinely failed to progress for a few ticks in a row.
*/

//Ticks of no progress toward the same destination before we allow a repath.
export const MOVE_STALL_LIMIT = 3;

//How long moveTo keeps a plotted course. Long enough that a blocked tile is waited out rather than
//routed around; the stall counter below is what ends a course that really is dead.
export const STICKY_REUSE_PATH = 20;

//Tracking lives on the creep so it survives between ticks. Kept structurally typed so the pure
//helpers below can be unit tested without a Screeps global.
export interface MoveProgressMemory {
  _moveDest?: string;
  _movePos?: string;
  _moveTick?: number;
  _moveStall?: number;
}

/* Identity of a course: a different target tile or range is a different course, not a stall. */
export function moveDestKey(pos:{ x:number, y:number, roomName:string }, range:number){
  return `${pos.roomName},${pos.x},${pos.y},${range}`;
}

export function movePosKey(pos:{ x:number, y:number, roomName:string }){
  return `${pos.roomName},${pos.x},${pos.y}`;
}

/*
  Sample progress for this tick and return how many consecutive ticks we've failed to make any.
  Progress is simply landing on a new tile; fatigue is not a stall (the creep is paying movement
  cost, not fighting for the tile), and a new destination starts the count over.
*/
export function trackMoveProgress(memory:MoveProgressMemory, dest:string, pos:string, tick:number, fatigued:boolean = false){
  //Roles can ask to move more than once in a tick. Sample once, then just report the same answer.
  if (memory._moveDest === dest && memory._moveTick === tick) return memory._moveStall || 0;
  //Only an unbroken run of ticks spent chasing this destination counts: a gap means the creep was
  //doing something else in between, so whatever it did back then says nothing about today's route.
  const consecutive = memory._moveDest === dest && memory._moveTick === tick - 1;
  const stall = consecutive && memory._movePos === pos && !fatigued ? (memory._moveStall || 0) + 1 : 0;
  memory._moveDest = dest;
  memory._movePos = pos;
  memory._moveTick = tick;
  memory._moveStall = stall;
  return stall;
}

/* Called when we spend the stall on a repath, so the new course gets its own full grace period. */
export function clearMoveStall(memory:MoveProgressMemory){
  memory._moveStall = 0;
}
