import { getRoomAudit } from "utils/tickCache";
import { BasicCreep, CreepBody } from "./BasicCreep";

export class MeleeCreep extends BasicCreep {
  static config:CreepRole = {
    authority: 0,
    tiers: [
      {
        body: new CreepBody([
          MOVE, ATTACK
        ], 50+80),
        max: (roomAudit: RoomAudit)=>{
          return roomAudit.hostileCreeps.length;
        },
      },
    ],
  }

  startAttacking(){
    const creep = this.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (!creep) return null;
    if (this.moveWithinRange(creep.pos, 1) || this.manageActionCode(this.attack(creep))){
      return creep;
    }
    return null;
  }

  idle(){
    const [ spawn ] = this.room.find(FIND_MY_SPAWNS);
    if (spawn){
      this.moveWithinRange(spawn.pos, 4);
    }
  }

  work(){
    // const roomAudit = getRoomAudit(this.room);
    if (this.startAttacking()) return;

    this.idle();
  }
}
