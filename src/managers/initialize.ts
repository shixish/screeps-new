import { ClaimFlag } from "flags/ClaimFlag";
import { bootstrapFirstSpawns } from "utils/spawnPlacement";
import { getRoomAudit } from "utils/tickCache";

export function initialize(){
  bootstrapFirstSpawns();

  if (Memory.initialized) return;

  // Home flags / room center assume a real spawn. Wait until the first one exists
  // (player click in sim/official, or a construction site completing on a private server).
  const spawn = Object.values(Game.spawns)[0] as StructureSpawn | undefined;
  if (!spawn) return;

  const roomAudit = getRoomAudit(spawn.room);
  if (roomAudit){
    ClaimFlag.initializeNewHomeRoom(roomAudit);
    Memory.initialized = true;
  }
}
