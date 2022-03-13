import { BasicCreep, CreepBody } from "./BasicCreep";

export class MeleeCreep extends BasicCreep {
  static config:CreepRole = {
    authority: 0,
    tiers: [
      {
        body: new CreepBody([
          MOVE, ATTACK,
        ], 50+80),
        // max: (roomAudit: RoomAudit)=>{
        //   return roomAudit.hostileCreeps.length;
        // },
      },
      {
        body: new CreepBody([
          MOVE, ATTACK,
          MOVE, ATTACK,
        ], 50+80),
        // max: (roomAudit: RoomAudit)=>{
        //   return roomAudit.hostileCreeps.length;
        // },
      },
    ],
  }

  startAttacking(){
    const target = this.pos.findClosestByRange(FIND_HOSTILE_CREEPS) || this.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES);
    if (!target) return null;
    if (this.moveWithinRange(target.pos, 1) || this.manageActionCode(this.attack(target))){
      return target;
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
    if (this.flag && this.room.name !== this.flag.roomName){
      this.moveTo(this.flag.pos);
      return;
    }
    if (this.startAttacking()) return;

    this.idle();
  }
}
