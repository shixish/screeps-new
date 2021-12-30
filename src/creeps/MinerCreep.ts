import { getRoomAudit } from "managers/room";
import { MINERALS_STORAGE_FILL } from "utils/constants";
import { CreepAnchor } from "utils/CreepAnchor";
import { BasicCreep } from "./BasicCreep";

export class MinerCreep extends BasicCreep {
  static config:CreepRole = {
    authority: 2,
    max: (roomAudit:RoomAudit)=>{
      return (
        roomAudit.controllerLevel >= 6,
        roomAudit.storedEnergy &&
        roomAudit.storedMineral < MINERALS_STORAGE_FILL &&
        roomAudit.mineral &&
        roomAudit.mineral.anchor.mineralAmount &&
        roomAudit.mineral.occupancy === 0 &&
        roomAudit.mineral.extractor
      ) ? 1 : 0;
    },
    tiers: [
      {
        cost: 550,
        body: [
          WORK, WORK, WORK, WORK, WORK, MOVE
        ],
      },
      {
        cost: 1700,
        body: [
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          MOVE, MOVE, MOVE, MOVE,
        ],
      }
    ],
    getCreepAnchor: (roomAudit:RoomAudit)=>{
      return roomAudit.mineral;
    },
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

  //Mine Minerals
  startMining(storedTarget?:TargetableTypes){
    if (!this.canWork) return null;
    if (this.canCarry && this.store.getFreeCapacity() < this.workCount*2) return null;
    const checkExtractorCooldown = (mineral:Mineral)=>{
      const extractor = mineral.pos.lookFor(LOOK_STRUCTURES).find(structure=>structure.structureType === STRUCTURE_EXTRACTOR) as StructureExtractor;
      return extractor && extractor.cooldown === 0;
    };
    const checkCapacity = (mineral:Mineral)=>{
      return mineral.mineralAmount > 0 && checkExtractorCooldown(mineral);
    };

    const mineral = storedTarget instanceof Mineral && checkCapacity(storedTarget) && storedTarget;

    if (!mineral) return null;
    if (this.moveWithinRange(mineral.pos, 1)) return mineral;
    const action = this.harvest(mineral);
    if (action === ERR_NOT_ENOUGH_ENERGY) return null; //This happens if you have too many miners on a source
    const ok = this.respondToActionCode(action, mineral);
    return ok;
  }

  work(){
    if (this.spawning) return;
    // if (!this.memory.anchor){
    //   const roomAudit = getRoomAudit(this.room);
    //   const creepAnchor = MinerCreep.config.getCreepAnchor!(roomAudit);
    //   if (creepAnchor){
    //     // console.log(`creepAnchor`, creepAnchor);
    //     this.memory.anchor = creepAnchor.id;
    //     creepAnchor.addOccupant(this.name);
    //   }
    // }

    // super.work();
    const anchor = this.getAnchor();
    if (anchor){
      if (!this.memory.seated){
        this.memory.seated = false; //This will disable resource spreading which will slow down these already slow creeps
        if (this.moveWithinRange(anchor.pos, 1)) return;
        const roomAudit = getRoomAudit(this.room);
        const mineralAnchor = roomAudit.mineral;
        if (!mineralAnchor!.containers.length){
          //If this source doesn't have any containers near it yet just have a seat anywhere
          this.memory.seated = true;
        }else{
          const seatContainer = mineralAnchor!.containers.find(container=>{
            //If you're already over a container or there's a open container nearby
            return this.pos.isEqualTo(container.pos) || !container.pos.lookFor(LOOK_CREEPS).length;
          });
          //Another creep might be temporarily sitting on the desired container, or there might be multiple miners but only one box.
          if (seatContainer){
            if (this.pos.isEqualTo(seatContainer.pos)){
              this.memory.seated = true;
            }else{
              this.moveTo(seatContainer);
              return;
            }
          }
        }
      }
    }
    this.startMining(anchor);
  }
}
