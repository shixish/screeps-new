import { getBestContainerLocation, getBestLocations, getTerrainCostMatrix } from "utils/map";
import { random } from "utils/random";
import { getRoomAudit } from "utils/tickCache";
import { FlagManager } from "./BasicFlag";

enum ClaimStatus{
  Claim,
  Spawn,
}

export class ClaimFlag extends FlagManager {
  get status(){
    return this.memory.status as ClaimStatus ?? ClaimStatus.Claim;
  }

  set status(status:ClaimStatus){
    this.memory.status = status;
  }

  /* Flag name should be in the form: `claim:${roomName}` where roomName is the name of the parent room. */
  work() {
    const home = this.memory.room && Game.rooms[this.memory.room] || this.suffix && Game.rooms[this.suffix];
    if (!home) throw `Claim flag [${this.flag.name}] error: home isn't defined.`;
    const office = this.flag.room;

    // Note: this.flag.pos.findClosestByRange seems to only work with rooms that have vision...
    // || this.flag.pos.findClosestByRange(FIND_MY_SPAWNS, {
    //   filter: spawn=>{
    //     //Claim body part costs 600 energy
    //     return spawn.room.energyAvailable >= 800;
    //   }
    // })?.room;
    this.memory.room = home.name;
    switch(this.status){
      case ClaimStatus.Claim:
        if (office?.controller?.my && office.controller.level > 2){
          const matrix = getTerrainCostMatrix(this.room);
          const central = getBestLocations(this.room, matrix);
          this.flag.setPosition(central);
          this.room.createConstructionSite(central, STRUCTURE_SPAWN);
          this.status = ClaimStatus.Spawn;
        }else{
          const roomAudit = getRoomAudit(home);
          roomAudit.flags[this.type].push(this);
        }
        break;
      case ClaimStatus.Spawn:
        const spawns = office?.find(FIND_MY_SPAWNS);
        if (spawns?.length){
          //Construction logic is now being handled by the room audit
          this.remove();
        }else{
          const roomAudit = getRoomAudit(home);
          roomAudit.flags[this.type].push(this);
        }
        break;
    }
  }
}
