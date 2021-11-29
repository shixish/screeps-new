import { BasicCreep } from "./BasicCreep";

const genericMax = (roomAudit: RoomAudit)=>{
  //We only need couriers if we have miners available, otherwise the resources should go to basic creeps that can do both
  return Math.min(roomAudit.creepCountsByRole.miner*2, roomAudit.sourceCount*2);
};

export class CourierCreep extends BasicCreep {
  static role:CreepRoleName = 'courier';
  static config:CreepRole = {
    authority: 1,
    tiers: [
      {
        cost: 300,
        body: [
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
        ],
        max: genericMax,
      },
      {
        cost: 400,
        body: [
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
        ],
        max: genericMax,
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
        max: genericMax,
      },
      // {
      //   cost: 600,
      //   body: [
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //   ],
      //   max: genericMax,
      // },
    ]
  }

  // work(){
  //   // if (this.rememberAction(this.startMining, 'mining')) return;

  // }
}
