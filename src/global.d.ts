import { SpawnController } from "structures/SpawnController";
import { RoomSource } from "managers/room";

declare global {
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

  // type RoomObjectWithId = ConstructionSite|Creep|Resource<RESOURCE_ENERGY>|Mineral|Deposit|Nuke|Resource|Source|Structure|Terrain|Tombstone|PowerCreep|Ruin;

  interface Memory {
    // uuid: number;
    // log: any;
    paths: any;
    sources: {[name: string]: SourceMemory};
    anchors: {[name: string]: SourceMemory};
  }

  interface SourceMemory{
    seats:number;
    occupancy:Creep['name'][];
  }

  type SpawnerCounts = {
    controllerLevel: number;
    sources: number;
  };

  interface Target{
    id?: Id<RoomObject>;
    roomName?: Room['name'];
    flagName?: Flag['name'];
  }
  type TargetableTypes = RoomObject|Flag|null;
  type TargetTypes = Target|null;
  // const ActionCallback:(storedTarget:TargetConstant)=>TargetConstant;

  interface CreepAnchor extends RoomObject{
    id: Id<RoomObject>;
    addOccupant?: (creepName:Creep['name'])=>void;
  }

  type CreepRole = {
    authority:number,
    // max: (roomAudit:RoomAudit)=>number,
    tiers: CreepTier[],
    modSpawnOptions?:(roomAudit:RoomAudit, options:MandateProps<SpawnOptions, 'memory'>, spawner:SpawnController)=>void;
    getCreepAnchor?:(roomAudit:RoomAudit, room:Room)=>CreepAnchor|undefined;
  };
  // interface CreepRoles{
  //   basic: CreepRole;
  //   miner: CreepRole;
  //   courier: CreepRole;
  // }
  type CreepRoleName = 'basic'|'miner'|'courier'|'mover'|'upgrader';
  interface CreepMemory {
    role: CreepRoleName;

    // targetRoom?: Room['name'];
    anchor?: Id<RoomObject>;
    target?: Target;
    action?: string;

    home?: Room['name'];
    office?: Room['name'];

    counts: {
      [key in BodyPartConstant]?: number
    }
  }

  type CreepTier = {
    cost: number,
    body: BodyPartConstant[];
    max: (roomAudit:RoomAudit)=>number,
  }

  interface SpawnMemory {
    sourceCount?: number;
  }

  interface RoomAudit{
    controllerLevel: number,
    sources:RoomSource[],
    // sourceCount: number,
    sourceSeats: number,
    creeps: Creep[],
    creepCountsByRole: Record<CreepRoleName, number>
  }

  interface RoomMemory{
    // structures:string[];
    sources?: Id<Source>[];
    sourceCount: number,
    sourceSeats: number, //How many standing locations around sources within the room
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
