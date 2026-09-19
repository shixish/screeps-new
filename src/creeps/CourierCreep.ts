import { claimAmount, getResourceSpace } from "utils/tickCache";
import { CreepRoleName } from "utils/constants";
import { blockSeatsInCostMatrix, stepOffSeat, tugStaticCreepToSeat } from "utils/seatTug";
import { BasicCreep, CreepBody, CreepTiers } from "./BasicCreep";

export class CourierCreep extends BasicCreep {
  // static tiers:CreepTiers = new CreepTiers([
  //   new CreepBody([
  //     CARRY, MOVE,
  //     CARRY, MOVE,
  //     CARRY, MOVE,
  //   ], 300),
  //   new CreepBody([
  //     CARRY, MOVE,
  //     CARRY, MOVE,
  //     CARRY, MOVE,
  //     CARRY, MOVE,
  //   ], 400),
  //   new CreepBody([
  //     CARRY, MOVE,
  //     CARRY, MOVE,
  //     CARRY, MOVE,
  //     CARRY, MOVE,
  //     CARRY, MOVE,
  //     CARRY,
  //   ], 550),
  //   new CreepBody([
  //     CARRY, MOVE,
  //     CARRY, MOVE,
  //     CARRY, MOVE,
  //     CARRY, MOVE,
  //     CARRY, MOVE,
  //     CARRY, MOVE,
  //     CARRY, MOVE,
  //     CARRY, MOVE,
  //     CARRY, MOVE,
  //     CARRY, MOVE,
  //     CARRY, MOVE,
  //     CARRY, MOVE,
  //   ], 1200),
  // ]);
  static config:CreepRole = {
    authority: 2,
    // max: (roomAudit: RoomAudit)=>{
    //   //We only need couriers if we have miners available, otherwise the resources should go to basic creeps that can do both
    //   return Math.min(roomAudit.creepCountsByRole.harvester*2, roomAudit.sources.length*2);
    // },
    tiers: [
      /*
        One MOVE per CARRY, always. A courier walks loaded, so an extra CARRY without its MOVE just
        halves the creep's speed on plain terrain - which is why every tier here is a round hundred.
      */
      {
        body: new CreepBody([
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
        ], 300),
      },
      {
        body: new CreepBody([
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
        ], 400),
      },
      {
        //The first four extensions (spawn circulation pockets) buy this.
        body: new CreepBody([
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
        ], 500),
      },
      {
        body: new CreepBody([
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
        ], 600),
      },
      {
        body: new CreepBody([
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
          CARRY, MOVE,
        ], 1200),
      },
    ]
  }

  //Standing on a source/controller container starves the static that owns it. Seats are only walkable
  //while we're actively tugging a static onto one.
  protected allowSeatTiles = false;

  protected relaxMovementRestrictions(){
    this.allowSeatTiles = true;
  }

  private avoidSeats(opts?:MoveToOpts):MoveToOpts{
    if (this.allowSeatTiles || this.memory.tugTarget) return opts ?? {};
    const callback = opts?.costCallback;
    return {
      ...opts,
      costCallback: (roomName, costMatrix)=>blockSeatsInCostMatrix(roomName, callback?.(roomName, costMatrix) || costMatrix),
    };
  }

  moveTo(x:number, y:number, opts?:MoveToOpts):CreepMoveReturnCode|ERR_NO_PATH|ERR_INVALID_TARGET;
  moveTo(target:RoomPosition|{pos:RoomPosition}, opts?:MoveToOpts):CreepMoveReturnCode|ERR_NO_PATH|ERR_INVALID_TARGET|ERR_NOT_FOUND;
  moveTo(first:number|RoomPosition|{pos:RoomPosition}, second?:number|MoveToOpts, third?:MoveToOpts){
    if (typeof first === 'number') return super.moveTo(first, second as number, this.avoidSeats(third));
    return super.moveTo(first, this.avoidSeats(second as MoveToOpts|undefined));
  }

  /* Nothing to haul: park near the base rather than loitering by the sources and their seats. */
  idle(){
    if (stepOffSeat(this)) return;
    const base = this.getBaseAnchor();
    if (base && this.pos.getRangeTo(base) > 3){
      this.moveTo(base, { range: 3 });
      return;
    }
    this.shuffleOffBadIdleTile();
  }

  /*
    Zero-detour top-off for the seated upgrader. This used to feed any WORK creep standing next to us,
    which mostly meant spoon-feeding Basics that were perfectly capable of walking to a container -
    the seated upgrader is the one creep that genuinely cannot go and get its own energy. We never
    move for this, so haul priorities are untouched; it only fires when we happen to already be within
    transfer range (stocking the controller container puts us right there).
  */
  feedSeatedUpgraderNearby(){
    const resourceType = RESOURCE_ENERGY;
    if (this.store[resourceType] === 0) return null;
    const target = this.pos.findInRange(FIND_MY_CREEPS, 1).find(creep=>{
      //No 50 energy floor here - we're already standing next to it, so even a partial top-off is free.
      return creep.memory.role === CreepRoleName.Upgrader && creep.memory.seated !== false && getResourceSpace(creep, resourceType) > 0;
    });
    if (!target) return null;
    if (!this.manageActionCode(this.transfer(target, resourceType))) return null;
    claimAmount(target.id, resourceType, -Math.min(target.store.getFreeCapacity(resourceType), this.store[resourceType]));
    return target;
  }

  work(){
    if (this.commute()) return;

    //Position static miners/upgraders onto their containers before normal haul duty.
    //Couriers are the intended tug (Basics never pull). 1-MOVE statics can also self-walk.
    if (tugStaticCreepToSeat(this)){
      this.say('tug');
      return;
    }

    //Never hold a miner/upgrader seat: hop off before doing anything else this tick.
    if (stepOffSeat(this)){
      this.say('seat');
      return;
    }

    const usedCapacity = this.store.getUsedCapacity();
    const energyCapacity = this.store.getUsedCapacity(RESOURCE_ENERGY);
    // const roomAudit = getRoomAudit(this.room);
    let triedStoring = false;

    /* this stuff deals with minerals */
    if (this.rememberAction(this.startTransferringMinerals, 'transferring')) return;
    if (usedCapacity > 0 && usedCapacity !== energyCapacity){
      //if filled with stuff other than energy
      if (this.rememberAction(this.startStoring, 'storing')) return;
      triedStoring = true;
    }

    /* this stuff deals with energy */
    if (this.rememberAction(this.startPickup, 'pickup')) return;
    if (this.rememberAction(this.startTakingEnergy, 'taking')) return;

    if (energyCapacity > 0){ //Do something with the energy
      // if (this.memory.office && this.memory.office !== this.room.name){
      //   const direction = this.room.findExitTo(this.memory.office);
      //   if (direction === ERR_NO_PATH) return console.log(`No path to office found.`);
      //   if (direction === ERR_INVALID_ARGS) return console.log(`Invalid office args.`);
      //   const exit = this.pos.findClosestByRange(direction);
      //   this.say('commuting');
      //   this.moveTo(exit!);
      //   return;
      // }
      if (this.rememberAction(this.startEnergizing, 'energizing')) return;
      //Opportunistic, never moves us: only fires if a seated upgrader is already in transfer range.
      if (this.feedSeatedUpgraderNearby()){
        this.say('feed');
        return;
      }
      //startSpreading prefers the dedicated upgrader over Basics, and will walk to it - the upgrader
      //sits on the controller container, so that's the same trip startStocking below would make.
      if (this.rememberAction(this.startSpreading, 'spreading')) return;
      if (this.rememberAction(this.startStocking, 'stocking')) return;
      if (!triedStoring && this.rememberAction(this.startStoring, 'storing')) return;
    }

    // If nothing was successful reset action state. Necessary since rememberAction isn't always going to do the cleanup.
    this.currentAction = undefined;
    this.idle();
  }
}
