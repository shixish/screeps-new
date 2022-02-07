import { ACTIVE_PARTS, FlagType } from "utils/constants";
import { getRoomAudit } from "utils/tickCache";
import { BasicFlag, BasicFlagMemory } from "./_BasicFlag";

export interface RemoteFlagMemory extends BasicFlagMemory{
  home: Room['name'];
}

export abstract class RemoteFlag<AbstractFlagMemory extends RemoteFlagMemory = RemoteFlagMemory> extends BasicFlag<AbstractFlagMemory> {
  /* Flag name should be in the form: `${flag.type}:${room.name}` where room is the parent (spawner) room. */
  totalNeededParts = ACTIVE_PARTS.reduce((out, part)=>{
    out[part] = 0;
    return out;
  }, {} as Record<typeof ACTIVE_PARTS[number], number>);

  followerParts = ACTIVE_PARTS.reduce((out, part)=>{
    out[part] = 0;
    return out;
  }, {} as Record<typeof ACTIVE_PARTS[number], number>);

  constructor(flag: Flag, type: FlagType, suffix?: string) {
    super(flag, type, suffix);
    this.followers.forEach(followerName=>{
      const { counts } = Memory.creeps[followerName];
      ACTIVE_PARTS.forEach(part=>{
        this.followerParts[part] += (counts[part] || 0);
      });
    });
    this.auditOffice();
    const roomAudit = getRoomAudit(this.home);
    (roomAudit.flags[type] as BasicFlag[]).push(this);
  }

  updateRoomAudit(){
    const roomAudit = getRoomAudit(this.home);
    (roomAudit.flags[this.type] as BasicFlag[]).push(this);
  }

  abstract auditOffice(): void;

  get home():Room{
    let home:Room|undefined;
    if (this.memory.home){
      home = Game.rooms[this.memory.home];
    }else if (this.suffix){
      const roomName = this.suffix.split(':', 2)[0];
      home = Game.rooms[roomName];
      if (home){
        this.memory.home = roomName;
      }
    }
    if (!home) throw `Flag [${this.flag.name}] error: home isn't defined.`;
    return home;
  }

  get office(){
    return this.flag.room;
  }

  get roomName(){
    //This works even if this.flag.room doesn't exist yet. (Don't have vision)
    return this.flag.pos.roomName;
  }

  getNeededParts(part:typeof ACTIVE_PARTS[number]){
    return this.totalNeededParts[part] - this.followerParts[part];
  }

  // work() {
  //   const office = this.flag.room;
  //   const roomAudit = getRoomAudit(this.home);
  //   roomAudit.flags[this.type].push(this);
  // }
}
