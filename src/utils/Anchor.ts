import { Cohort } from "./Cohort";
import { USERNAME } from "./constants";

export function countAvailableSeats(pos:RoomPosition){
  let seats = 0;
  const mapTerrain = Game.rooms[pos.roomName].getTerrain();
  for (let coord of [[-1,-1], [0,-1], [1,-1], [-1,0], [1,0], [-1,1], [0,1], [1,1]]){
    const terrain = mapTerrain.get(pos.x + coord[0], pos.y + coord[1]);
    if (terrain !== TERRAIN_MASK_WALL) seats++;
    // const newX = this.pos.x + coord[0], newY = this.pos.y + coord[1];
    // const terrain = (this.room.lookAt(newX, newY).find(result=>result.type === LOOK_TERRAIN) as LookAtResult<LOOK_TERRAIN>).terrain;
    // if (terrain !== "wall") sourceSeats++;
  }
  return seats;
};

if (!Memory.anchors) Memory.anchors = {};
export interface AnchorMemory{
  seats?: number;
  containers?: Id<StructureContainer>[];

  occupancy?: Creep['name'][]; //Deprecated but necessary for now until I ship this live
}

export type GenericAnchorType = Source|Mineral|Structure;
export abstract class Anchor<
  AnchorType extends GenericAnchorType = GenericAnchorType,
  AbstractAnchorMemory extends AnchorMemory = AnchorMemory
>{
  private _link: StructureLink | undefined | null;

  anchor:AnchorType;
  // getCapacity = ()=>{
  //   return this.containers.reduce((out, container)=>{
  //     return out + container.store.getCapacity(RESOURCE_ENERGY);
  //   }, 0 as number);
  // };
  // getUsedCapacity = ()=>{
  //   return this.containers.reduce((out, container)=>{
  //     return out + container.store.getUsedCapacity(RESOURCE_ENERGY);
  //   }, 0 as number);
  // };
  // getFreeCapacity = ()=>{
  //   return this.containers.reduce((out, container)=>{
  //     return out + container.store.getFreeCapacity(RESOURCE_ENERGY);
  //   }, 0 as number);
  // };
  // store = {
  //   get energy(){
  //     return this.getUsedCapacity();
  //   },
  //   getCapacity: this.getCapacity,
  //   getUsedCapacity: this.getUsedCapacity,
  //   getFreeCapacity: this.getFreeCapacity,
  // }

  constructor(anchor:AnchorType){
    this.anchor = anchor;
  }

  get memory():AbstractAnchorMemory{
    return (Memory.anchors[this.id] || (Memory.anchors[this.id] = {})) as AbstractAnchorMemory;
  }

  get id(){
    return this.anchor.id;
  }

  get pos(){
    return this.anchor.pos;
  }

  get link(){
    if (this._link === undefined){
      this._link = this.anchor.pos.lookFor(LOOK_STRUCTURES).find(structure=>structure.structureType === STRUCTURE_LINK) as StructureLink || null;
    }
    return this._link;
  }

  private _containers:StructureContainer[]|undefined;
  get containers(){
    if (!this._containers){
      this._containers = [];
      this.memory.containers = (this.memory.containers || []).filter(id=>{
        const container = Game.getObjectById(id);
        if (container){
          this._containers!.push(container);
          return true;
        }
        return false;
      });
      if (!this._containers.length){
        this._containers = this.anchor.pos.findInRange(FIND_STRUCTURES, 1, { //Needs to be distance 1 since controller is sometimes close to sources that will also have a container
          filter: structure=>{
            return structure.structureType === STRUCTURE_CONTAINER;
          }
        }) as StructureContainer[];
        this.memory.containers = this.containers.map(container=>container.id);
      }
    }
    return this._containers;
    // return this.memory.containers || (this.memory.containers = {} as AbstractAnchorMemory['containers']);
  }

  // checkOccupantParts(requiredParts:CreepPartsCounts){
  //   for (const occupant of this.memory.occupancy){
  //     const counts = Memory.creeps[occupant].counts;
  //     let done = true;
  //     for (let p in requiredParts){
  //       if ((requiredParts[p as BodyPartConstant]! -= (counts[p as BodyPartConstant] || 0)) > 0){
  //         done = false;
  //       }
  //     }
  //     if (done) return true;
  //   }
  //   return false;
  // }

  // get neededBodyParts(){
  //   return {} as CreepPartsCounts;
  // }
}

export class CreepMineralAnchor extends Anchor<Mineral>{
  miners = new Cohort(this.id+'-miners');
  private _extractor: StructureExtractor | undefined | null;

  constructor(mineral:Mineral){
    super(mineral);
  }

  get extractor(){
    if (this._extractor === undefined){
      this._extractor = this.anchor.pos.lookFor(LOOK_STRUCTURES).find(structure=>structure.structureType === STRUCTURE_EXTRACTOR) as StructureExtractor || null;
    }
    return this._extractor;
  }

  // get operational(){
  //   return !this.anchor.ticksToRegeneration;
  // }

  get occupancy(){
    return this.miners.occupancy;
  }
}

export interface SourceAnchorMemory extends AnchorMemory{
  // harvesters?: CohortMemory;
}
export class SourceAnchor extends Anchor<Source, SourceAnchorMemory>{
  harvesters = new Cohort(this.id+'-harvesters');
  couriers = new Cohort(this.id+'-couriers');
  isInvaded = !this.anchor.room?.controller?.my && this.anchor.room?.controller?.reservation && this.anchor.room?.controller?.reservation?.username !== USERNAME;

  constructor(source:Source){
    super(source);

    //TEMPORARY: This is to help transition to the new system. occupancy can then be deleted
    if (this.memory.occupancy){
      this.memory.occupancy.forEach(creepName=>{
        if (Game.creeps[creepName]) this.harvesters.push(creepName);
      });
      delete this.memory.occupancy;
    }
  }

  get totalSeats(){
    if (this.memory.seats === undefined){
      this.memory.seats = countAvailableSeats(this.anchor.pos);
    }
    //We can't sustain more than 3 low level harvesters on a source
    return Math.min(this.memory.seats, 3);
  }

  getOptimalWorkParts(){
    if (this.isInvaded) return 0;
    switch(this.anchor.energyCapacity){
      case 3000: return 5;
      case 4000: return 7; //Dunno?
      // case 1500: return 4;
      default: return 4;
    }
  }

  getOptimalEnergyPerTick(){
    if (this.isInvaded) return 0;
    switch(this.anchor.energyCapacity){
      case 3000: return 10;
      case 4000: return 13.33334; //Not sure if this is right
      // case 1500: return 5;
      default: return 5;
    }
  }

  get availableSeats(){
    return this.totalSeats - this.harvesters.occupancy;
  }

  get occupancy(){
    return this.harvesters.occupancy;
  }
}

export class CreepControllerAnchor extends Anchor<StructureController>{
  upgraders = new Cohort(this.id+'-upgraders');
  couriers = new Cohort(this.id+'-couriers');

  constructor(controller:StructureController){
    super(controller);
  }
}
