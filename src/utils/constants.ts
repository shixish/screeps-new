// var _ = require('lodash');
// var profiler = require('screeps-profiler');

// // This line monkey patches the global prototypes.
// profiler.enable();

export const PartCosts = {
  [MOVE]: 50,
  [WORK]: 100,
  [CARRY]: 50,
  [ATTACK]: 80,
  [RANGED_ATTACK]: 150,
  [HEAL]: 250,
  [CLAIM]: 600,
  [TOUGH]: 10,
} as const;

export type SpawnerCounts = {
  controllerLevel: number;
  sources: number;
};
export type CreepRole = {
  max: (counts:SpawnerCounts)=>number,
  tiers: CreepTier[]
};

export const CreepRoles:{ [role:string]: CreepRole } = {
  basic: {
    max: (counts)=>{
      switch(counts.controllerLevel){
        case 1:
        case 2:
          return counts.sources * 5;
        // case 3:
        //   return counts.sources;
        default:
          return 4;
      }
    },
    tiers: [
      {
        cost: 300,
        body: [WORK, MOVE, CARRY, MOVE, CARRY]
      },
      {
        cost: 400,
        body: [WORK, MOVE, CARRY, WORK, MOVE, CARRY]
      },
      {
        cost: 550,
        body: [WORK, MOVE, CARRY, WORK, MOVE, CARRY, WORK, CARRY]
      }
    ]
  },
  miner: {
    max: (counts)=>counts.sources,
    tiers: [
      {
        cost: 550,
        body: [WORK, WORK, WORK, WORK, WORK, MOVE]
      }
    ]
  },
  courier: {
    max: (counts)=>counts.sources,
    tiers: [
      {
        cost: 250,
        body: [
          CARRY, MOVE,
          CARRY, MOVE,
          MOVE
        ]
      }
    ],
    // tiers: [
    //   {
    //     cost: 550,
    //     body: [
    //       CARRY, MOVE,
    //       CARRY, MOVE,
    //       CARRY, MOVE,
    //       CARRY, MOVE,
    //       CARRY, MOVE,
    //       CARRY
    //     ]
    //   }
    // ]
  }
};

// export const Roles = [];

export const USERNAME = 'ShiXish';
export const MIN_TICKS_TO_LIVE = 500;
export const MAX_UNITS_METRIC = 3;
// export const MAX_HITS_REPAIR = 1000000;
export const MAX_COST = 3000;
export const PART_COSTS = PartCosts;
export const MAX_MINERALS_IN_STORE = 0.25;//%
export const ALL_CLEAR_AFTER = 250;//game ticks till we look for changes to structure counts after an attack
