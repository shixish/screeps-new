import { creepHasParts } from "utils/creeps";

export class CreepFactory {

}

export class BaseCreep extends Creep {
  //Abstract class
  // public creep: Creep;
  //Note: this was a bad idea, it needs to find out if the target changed right before doing the work:
  // protected target;
  // protected action_name;
  // protected flag: Flag;
  // memory:CreepMemory;

  constructor(creep:Creep) {
    super(creep.id);
    // this.memory = memory;
    /*if (this.creep.memory.office) {
            this.flag = Game.flags[this.creep.memory.office];
        }*/
    // if (this.creep.memory.flag) {
    //   this.flag = Game.flags[this.creep.memory.flag];
    // }
  }

  canWork(){
    // return Boolean(this.body.find(obj=>obj.type === WORK && obj.hits > 0));
    return creepHasParts(this, [WORK]);
  }

  startStoring(){
    const spawn = this.pos.findClosestByRange(FIND_MY_SPAWNS);
    if (!spawn) return false;
    if (spawn.store.getUsedCapacity(RESOURCE_ENERGY) !== spawn.store.getCapacity(RESOURCE_ENERGY)){
      const action = this.transfer(spawn, RESOURCE_ENERGY);
      if (action === OK){
        return true;
      } else if (action === ERR_NOT_IN_RANGE){
        this.say('Storing');
        const moving = this.moveTo(spawn);
        if (moving === OK) return true;
        else if (moving === ERR_TIRED){
          this.say('Tired');
          return true;
        }
        console.log(`moving error`, moving);
        return true;
      }else{
        console.log(`storing error`, action);
      }
    }
    return false;
  }

  startMining(){
    const source = this.pos.findClosestByPath(FIND_SOURCES_ACTIVE, {
      // filter: function (source){
      //   return source.pos.findInRange(FIND_MY_CREEPS, 2).length < 3;
      // }
    });
    if (!source) return false; //This happens if there's no path to the source (it's blocked by other workers)
    const action = this.harvest(source);
    if (action === OK){
      return true;
    } else if (action === ERR_NOT_IN_RANGE) {
      const moving = this.moveTo(source);
      if (moving === OK) return true;
      else if (moving === ERR_TIRED){
        this.say('Tired');
        return true;
      }
      console.log(`moving error`, moving);
    }else{
      console.log(`mining error`, action);
    }
    return false;
  }

  startBuilding(){
    const energy = this.store.getUsedCapacity(RESOURCE_ENERGY);
    if (energy === 0) return false;

    const construction = this.pos.findClosestByRange(FIND_CONSTRUCTION_SITES);
    if (construction){
      const action = this.build(construction);
      if (action === OK){
        return true;
      } else if (action === ERR_NOT_IN_RANGE){
        const moving = this.moveTo(construction);
        if (moving === OK) return true;
        else if (moving === ERR_TIRED){
          this.say('Tired');
          return true;
        }
        console.log(`moving error`, moving);
      } else{
        console.log(`building error`, action);
      }
      this.say('Constructing');
    }
    return false;
  }

  work():any{
    if (this.spawning) return;

    // this.creep.say(action_name);
    if (this.store.getCapacity(RESOURCE_ENERGY) > 0 && this.store.getFreeCapacity(RESOURCE_ENERGY) === 0){
      if (this.startStoring()) return;
      if (this.startBuilding()) return;
      if (this.room.controller){
        if (this.transfer(this.room.controller, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE){
          this.moveTo(this.room.controller);
        }
        this.say('Leveling');
      }
    } else if (this.canWork()){
      if (this.startMining()) return;
      if (this.startBuilding()) return;
    }
  }

  // isHome() {
  //   return this.creep.memory.home == this.creep.pos.roomName;
  // }

  // is_at_office() {
  //   return this.creep.memory.office == this.creep.pos.roomName;
  // }

  // retarget() {
  //   //Note: This function needs to be extended by child classes
  //   this.creep.memory.target_id = null;
  //   this.creep.memory.action_name = null;
  // }

  // set_target(targets, action?: string) {
  //   action = action || "Move";
  //   if (CreepActions[action]) {
  //     let ctrl = new CreepActions[action](this.creep);
  //     return ctrl.setTargets(targets);
  //   } else {
  //     console.log("couldn't find action", action);
  //     return false;
  //   }
  // }

  // try_to(action: string) {
  //   if (CreepActions[action]) {
  //     let ctrl = new CreepActions[action](this.creep);
  //     return ctrl.try();
  //   } else {
  //     console.log("couldn't find action", action);
  //     return false;
  //   }
  // }

  // // try_to(type: string) {
  // //     let targets = this.find_targets(type);
  // //     return this.set_target(targets, type);
  // // }

  // // find_targets(type: string) {
  // //     if (CreepActions[type]){
  // //         // console.log('found', type);
  // //         let ctrl = new CreepActions[type](this.creep);
  // //         return ctrl.getTargets();
  // //     }else{
  // //         console.log('couldn\'t find', type);
  // //     }
  // // }

  // work(is_retry?) {
  //   if (
  //     this.creep.memory.action_name !== "Renew" &&
  //     !this.creep.room.memory.under_attack &&
  //     !this.creep.memory.obsolete &&
  //     this.creep.ticksToLive < Globals.MIN_TICKS_TO_LIVE
  //   ) {
  //     this.try_to("Renew");
  //   }

  //   //Notice: make sure any targeting happens before this.
  //   let target = Game.getObjectById(this.creep.memory.target_id),
  //     action_name = this.creep.memory.action_name;

  //   if (CreepActions[action_name]) {
  //     if (action_name) this.creep.say(action_name);
  //     else this.creep.say(this.creep.memory.role + " idle");

  //     let ctrl = new CreepActions[action_name](this.creep);
  //     let ret = ctrl.perform();
  //     if (!ret) {
  //       this.retarget();
  //     }
  //   } else {
  //     this.retarget();
  //   }
  // }
}
