import { CreepRoleName } from "./constants";

export default class SpawnableCreep{
  role:CreepRoleName;
  anchor?:CreepAnchor;
  flag?:BasicFlag;
  tier?:CreepTier;

  constructor(role:CreepRoleName, anchor?:CreepAnchor, flag?:BasicFlag){
    this.role = role;
    this.anchor = anchor;
    this.flag = flag;
  }
}
