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
export type GenericAnchorType = Source|Mineral|Structure;
export class CreepAnchor<AnchorType extends GenericAnchorType = GenericAnchorType>{
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

  get memory():AnchorMemory{
    return Memory.anchors[this.id] || (Memory.anchors[this.id] = {
      seats: countAvailableSeats(this.anchor.pos),
      occupancy: [],
      containers: [],
    });
  }

  get occupancy(){
    return this.memory.occupancy.length;
  }

  get totalSeats(){
    return this.memory.seats;
  }

  get availableSeats(){
    return this.totalSeats - this.occupancy;
  }

  addOccupant(creepName:Creep['name']){
    this.memory.occupancy.push(creepName);
  }
}

// export class CreepObjectAnchor<AnchorType extends Source|Structure = Source|Structure> extends CreepAnchor<AnchorType>{
//   constructor(anchor:AnchorType){
//     super(anchor);
//     this.memory.containers = this.memory.containers.filter(id=>{
//       const container = Game.getObjectById(id);
//       if (container){
//         this.containers.push(container);
//       }
//       return false;
//     });
//     if (!this.containers.length){
//       this.containers = anchor.pos.findInRange(FIND_STRUCTURES, 1, {
//         filter: structure=>{
//           return structure.structureType === STRUCTURE_CONTAINER;
//         }
//       }) as StructureContainer[];
//       this.memory.containers = this.containers.map(container=>container.id);
//     }
//   }

//   get id(){
//     return this.anchor.id;
//   }
// }
// export class CreepFlagAnchor extends CreepAnchor<FlagManager>{

// }
