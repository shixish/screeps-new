import { CreepRoleName, FlagType } from "utils/constants";
import { getRoomAudit } from "utils/tickCache";

if (!Memory.flags) Memory.flags = {} as Memory['flags']; //Flags object isn't initialized by default

export interface BasicFlagMemory extends FlagMemory{
  followers: Creep['name'][];
  status?: number;
}

export abstract class BasicFlag<AbstractFlagMemory extends BasicFlagMemory = BasicFlagMemory> {
  flag: Flag;
  type: FlagType;
  suffix: string | undefined;
  followerRoleCounts = {} as Partial<Record<CreepRoleName, number>>;
  maxFollowersByRole = {} as Partial<Record<CreepRoleName, number>>;

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
    this.updateRoomAudit();
  }

  updateRoomAudit(){
    const roomAudit = getRoomAudit(this.home);
    (roomAudit.flags[this.type] as BasicFlag[]).push(this);
  }

  abstract work(): void;

  get name() {
    return this.flag.name;
  }

  get pos() {
    return this.flag.pos;
  }

  get roomName() {
    return this.flag.pos.roomName;
  }

  get home() {
    //Basic flags can only be placed within their home room.
    return this.flag.room!;
  }

  get followers() {
    return this.memory.followers;
  }

  getAvailableFollowersByRole(creepRole:CreepRoleName){
    const max = this.maxFollowersByRole[creepRole];
    const count = this.followerRoleCounts[creepRole] || 0;
    return max !== undefined ? Math.max(max-count, 0) : 0;
  }

  addFollower(creepRole:CreepRoleName, creepName: Creep['name']) {
    this.followerRoleCounts[creepRole] = (this.followerRoleCounts[creepRole] || 0) + 1;
    this.memory.followers.push(creepName);
  }

  get memory():AbstractFlagMemory {
    return (Memory.flags[this.flag.name] || (Memory.flags[this.flag.name] = {
      followers: [],
    })) as AbstractFlagMemory;
  }

  remove() {
    this.flag.remove();
    delete Memory.flags[this.flag.name];
  }
}
