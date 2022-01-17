import { CreepRoleName, FlagType } from "utils/constants";
// import { SpawnController } from "structures/SpawnController";
// import { CreepAnchor, CreepControllerAnchor, CreepMineralAnchor, CreepSourceAnchor } from "utils/CreepAnchor";

declare global {
  type CreepAnchor = import('utils/CreepAnchor').CreepAnchor;
  type CreepControllerAnchor = import('utils/CreepAnchor').CreepControllerAnchor;
  type CreepMineralAnchor = import('utils/CreepAnchor').CreepMineralAnchor;
  type CreepSourceAnchor = import('utils/CreepAnchor').CreepSourceAnchor;

  type SpawnController = import('structures/SpawnController').SpawnController;
  type BasicFlag = import('flags/_BasicFlag').BasicFlag;
  type RoomAudit = import('managers/room').RoomAudit;

  type FlagManagers = typeof import('managers/flags').FlagManagers;
  type FlagManagerTypes = InstanceType<FlagManagers[FlagType]>;
  // type FlagManagerTypes = InstanceType<typeof import('managers/flags').FlagManagers[FlagType]>;

//   /*
//     Example types, expand on these or remove them and add your own.
//     Note: Values, properties defined here do no fully *exist* by this type definiton alone.
//           You must also give them an implemention if you would like to use them. (ex. actually setting a `role` property in a Creeps memory)

//     Types added in this `global` block are in an ambient, global context. This is needed because `main.ts` is a module file (uses import or export).
//     Interfaces matching on name from @types/screeps will be merged. This is how you can extend the 'built-in' interfaces from @types/screeps.
//   */
//   // Memory extension samples

  type MandateProps<T extends {}, K extends keyof T> = Omit<T, K> & {
    [MK in K]-?: NonNullable<T[MK]>
  }

  // function assumeType<T extends (...args: any) => any>(x: unknown): asserts x is ReturnType<T>;

  interface StructureWithStore extends Structure{
    store: Store<ResourceConstant, false>;
  }

  // type RoomObjectWithId = ConstructionSite|Creep|Resource<RESOURCE_ENERGY>|Mineral|Deposit|Nuke|Resource|Source|Structure|Terrain|Tombstone|PowerCreep|Ruin;

  interface Memory {
    // uuid: number;
    // log: any;
    paths: any;
    sources: {[name: string]: SourceMemory};
    anchors: {[name: string]: AnchorMemory};
  }

  interface AnchorMemory{
    seats?: number;
    containers: Id<StructureContainer>[];
    occupancy:Creep['name'][];
  }

  interface SourceMemory{
    seats: number;
    occupancy: Creep['name'][];
  }

  interface FlagMemory{
    room?: Room['name'];
    followers: Creep['name'][];
    status?: number;
  }

  type SpawnerCounts = {
    controllerLevel: number;
    sources: number;
  };

  interface Target{
    id?: Id<RoomObject>;
    flagName?: Flag['name'];
    pos?:{
      x: number,
      y: number,
      roomName: Room['name'],
    },
  }
  type TargetableTypes = RoomObject|RoomPosition|Flag|null;
  type TargetTypes = Target|null;
  // const ActionCallback:(storedTarget:TargetConstant)=>TargetConstant;

  type CreepRole = {
    authority:number,
    max?: (roomAudit:RoomAudit)=>number,
    tiers: CreepTier[],
    // modSpawnOptions?:(roomAudit:RoomAudit, options:MandateProps<SpawnOptions, 'memory'>, spawner:SpawnController)=>void;
    getCreepFlag?:(roomAudit:RoomAudit)=>BasicFlag|undefined;
    getCreepAnchor?:(roomAudit:RoomAudit)=>CreepAnchor|undefined;
    meta?:any;
  };

  type CreepTier = {
    cost: number,
    requires?: (roomAudit:RoomAudit)=>boolean,
    max?: (roomAudit:RoomAudit)=>number,
    body: BodyPartConstant[];
  }

  // interface CreepRoles{
  //   basic: CreepRole;
  //   miner: CreepRole;
  //   courier: CreepRole;
  // }

  // type CreepRoleType = keyof typeof CreepRoles;

  interface CreepMemory {
    role: CreepRoleName;

    // targetRoom?: Room['name'];
    anchor?: Id<RoomObject>
    seated?: boolean;
    flag?: BasicFlag['name'];
    target?: Target;
    action?: string;

    home?: Room['name'];
    office?: Room['name'];

    counts: {
      [key in BodyPartConstant]?: number
    }
  }

  interface SpawnMemory {
    sourceCount?: number;
  }

  interface RoomObjectWithStore extends RoomObject{
    id: Id<RoomObject>,
    store: StoreDefinition,
  }

  // interface RoomAudit{
  //   name:Room['name'],
  //   controller?:CreepControllerAnchor,
  //   controllerLevel:number,
  //   storedEnergy:number,
  //   mineral?:CreepMineralAnchor,
  //   storedMineral:number,
  //   sources:CreepSourceAnchor[],
  //   // sourceCount: number,
  //   sourceSeats:number,
  //   creeps:Creep[],
  //   creepCountsByRole:Record<CreepRoleType, number>,
  //   // creepQueue:
  //   hostileCreeps:Creep[],
  //   flags:Record<FlagType, FlagManager[]>,
  //   constructionSites:ConstructionSite[],
  // }

  interface RoomMemory{
    // structures:string[];
    sources: Id<Source>[];
    mineral: Id<Mineral>|null;
    buildStage?: number;

    // sources: {
    //   [id:string]:any
    // }
  }

//   // Syntax for adding proprties to `global` (ex "global.log")
//   namespace NodeJS {
//     interface Global {
//       log: any;
//     }
//   }
}

declare var _: _.LoDashStatic;

export {};
