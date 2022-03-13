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
    const roomAudit = getRoomAudit(this.home);
    (roomAudit.flags[this.type] as BasicFlag[]).push(this);
    this.homeAudit = roomAudit;
  }

  parseSuffix(suffix?: string){
    //Used by remote flags
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

  get home() {
    //Basic flags can only be placed within their home room.
    return this.flag.room!;
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
