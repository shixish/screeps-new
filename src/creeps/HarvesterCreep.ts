import { getRoomAudit } from "utils/tickCache";
import { followCourierTug } from "utils/seatTug";
import { BasicCreep, CreepBody } from "./BasicCreep";

export class HarvesterCreep extends BasicCreep {
  static config:CreepRole = {
    authority: 2,
    tiers: [
      /*
        Domestic static miners: zero CARRY (everything drops into the container underfoot) and as much
        WORK as the room's energy capacity buys. 0 MOVE is the preferred shape - the courier tug
        (utils/seatTug) drags the miner onto its container seat - so every point of energy goes into
        WORK. Each tier has a 1 MOVE self-walk sibling 50 energy up for when no courier is free to tug.
        At the CL1 cap of 300 the max-WORK body is [WORK, WORK, WORK].
      */
      {
        body: new CreepBody([WORK, WORK], 200),
      },
      {
        body: new CreepBody([WORK, WORK, MOVE], 250),
      },
      {
        body: new CreepBody([WORK, WORK, WORK], 300),
      },
      {
        body: new CreepBody([WORK, WORK, WORK, MOVE], 350),
      },
      {
        body: new CreepBody([WORK, WORK, WORK, WORK], 400),
      },
      {
        body: new CreepBody([WORK, WORK, WORK, WORK, MOVE], 450),
      },
      {
        body: new CreepBody([WORK, WORK, WORK, WORK, WORK], 500),
      },
      {
        body: new CreepBody([WORK, WORK, WORK, WORK, WORK, MOVE], 550),
      },
      //4000 energy sources (getOptimalWorkParts() === 7) are worth a bigger miner.
      {
        body: new CreepBody([WORK, WORK, WORK, WORK, WORK, WORK, WORK], 700),
      },
      {
        body: new CreepBody([WORK, WORK, WORK, WORK, WORK, WORK, WORK, MOVE], 750),
      },

      //Remote Harvesters:
      {
        body: new CreepBody([WORK, WORK, WORK, WORK, MOVE, MOVE], 500), //Optimal for 1500 energy is 3.5 mining parts so round up to capture as much as possible.
      },
      {
        body: new CreepBody([WORK, WORK, WORK, WORK, WORK, MOVE, MOVE], 600),
      }
    ],
    // getCreepAnchor: (roomAudit:RoomAudit)=>{
    //   const sourceAnchor = roomAudit.sources.reduce((out, source)=>{
    //     if (source.availableSeats > 0 && (!out || source.occupancy < out.occupancy)){
    //       out = source;
    //     }
    //     return out;
    //   }, undefined as CreepSourceAnchor|undefined);
    //   return sourceAnchor;
    // },
    // modSpawnOptions: (roomAudit, options, spawner)=>{
    //   const miners = spawner.room.find(FIND_MY_CREEPS, {
    //     filter: (creep:Creep)=>{
    //       creep.memory.role === 'miner';
    //     }
    //   });
    //   miners.map(miner=>miner.memory.anchor);
    //   const sources = spawner.room.find(FIND_SOURCES, {
    //     filter: (source:Source)=>{
    //       return Boolean(miners.find(miner=>miner.memory.anchor === source.id));
    //     }
    //   });
    //   // console.log(`sources`, sources);
    //   if (!sources.length) return;
    //   options.memory.anchor = sources[0].id;
    // },
  }

  work(){
    //Cooperate with an adjacent courier tug (intents apply same tick).
    if (followCourierTug(this)) return;

    const anchor = this.getAnchorObject();
    if (anchor){
      const roomAudit = getRoomAudit(this.room);
      const sourceAnchor = roomAudit.sources.find(source=>source.id === this.memory.anchor);
      if (this.moveWithinRange(anchor.pos, 1)){
        this.memory.seated = false; //This will disable resource spreading which will slow down these already slow creeps
        return;
      }
      /*
        Static mining: sit right on the source's container so everything harvested (this body has zero
        CARRY, so it all drops on the floor) lands in the container for the couriers to pick up. Seating
        is re-checked every tick so a miner that had to settle for a plain seat moves onto the container
        as soon as it gets built.
      */
      const containers = sourceAnchor?.containers ?? [];
      if (!containers.length){
        //If this source doesn't have any containers near it yet just have a seat anywhere
        this.memory.seated = true;
      }else{
        const seatContainer = containers.find(container=>{
          //If you're already over a container or there's a open container nearby
          return this.pos.isEqualTo(container.pos) || !container.pos.lookFor(LOOK_CREEPS).length;
        });
        //Another creep might be temporarily sitting on the desired container, or there might be multiple miners but only one box.
        if (seatContainer && !this.pos.isEqualTo(seatContainer.pos)){
          this.memory.seated = false;
          /*
            0 MOVE miners can't walk onto the seat - the courier tug (utils/seatTug) drags them on.
            Spending the tick on a move that can only come back ERR_NO_BODYPART also costs us the
            harvest, so keep mining from where we stand (the couriers pick the drops up) until a
            courier gets here.
          */
          if (this.memory.counts[MOVE]){
            this.moveTo(seatContainer);
            return;
          }
        }else{
          this.memory.seated = Boolean(seatContainer);
        }
      }
    }
    this.startHarvesting(anchor);
  }
}
