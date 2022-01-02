import { FlagType } from "utils/constants";
import { FlagManagers } from "../managers/flags";

export abstract class FlagManager {
  flag: Flag;
  type: FlagType;
  suffix: string | undefined;

  constructor(flag: Flag, type: FlagType, suffix?: string) {
    this.flag = flag;
    this.type = type;
    this.suffix = suffix;
    this.memory.followers = this.memory.followers.filter(creepName => Boolean(Game.creeps[creepName]));
  }
  // static fromFlagName(flagName: Flag['name']) {
  //   return this.fromFlag(Game.flags[flagName]);
  // }
  // static fromFlag(flag?: Flag) {
  //   if (!flag)
  //     return;
  //   const [flagType, options] = flag.name.split(':', 2) as [FlagType, string];
  //   if (flagType in FlagManagers) {
  //     return new FlagManagers[flagType](flag, flagType, options);
  //   }
  //   return;
  //   // throw 'Invalid flag type given to FlagManager.fromFlag';
  // }

  abstract work(options?: string): void;

  get name() {
    return this.flag.name;
  }

  get pos() {
    return this.flag.pos;
  }

  get room() {
    return this.flag.room!;
  }

  get followers() {
    return this.memory.followers;
  }

  addFollower(creepName: Creep['name']) {
    this.memory.followers.push(creepName);
  }

  get memory() {
    return Memory.flags[this.flag.name] || (Memory.flags[this.flag.name] = {
      followers: [],
    });
  }

  remove() {
    this.flag.remove();
    delete Memory.flags[this.flag.name];
  }
}
