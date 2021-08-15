export abstract class Action {
  //Abstract class
  public actor;
  public target;
  public action_name = "Unknown";
  protected cache_targeting = true;

  constructor(actor) {
    this.actor = actor;
    // console.log(this.actor);
    if (this.actor.memory.target_id) this.target = Game.getObjectById(this.actor.memory.target_id);
    // this.action_name = this.actor.memory.action_name;
  }

  getTargets() {
    //notice: I could possibly cache the results of this function on a per-tick basis, making it faster for repeat calls.
  }

  try() {
    let targets;
    //This caching doesn't seem to help anything... hmph

    // if (this.cache_targeting && TickCache['Action'][this.action_name]) {
    //     // console.log('cache hit', TickCache['Action'][this.action_name]);
    //     targets = TickCache['Action'][this.action_name];
    // } else {
    //     targets = this.getTargets();
    //     TickCache['Action'][this.action_name] = targets;
    // }

    targets = this.getTargets();

    if (targets) {
      return this.setTargets(targets);
    }
  }

  perform() {
    this.move();
  }

  getTargetRange(obj) {
    // if (obj.structureType && obj.structureType == STRUCTURE_CONTAINER) range = 0;
    return 1;
  }

  setTargets(targets) {
    if (!targets) return false;
    if (targets.length == undefined && typeof targets == "object") targets = [targets];

    // console.log('targets', targets, typeof targets, targets != undefined, targets != null, !!targets.length);
    // debug.log(targets);

    if (targets && targets.length > 0) {
      let target_obj = BaseAction.getClosestByPath(this.actor, targets, this.getTargetRange);
      if (target_obj.target) {
        this.actor.memory.target_id = target_obj.target.id;
        this.actor.memory.target_path = Room.serializePath(target_obj.path);
        this.actor.memory.action_name = this.action_name;
        this.actor.memory.target_x = target_obj.target.pos.x;
        this.actor.memory.target_y = target_obj.target.pos.y;
        return true;
      }
    }
    return false;
  }





  // moving() {
  //     // console.log(creep);
  //     // let action = this.experimental_move(this.target);
  //     // var path = this.actor.pos.findPathTo(this.target);
  //     // console.log(Object.keys(path[0]));
  //     // console.log(path[0].x, path[0].y, path[0].dx, path[0].dy, path[0].direction);
  //     if (this.target.pos.x == this.actor.pos.x && this.target.pos.y == this.actor.pos.y) return false;
  //     let action = this.move();
  //     if (action == ERR_TIRED) {
  //         this.actor.say('tired');
  //     } else if (action == ERR_BUSY) {
  //         //just wait
  //     } else if (action == ERR_NO_PATH) {
  //         console.log(this.actor.name, "unable to find a path to", this.target);
  //         // this.actor.move(this.actor.pos.getDirectionTo(this.target));
  //         // action = this.experimental_move(this.target);
  //         // if (action == ERR_TIRED) {
  //         //     this.actor.say('tired');
  //         // } else if (action == ERR_BUSY) {
  //         //     //just wait
  //         // } else if (action == ERR_NO_PATH) {
  //         //     console.log(this.actor.name, "unable to find a path to", target);
  //         // }else if (action != 0) {
  //         //     console.log('Error moving:', action);
  //         // }
  //     } else if (action != 0) {
  //         console.log('Error moving:', action);
  //         return false;
  //     }
  //     return false;
  //     // console.log(this.actor.name, 'moving', action);
  //     // return false;
  // }

  move(_target?) {
    let target = _target || this.target;
    // if (this.actor.name == 'Katherine')
    //     console.log(this.actor.name, this.actor.memory.role, this.actor.pos.x, this.actor.memory.target_x, ', ', this.actor.pos.y, this.actor.memory.target_y);
    if (target && this.actor && !this.actor.pos.inRangeTo(target, this.getTargetRange(target))) {
      let move = this.actor.moveTo(target);
      // console.log(move);
      return move;
    }
    return;

    // let p = this.actor.pos.findPathTo(target);
    // return this.actor.moveByPath(p);

    // this.retarget();
    // if (this.actor.memory.target_path){
    //     let path = Room.deserializePath(this.actor.memory.target_path);
    //     console.log(this.actor.memory.target_path, Object.keys(path[0]), path[0].x);
    // }

    //As long as the stored target object is the right target, and we have the stored target_path, try to use it.
    // if (target.id != this.actor.memory.target_id) {
    //     console.log('weirdo movement!?');
    //     this.retarget();
    // }

    // let path;
    // if (!this.actor.memory.target_path) {
    //     path = this.actor.pos.findPathTo(target);
    //     this.actor.memory.target_path = Room.serializePath(path);
    // } else {
    //     path = Room.deserializePath(this.actor.memory.target_path);
    // }

    // let move = this.actor.moveByPath(path);
    // if (move == ERR_NOT_FOUND) {
    //     var new_path = this.actor.pos.findPathTo(target);
    //     this.actor.memory.target_path = Room.serializePath(new_path);
    //     move = this.actor.moveByPath(path);
    // }

    // if (move == ERR_TIRED) {
    //     this.actor.say('tired');
    // } else if (move == ERR_NOT_FOUND) {
    //     console.log(creep, 'Error finding path using serialization...');
    //     // debug.log(path);
    //     var new_path = this.actor.pos.findPathTo(target);
    //     this.actor.memory.target_path = Room.serializePath(new_path);

    //     // console.log('ERR_NOT_FOUND', Object.keys(path[0]), path[0].x, path[0].y);
    //     // var ezpath = this.actor.pos.findPathTo(target);
    //     // // if (ezpath.length) {
    //     // //     console.log('ERR_NOT_FOUND2', Object.keys(ezpath[0]), ezpath[0].x, ezpath[0].y);
    //     // // } else {
    //     // //     console.log('no path found');
    //     // // }
    //     // move = this.actor.moveByPath(ezpath);
    //     // console.log('ezpath', move);
    //     // return this.actor.moveTo(target);
    // }else if (move == ERR_BUSY){
    //     //don't worry about it.
    // }else if (move != 0) {
    //     console.log(creep, 'generic path finding error:', move);
    // }
    // return move;
  }
}
