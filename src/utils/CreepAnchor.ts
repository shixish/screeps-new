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
export interface CreepAnchorMemory{
  seats?: number;
  containers: Id<StructureContainer>[];
  occupancy: Creep['name'][];
}

export type GenericAnchorType = Source|Mineral|Structure;
export class CreepAnchor<AnchorType extends GenericAnchorType = GenericAnchorType, AbstractAnchorMemory extends CreepAnchorMemory = CreepAnchorMemory>{
  private _link: StructureLink | undefined | null;

  anchor:AnchorType;
  containers: StructureContainer[] = [];
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
    this.memory.occupancy = this.memory.occupancy.filter(creepName=>Boolean(Game.creeps[creepName]));
    this.memory.containers = this.memory.containers.filter(id=>{
      const container = Game.getObjectById(id);
      if (container){
        this.containers.push(container);
        return true;
      }
      return false;
    });
    if (!this.containers.length){
      this.containers = anchor.pos.findInRange(FIND_STRUCTURES, 1, { //Needs to be distance 1 since controller is sometimes close to sources that will also have a container
        filter: structure=>{
          return structure.structureType === STRUCTURE_CONTAINER;
        }
      }) as StructureContainer[];
      this.memory.containers = this.containers.map(container=>container.id);
    }
  }

  // abstract get id():Id<AnchorType>|string;

  get id(){
    return this.anchor.id;
  }

  get memory():AbstractAnchorMemory{
    return (Memory.anchors[this.id] || (Memory.anchors[this.id] = {
      occupancy: [],
      containers: [],
    })) as AbstractAnchorMemory;
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

  get occupancy(){
    return this.memory.occupancy.length;
  }

  addOccupant(creepName:Creep['name']){
    this.memory.occupancy.push(creepName);
  }
}

export class CreepMineralAnchor extends CreepAnchor<Mineral>{
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
}

export interface CreepSourceAnchorMemory extends CreepAnchorMemory{
  range?:PathFinderPath;
}
export class CreepSourceAnchor extends CreepAnchor<Source, CreepSourceAnchorMemory>{
  constructor(source:Source){
    super(source);
  }

  get totalSeats(){
    if (this.memory.seats === undefined){
      this.memory.seats = countAvailableSeats(this.anchor.pos);
    }
    //We can't sustain more than 3 low level harvesters on a source
    return Math.min(this.memory.seats, 3);
  }

  get range(){
    return this.memory.range;
  }

  set range(range:CreepSourceAnchorMemory['range']){
    this.memory.range = range;
  }

  get availableSeats(){
    return this.totalSeats - this.occupancy;
  }
}

export class CreepControllerAnchor extends CreepAnchor<StructureController>{
  constructor(controller:StructureController){
    super(controller);
  }
}
