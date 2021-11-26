import { BasicCreep } from "./BasicCreep";

export class CourierCreep extends BasicCreep {
  static role:CreepRoleName = 'courier';
  static config:CreepRole = {
    max: (roomAudit)=>{
      //We only need couriers if we have miners available, otherwise the resources should go to basic creeps that can do both
      return Math.min(roomAudit.creepCountsByRole.miner, roomAudit.sourceCount*2);
    },
    tiers: [
      {
        cost: 250,
        body: [
          CARRY, MOVE,
          CARRY, MOVE,
          MOVE
        ]
      },
      // {
      //   cost: 400,
      //   body: [
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     MOVE, MOVE
      //   ]
      // },
      // {
      //   cost: 550,
      //   body: [
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY, MOVE,
      //     CARRY
      //   ]
      // },
    ]
  }

  work(){
    // if (this.rememberAction(this.startMining, 'mining')) return;
  }
}
