// var _ = require('lodash');
// var profiler = require('screeps-profiler');

// // This line monkey patches the global prototypes.
// profiler.enable();

export const DEBUG = true;

export const PART_COST = {
  [MOVE]: 50,
  [WORK]: 100,
  [CARRY]: 50,
  [ATTACK]: 80,
  [RANGED_ATTACK]: 150,
  [HEAL]: 250,
  [CLAIM]: 600,
  [TOUGH]: 10,
} as const;

export enum FlagType{
  Claim = 'claim',
  Build = 'build',
  Audit = 'audit',
  Power = 'power',
};
export const FlagTypes = Object.values(FlagType);
export enum CreepRoleName{
  Basic = 'basic',
  Harvester = 'harvester', //Source
  Miner = 'miner', //Minerals
  Courier = 'courier',
  Mover = 'mover',
  Upgrader = 'upgrader',
  Claimer = 'claimer',
  RemoteWorker = 'remote',
};
export const CreepRoleNames = Object.values(CreepRoleName);

export const USERNAME = 'ShiXish';
export const MIN_TICKS_TO_LIVE = 500;
export const MAX_UNITS_METRIC = 3;
// export const MAX_HITS_REPAIR = 1000000;
export const MAX_COST = 3000;
export const PART_COSTS = PART_COST;
export const MAX_MINERALS_IN_STORE = 0.25;//%
export const ALL_CLEAR_AFTER = 250;//game ticks till we look for changes to structure counts after an attack

export const SOURCE_STORAGE_FILL = 300000;
export const MINERALS_STORAGE_FILL = 300000;
export const maxStorageFill = (resourceType:ResourceConstant)=>{
  switch(resourceType){
    case RESOURCE_ENERGY:
      return SOURCE_STORAGE_FILL;
    default:
      return MINERALS_STORAGE_FILL;
  }
};

//Towers will continue to repair as long as storage is above this percentage of the max fill.
export const TOWER_REPAIR_STORAGE_MIN = SOURCE_STORAGE_FILL*0.75;
export const UPGRADER_STORAGE_MIN = SOURCE_STORAGE_FILL*0.5;
