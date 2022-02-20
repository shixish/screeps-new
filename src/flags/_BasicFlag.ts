import { CreepRoleName, FlagType } from "utils/constants";
import { getRoomAudit } from "utils/tickCache";

if (!Memory.flags) Memory.flags = {} as Memory['flags']; //Flags object isn't initialized by default

export interface BasicFlagMemory extends FlagMemory{
  followers: Creep['name'][];
}

export abstract class BasicFlag<AbstractFlagMemory extends BasicFlagMemory = BasicFlagMemory> {
  flag: Flag;
  type: FlagType;
  suffix: string | undefined;
  homeRoomAudit!:RoomAudit;

  followerRoleCounts = {} as Partial<Record<CreepRoleName, number>>;
  maxFollowersByRole = {} as Partial<Record<CreepRoleName, number>>;
  currentBodyPartsByRole = {} as {[key in CreepRoleName]?: CreepMemory['parts']};
  requestedBodyPartsByRole = {} as {[key in CreepRoleName]?: CreepMemory['parts']};

  constructor(flag: Flag, type: FlagType, suffix?: string) {
    this.flag = flag;
    this.type = type;
    this.suffix = suffix;
    this.memory.followers = this.memory.followers.filter(creepName => {
      const creep = Game.creeps[creepName];
      if (creep){
        this.countCreep(creepName);
        return true;
      }
      return false;
    });
    const roomAudit = getRoomAudit(this.home);
    (roomAudit.flags[this.type] as BasicFlag[]).push(this);
    this.homeRoomAudit = roomAudit;
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

  private countCreep(creepName: Creep['name']){
    const { role, parts } = Memory.creeps[creepName];
    this.followerRoleCounts[role] = (this.followerRoleCounts[role] || 0) + 1;
    if (!this.currentBodyPartsByRole[role]) this.currentBodyPartsByRole[role] = {};
    for (let type in parts){
      this.currentBodyPartsByRole[role]![type as BodyPartConstant] = (this.currentBodyPartsByRole[role]![type as BodyPartConstant] || 0) + (parts[type as BodyPartConstant] || 0);
    }
  }

  getAvailableFollowersByRole(creepRole:CreepRoleName){
    const max = this.maxFollowersByRole[creepRole];
    const count = this.followerRoleCounts[creepRole] || 0;
    return max !== undefined ? Math.max(max-count, 0) : 0;
  }

  addFollower(creepName: Creep['name']) {
    const creepMemory = Memory.creeps[creepName];
    creepMemory.flag = this.name;
    this.countCreep(creepName);
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
