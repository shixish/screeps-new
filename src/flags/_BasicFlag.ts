import { CreepRoles } from "managers/creeps";
import { CreepPriority, CreepRoleName, FlagType } from "utils/constants";
import { getRoomAudit } from "utils/tickCache";

if (!Memory.flags) Memory.flags = {} as Memory['flags']; //Flags object isn't initialized by default

export interface BasicFlagMemory extends FlagMemory{
  followers: Creep['name'][]; //Deprecated ... Keeping for now as we transition...
}

export abstract class BasicFlag<AbstractFlagMemory extends BasicFlagMemory = BasicFlagMemory> {
  flagName: Flag['name'];
  type: FlagType;
  suffix: string | undefined;
  homeAudit!:RoomAudit;
  homeRoomName!:Room['name'];

  // followerRoleCounts = {} as Partial<Record<CreepRoleName, number>>;
  // maxFollowersByRole = {} as Partial<Record<CreepRoleName, number>>;
  // currentBodyPartsByRole = {} as {[key in CreepRoleName]?: CreepPartsCounts};
  // requiredBodyPartsByRole = {} as {[key in CreepRoleName]?: CreepPartsCounts};
  // requestedBodyPartsByRole = {} as {[key in CreepRoleName]?: CreepPartsCounts};

  constructor(flagName: Flag['name'], type: FlagType, suffix?: string) {
    this.flagName = flagName;
    this.type = type;
    this.suffix = this.parseSuffix(suffix);
    // this.memory.followers = this.memory.followers.filter(creepName => {
    //   const creep = Game.creeps[creepName];
    //   if (creep){
    //     this.countCreep(creepName);
    //     return true;
    //   }
    //   return false;
    // });
    this.homeAudit = getRoomAudit(this.home);
  }

  parseSuffix(suffix?: string){
    //Basic flags can only be placed within their home room.
    this.homeRoomName = this.roomName;
    return suffix;
  }

  abstract work(): void;

  get flag(){
    return Game.flags[this.flagName];
  }

  get memory():AbstractFlagMemory {
    return (Memory.flags[this.flagName] || (Memory.flags[this.flagName] = {
      followers: [],
    })) as AbstractFlagMemory;
  }

  get name() {
    return this.flagName;
  }

  get pos() {
    return this.flag.pos;
  }

  get roomName() {
    return this.flag.pos.roomName;
  }

  get home(){
    return Game.rooms[this.homeRoomName];
  }

  get followers() {
    return this.memory.followers;
  }

  // getHighestSpawnableCreep(roleName:CreepRoleName, requestedParts:CreepPartsCounts, cohort?:Cohort):SpawnableCreep|null{
  //   const config = CreepRoles[roleName].config;
  //   const tier = config.tiers.reduce((heighestTier, currentTier)=>{
  //     if (currentTier.body.cost > this.homeAudit.room.energyCapacityAvailable || currentTier.requires?.(this.homeAudit) === false) return heighestTier;
  //     for (let type in requestedParts){
  //       if ((currentTier.body.counts[type as BodyPartConstant] || 0) > (requestedParts[type as BodyPartConstant] || 0)){
  //         return heighestTier;
  //       }
  //     }
  //     return currentTier;
  //   }, null as CreepTier|null);
  //   return tier ? {
  //     role: roleName,
  //     tier: tier,
  //     flag: this,
  //     cohort,
  //   } as SpawnableCreep : null;
  // }

  findSpawnableCreep(roleName:CreepRoleName, distanceFilter?:true|((body:CreepBody)=>number|false), attributes?:Partial<SpawnableCreep>):SpawnableCreep|null{
    const config = CreepRoles[roleName].config;
    const energyAvailable = distanceFilter === true ? this.homeAudit.room.energyAvailable : this.homeAudit.room.energyCapacityAvailable;
    const distanceFilterFn = typeof distanceFilter === 'function' ? distanceFilter : ()=>0; //if no distance function is provided then just find the most expensive tier to use
    const { tier } = config.tiers.reduce((out, currentTier)=>{
      if (currentTier.body.cost > energyAvailable) return out;
      const distance = distanceFilterFn(currentTier.body);
      if (distance === false) return out; //false means this is an invalid tier
      if (out.distance === false || distance <= out.distance){ //distance of 0 indicates a perfect match
        out.tier = currentTier;
        out.distance = distance;
      }
      return out;
    }, { tier: null, distance: false } as { tier: CreepTier|null, distance:number|false });
    return tier ? {
      role: roleName,
      tier: tier,
      flag: this,
      ...attributes
    } as SpawnableCreep : null;
  }

  getOptimalBuilderParts(room:Room, totalEnergyPerTick:number = this.homeAudit.totalEnergyIncomePerTick){
    const constructionProgress = room.find(FIND_MY_CONSTRUCTION_SITES).reduce((out, structure)=>out + (structure.progressTotal-structure.progress), 0) || 0;
    const repairableHits = room.find(FIND_STRUCTURES, {
      filter: structure=>{
        return structure.structureType === STRUCTURE_ROAD || structure.structureType === STRUCTURE_CONTAINER
      }
    }).reduce((out, structure)=>out + (structure.hitsMax-structure.hits), 0);

    /* One WORK use 1 energy/tick:
      - build at 5 points/tick
      - repair at 100 hits/tick
    */
    // 1500 ticks is how long a creep will live. It's ok to be a little wasteful if it gets the job done faster.
    // The creep won't spend it's entire up-time building, so I'll use 500 to estimate that it'll be 1/3 efficient

    //Recall that building on swamp costs a lot more so the cost isn't just a function of distance.
    const buildWork = (constructionProgress/5)/500; //500 indicates that we will be up to 3 (1500/500=3) times inefficient when initially building
    const repairWork = repairableHits && (repairableHits/100)/1000; // Maybe 1/3 of it's uptime it'll be looking for more energy so this is 2/3 of 1500
    const optimalBuilderParts = Math.ceil(Math.min(buildWork + repairWork, totalEnergyPerTick));
    return optimalBuilderParts;
  }

  // findOptimalTier(roleName:CreepRoleName, distanceFilter?:true|((body:CreepBody)=>number|false)):CreepTier|null{
  //   const config = CreepRoles[roleName].config;
  //   const energyAvailable = distanceFilter === true ? this.homeAudit.room.energyAvailable : this.homeAudit.room.energyCapacityAvailable;
  //   const distanceFilterFn = typeof distanceFilter === 'function' ? distanceFilter : ()=>0; //if no distance function is provided then just find the most expensive tier to use
  //   const { tier } = config.tiers.reduce((out, currentTier)=>{
  //     if (currentTier.body.cost > energyAvailable) return out;
  //     const distance = distanceFilterFn(currentTier.body);
  //     if (distance === false) return out; //false means this is an invalid tier
  //     if (out.distance === false || distance <= out.distance){ //distance of 0 indicates a perfect match
  //       out.tier = currentTier;
  //       out.distance = distance;
  //     }
  //     return out;
  //   }, { tier: null, distance: false } as { tier: CreepTier|null, distance:number|false });
  //   return tier;
  // }

  getRequestedCreep(currentPriorityLevel:CreepPriority):SpawnableCreep|null{
    return null;
  }

  // getRequestedBodyPartsByRole(roleName:CreepRoleName){
  //   const requestedParts = {} as CreepPartsCounts;
  //   for (let type in this.requiredBodyPartsByRole[roleName]){
  //     // console.log(`requiredBodyPartsByRole, currentBodyPartsByRole`, this.requiredBodyPartsByRole[roleName]![type as BodyPartConstant], this.currentBodyPartsByRole[roleName]![type as BodyPartConstant]);
  //     requestedParts[type as BodyPartConstant] = (this.requiredBodyPartsByRole[roleName]![type as BodyPartConstant] || 0) - (this.currentBodyPartsByRole[roleName]?.[type as BodyPartConstant] || 0);
  //   }
  //   return requestedParts;
  // }

  // requestCreep(roleName:CreepRoleName, counts:CreepPartsCounts, anchor?:Id<GenericAnchorType>){
  //   //TODO: It'd be best if I can specify the creep's anchor object from here.
  //   //This should replace this.requiredBodyPartsByRole object somehow
  // }

  // private countCreep(creepName: Creep['name']){
  //   const { role, counts } = Memory.creeps[creepName];
  //   this.followerRoleCounts[role] = (this.followerRoleCounts[role] || 0) + 1;
  //   if (!this.currentBodyPartsByRole[role]) this.currentBodyPartsByRole[role] = {};
  //   for (let type in counts){
  //     this.currentBodyPartsByRole[role]![type as BodyPartConstant] = (this.currentBodyPartsByRole[role]![type as BodyPartConstant] || 0) + (counts[type as BodyPartConstant] || 0);
  //   }
  // }

  // getAvailableFollowersByRole(creepRole:CreepRoleName){
  //   const max = this.maxFollowersByRole[creepRole];
  //   const count = this.followerRoleCounts[creepRole] || 0;
  //   return max !== undefined ? Math.max(max-count, 0) : 0;
  // }

  // addFollower(creepName: Creep['name']){
  //   const creepMemory = Memory.creeps[creepName];
  //   creepMemory.flag = this.name;
  //   this.countCreep(creepName);
  //   this.memory.followers.push(creepName);
  // }

  remove(){
    if (this.flag) this.flag.remove();
    delete Memory.flags[this.flagName];
  }

  toJSON(){
    return {
      name: this.name,
      type: this.type,
      room: this.roomName,
      memory: this.memory,
    }
  }
}
