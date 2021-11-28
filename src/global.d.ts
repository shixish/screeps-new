import { SpawnController } from "structures/SpawnController";

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

  interface Memory {
    // uuid: number;
    // log: any;
    paths: any;
  }

  type SpawnerCounts = {
    controllerLevel: number;
    sources: number;
  };

  type CreepRole = {
    authority:number,
    // max: (roomAudit:RoomAudit)=>number,
    tiers: CreepTier[],
    modSpawnOptions?:(options:MandateProps<SpawnOptions, 'memory'>, spawner:SpawnController)=>void,
  };
  // interface CreepRoles{
  //   basic: CreepRole;
  //   miner: CreepRole;
  //   courier: CreepRole;
  // }
  type CreepRoleName = 'basic'|'miner'|'courier';
  interface CreepMemory {
    role: CreepRoleName;

    targetId?: Id<RoomObject>;
    action?: string;

    // home: string;
    // office: string;

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
    sourceCount: number,
    sourceSeats: number,
    creeps: Creep[],
    creepCountsByRole: Record<CreepRoleName, number>
  }

  interface RoomMemory{
    // structures:string[];
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
