import { BasicCreep } from "./BasicCreep";

export class CourierCreep extends BasicCreep {
  static role:CreepRoleName = 'courier';
  static config:CreepRole = {
    authority: 1,
    max: (roomAudit: RoomAudit)=>{
      //We only need couriers if we have miners available, otherwise the resources should go to basic creeps that can do both
      return Math.min(roomAudit.creepCountsByRole.miner*2, roomAudit.sources.length*2);
    },
    tiers: [
      {
        cost: 300,
        body: [
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
        ],
      },
      {
        cost: 400,
        body: [
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
        ],
      },
      {
        cost: 550,
        body: [
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY,
        ],
      },
      // {
      //   cost: 1200,
      //   body: [
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //   ],
      //   max: (roomAudit)=>{
      //     return roomAudit.sources.length;
      //   },
      // },
    ]
  }

  // work(){
  //   // if (this.rememberAction(this.startMining, 'mining')) return;

  // }
}
