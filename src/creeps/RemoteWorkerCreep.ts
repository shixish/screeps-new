import { FlagType } from "utils/constants";
import { BasicCreep } from "./BasicCreep";

export class RemoteWorkerCreep extends BasicCreep {
  static config:CreepRole = {
    authority: 3,
    tiers: [
      {
        cost: 1200,
        body: [
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
          WORK, MOVE, CARRY,
        ],
        max: (roomAudit)=>{
          for (let flagName in roomAudit.flags){
            const flagManager = roomAudit.flags[flagName];
            if (flagManager.type === FlagType.Claim && flagManager.suffix === roomAudit.name && flagManager.room.controller?.my){
              return Math.max(2-flagManager.followers.length, 0);
            }
          }
          return 0;
        }
      }
    ],
    getCreepAnchor: (roomAudit)=>{
      for (let flagName in roomAudit.flags){
        const flagManager = roomAudit.flags[flagName];
        if (flagManager.type === FlagType.Claim && flagManager.suffix === roomAudit.name){
          return flagManager;
        }
      }
      return;
    },
  }

  work(){
    if (this.spawning) return;
    const flag = this.getFlag();
    if (flag && flag.room.name !== this.room.name){
      this.moveTo(flag.pos);
      return;
    }
    super.work();
  }
}
