import { BasicCreep } from "./BasicCreep";

export class MoverCreep extends BasicCreep {
  static config:CreepRole = {
    authority: 0,
    tiers: [
      {
        cost: 50,
        body: [
          MOVE
        ],
        max: (roomAudit: RoomAudit)=>{
          return 0;
        },
      },
      // {
      //   cost: 300,
      //   body: [
      //     MOVE, MOVE,
      //     MOVE, MOVE,
      //     MOVE, MOVE,
      //   ],
      //   max: (roomAudit: RoomAudit)=>{
      //     return 0;
      //   },
      // }
    ],
    // getCreepAnchor: (roomAudit:RoomAudit)=>{
    //   return roomAudit.flags.audit.find(flagManager=>!flagManager.room);
    // },
  }

  work(){
    const flag = Game.flags.Outpost1;
    if (flag){
      // console.log(`flag`, JSON.stringify(flag, null, 2));
      if (flag.pos.roomName !== this.room.name){
        const direction = this.room.findExitTo(flag.pos.roomName);
        if (direction === ERR_NO_PATH) return console.log(`No path to flag found.`);
        if (direction === ERR_INVALID_ARGS) return console.log(`No path to flag found.`);
        const exit = this.pos.findClosestByRange(direction);
        if (exit) this.moveTo(exit);
      }else{
        this.moveTo(flag.pos);
      }
    }
  }
}
