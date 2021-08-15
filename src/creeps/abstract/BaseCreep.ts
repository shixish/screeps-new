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

  canMine(){
    return Boolean(this.body.find(obj=>obj.type === 'work' && obj.hits > 0));
  }

  work(){
    // this.creep.say(action_name);
    if (this.store.getCapacity() > 0 && this.store.getFreeCapacity() === 0){
      const spawn = this.pos.findClosestByRange(FIND_MY_SPAWNS);
      if (spawn && this.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE){
        this.moveTo(spawn);
      }
      this.say('Returning');
    }else if (this.canMine()){
      const source = this.pos.findClosestByPath(FIND_SOURCES_ACTIVE, {
        filter: function (source){
          return source.pos.findInRange(FIND_MY_CREEPS, 2).length < 3;
        }
      });
      if (source && this.harvest(source) === ERR_NOT_IN_RANGE) {
        this.moveTo(source);
      }
      this.say('Mining');
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
