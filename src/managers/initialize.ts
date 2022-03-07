import { ClaimFlag } from "flags/ClaimFlag";
import { getRoomAudit } from "utils/tickCache";

export function initialize(){
  if (Memory.initialized) return;
  const firstRoomName = Object.keys(Game.rooms)[0];
  const roomAudit = getRoomAudit(Game.rooms[firstRoomName]);
  if (roomAudit){
    ClaimFlag.initializeHomeRoom(roomAudit);
    Memory.initialized = true;
  }
}
