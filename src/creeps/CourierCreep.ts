import { BasicCreep } from "./BasicCreep";

export class CourierCreep extends BasicCreep {
  static role:CreepRoleName = 'courier';
  static config:CreepRole = {
    max: (roomAudit)=>roomAudit.sourceCount*2,
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
