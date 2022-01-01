import { CreepRoleType, USERNAME } from "utils/constants";
import { creepCountParts, CreepRoles, getCreepName, getHeighestCreepTier } from "managers/creeps";
import { getRoomAudit } from "managers/room";
import { FlagManager } from "managers/flags";
import { CreepAnchor, GenericAnchorType } from "utils/CreepAnchor";

export class SpawnController extends StructureSpawn{
  constructor(spawn:StructureSpawn){
    super(spawn.id);
    // this.bestCreep = getHeighestCreepTier(CreepTiers, this.room);
  }

  getRepairableCreeps(){
    // if (room.memory.storage.energy > 1000){
    return this.pos.findInRange(FIND_MY_CREEPS, 1, {
      filter: function (creep: Creep) {
        return creep.ticksToLive !== undefined && creep.ticksToLive < 1400;// && !creep.memory.obsolete;
      }
    });
  }

  get sourceCount(){
    if (this.memory.sourceCount === undefined){
      const sources = this.room.find(FIND_SOURCES);
      this.memory.sourceCount = sources.length;
    }
    return this.memory.sourceCount;
  }

  get counts():SpawnerCounts{
    return {
      controllerLevel: this.room.controller?.level || 0,
      sources: this.sourceCount,
    }
  }

  work(){
    // const repairable = this.getRepairableCreeps();
    // if (repairable.length){
    //   //TODO: Repair the lowest creep
    //   // this.renewCreep
    // }
    // if (this.spawning){
    //   const roomAudit = getRoomAudit(this.room);
    //   console.log(`DEBUG: Creep Counts:`, JSON.stringify(roomAudit.creepCountsByRole, null, 2));
    // }
    if (!this.spawning){
      // const sources = this.room.find(FIND_SOURCES);
      // sources.forEach(source=>{
      //   // this.room.createConstructionSite(source.pos.x, source.pos.y-1, STRUCTURE_ROAD); //Top
      //   // this.room.createConstructionSite(source.pos.x+1, source.pos.y-1, STRUCTURE_ROAD); //Top Right
      //   // this.room.createConstructionSite(source.pos.x+1, source.pos.y, STRUCTURE_ROAD); //Right
      //   // this.room.createConstructionSite(source.pos.x+1, source.pos.y+1, STRUCTURE_ROAD); //Bottom Right
      //   // this.room.createConstructionSite(source.pos.x, source.pos.y+1, STRUCTURE_ROAD); // Bottom
      //   // this.room.createConstructionSite(source.pos.x-1, source.pos.y+1, STRUCTURE_ROAD); //Bottom Left
      //   // this.room.createConstructionSite(source.pos.x-1, source.pos.y, STRUCTURE_ROAD); //Left
      //   // this.room.createConstructionSite(source.pos.x-1, source.pos.y-1, STRUCTURE_ROAD); //Top Left
      // });

      // if (this.room.controller?.level >= 5){
      //   //https://docs.screeps.com/api/#StructureLink
      //   console.log('TODO: BUILD LINKS');
      // }

      const roomAudit = getRoomAudit(this.room);

      if (roomAudit.hostileCreeps.length){
        //We don't currently have logic for defender creeps. Just let everything die and save our stored energy until the invader times out.
        return;
      }

      // console.log(`roomAudit upgrader`, JSON.stringify(roomAudit.creepCountsByRole.upgrader, null, 2));

      // console.log(`creepCountsByRole`, JSON.stringify(roomAudit.creepCountsByRole));

      // this.spawnCreep([WORK, MOVE, CARRY], getCreepName());
      let roleToSpawn:CreepRoleType|undefined,
          creepTierToSpawn:CreepTier|undefined|null,
          creepAnchor:CreepAnchor<GenericAnchorType>|FlagManager|undefined,
          lowestPercentage:number|undefined;

      // const affordableTiers:{[roleName:string]: CreepTier} = {};
      if (roomAudit.creeps.length === 0){
        //If things get screwed up somehow just make the cheapest basic creep available to hopefully get things rolling again...
        roleToSpawn = CreepRoleType.Basic;
        creepTierToSpawn = getHeighestCreepTier(CreepRoles.basic.config.tiers, this.room, true);
      }else{
        for (const rn in CreepRoles){
          try{
            const roleName = rn as CreepRoleType;
            const config = CreepRoles[roleName].config;
            const tier = getHeighestCreepTier(config.tiers, this.room);
            if (tier){ //Creep type doesn't count if we can't yet afford to produce the lowest tier
              const count = roomAudit.creepCountsByRole[roleName];
              const getMax = tier.max || config.max;
              if (!getMax) throw `Unable to get max count for ${roleName}`;
              const max = getMax(roomAudit);
              if (count < max){
                const anchor = config.getCreepAnchor && config.getCreepAnchor(roomAudit);
                if (config.getCreepAnchor && !anchor){
                  console.log(`Unable to find creep anchor`);
                  continue;
                }
                const percentage = count/max;
                if (!roleToSpawn || percentage < (lowestPercentage as number)){
                  // console.log(roleName, count, '<',  max);
                  roleToSpawn = roleName;
                  creepTierToSpawn = tier;
                  creepAnchor = anchor;
                  lowestPercentage = percentage;
                }
              }
            }
          }catch(e:any){
            console.log(`spawn error for ${rn} role`, e, e.stack);
          }
        }
      }

      if (roleToSpawn && creepTierToSpawn){
        // console.log(`roleToSpawn`, roleToSpawn);
        // const config = CreepRoles[roleToSpawn].config;
        const tier = creepTierToSpawn;
        const name = getCreepName(roleToSpawn);
        const options:MandateProps<SpawnOptions, 'memory'> = {
          memory: {
            role: roleToSpawn,
            counts: creepCountParts(tier.body),
            // home: this.room.name,
            // office: this.room.name,
          }
        };
        if (creepAnchor instanceof FlagManager){
          options.memory.flag = creepAnchor.name;
          creepAnchor.addFollower(name);
        }else if (creepAnchor instanceof CreepAnchor){
          options.memory.anchor = creepAnchor.id;
          creepAnchor.addOccupant(name);
        }
        // if (config.modSpawnOptions) config.modSpawnOptions(roomAudit, options, this);
        if (tier.cost > this.room.energyAvailable) return;
        //Inflate the number now so that any other spawns in the room don't try to build the same thing. This is only sufficient for this tick. The room audit needs to count creeps being produced in spawns.
        // console.log(`Creep Counts:`, JSON.stringify(roomAudit.creepCountsByRole, null, 2));
        console.log(`Spawning ${roleToSpawn} creep (cost:${tier.cost}) in [${this.room.name}]`);// with memory:`, JSON.stringify(options, null, 2));
        roomAudit.creepCountsByRole[roleToSpawn]++;
        console.log(`New ${roleToSpawn} creep count:`, roomAudit.creepCountsByRole[roleToSpawn]);
        this.spawnCreep(tier.body, name, options);
      }
    }
  }

  // spawnCreep(body: BodyPartConstant[], name:string = getCreepName(), opts: SpawnOptions = {}){
  //   opts.memory = {
  //     role: 'basic',
  //     counts: creepCountParts(body),
  //     ... opts?.memory
  //   }
  //   return super.spawnCreep(body, name, opts);
  // }
}
