import { CreepRoleName, FlagType } from "utils/constants";

if (!Memory.flags) Memory.flags = {} as Memory['flags']; //Flags object isn't initialized by default

export abstract class BasicFlag {
  flag: Flag;
  type: FlagType;
  suffix: string | undefined;
  followerRoleCounts = {} as Record<CreepRoleName, number|undefined>;

  constructor(flag: Flag, type: FlagType, suffix?: string) {
    this.flag = flag;
    this.type = type;
    this.suffix = suffix;
    this.memory.followers = this.memory.followers.filter(creepName => {
      const creep = Game.creeps[creepName];
      if (creep){
        this.followerRoleCounts[creep.memory.role] = (this.followerRoleCounts[creep.memory.role] || 0) + 1;
        return true;
      }
      return false;
    });
  }

  abstract work(options?: string): void;

  get name() {
    return this.flag.name;
  }

  get pos() {
    return this.flag.pos;
  }

  get roomName() {
    return this.flag.pos.roomName;
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

  get memory():FlagMemory {
    return Memory.flags[this.flag.name] || (Memory.flags[this.flag.name] = {
      followers: [],
    });
  }

  remove() {
    this.flag.remove();
    delete Memory.flags[this.flag.name];
  }
}
