import { CreepRoleName, FlagType } from "utils/constants";
import { getRoomAudit } from "utils/tickCache";
import { RemoteFlag, RemoteFlagMemory } from "./_RemoteFlag";

/* Flag name should be in the form: `harvest:${roomName}` where roomName is the name of the parent room. */
enum HarvestStatus{
  Audit,
  Harvest,
}

interface HarvestFlagMemory extends RemoteFlagMemory{

}

export class HarvestFlag extends RemoteFlag<HarvestFlagMemory> {
  type!: FlagType.Harvest;

  get status(){
    return this.memory.status as HarvestStatus ?? HarvestStatus.Audit;
  }

  set status(status:HarvestStatus){
    this.memory.status = status;
  }

  auditOffice(){
    const officeAudit = this.office && getRoomAudit(this.office);
    if (officeAudit){

      if (this.status === HarvestStatus.Audit){
        const homeAudit = getRoomAudit(this.home);

        const exit = this.office?.findExitTo(this.home) as ExitConstant;
        const getExitRange = (source:CreepSourceAnchor)=>source.anchor.pos.findClosestByRange(exit)!.getRangeTo(source);
        //Sort the sources by range to the exit that connects rooms. This way we build the road to the closest one first, then leverage that road when connecting to the second source.
        const sources = officeAudit.sources.sort((a, b)=>getExitRange(a) - getExitRange(b));

        const paths:PathFinderPath[] = [];
        const getPathToSource = (source:CreepSourceAnchor)=>{
          return PathFinder.search(homeAudit.center, {
            pos: source.pos,
            range: 1,
          }, {
            //Prefer roads which use weight 1
            plainCost: 2,
            swampCost: 2,
            roomCallback: function(roomName) {
              const room = Game.rooms[roomName];
              if (!room) return false; //PathFinder supports searches which span multiple rooms
              const costs = new PathFinder.CostMatrix;

              room.find(FIND_STRUCTURES).forEach(function(structure) {
                if (structure.structureType === STRUCTURE_ROAD) {
                  // Favor roads over plain tiles
                  costs.set(structure.pos.x, structure.pos.y, 1);
                } else if (structure.structureType !== STRUCTURE_RAMPART || !structure.my) {
                  costs.set(structure.pos.x, structure.pos.y, 0xff);
                }
              });

              paths.forEach(path=>{
                path.path.forEach(step=>{
                  costs.set(step.x, step.y, 1); //Prefer to reuse previous paths
                });
              });

              //This doesn't exactly work since the new construction sites don't exist until the next tick.
              room.find(FIND_MY_CONSTRUCTION_SITES).forEach(function(site) {
                if (site.structureType === STRUCTURE_ROAD) {
                  costs.set(site.pos.x, site.pos.y, 1);
                } else if (site.structureType !== STRUCTURE_RAMPART) {
                  costs.set(site.pos.x, site.pos.y, 0xff);
                }
              });
              return costs;
            },
          });
        };

        sources.forEach(source=>{
          const path = getPathToSource(source);
          paths.push(path); //This will allow the second source to use the path drawn for the first source.
          // Room.serializePath(path);
          path.path.forEach(step=>{
            const room = Game.rooms[step.roomName];
            room.createConstructionSite(step.x, step.y, STRUCTURE_ROAD);
            room.visual.circle(step.x, step.y);
          });
        });
        this.status = HarvestStatus.Harvest;
      }


      const sourceCount = officeAudit.sources.length;
      /*
      TODO: Instead of specifying how many of a particular creep to spawn like this I should specify the capacity of the room somehow.
      The problem is that this doesn't account for creep tiers, so it does the right job but doesn't bake in a sense of proper scale.

      Maybe just specify custom creep parts/tier in here and feed it into a creep role to control the logic.
      */
      this.maxFollowersByRole[CreepRoleName.RemoteHarvester] = sourceCount;
      this.maxFollowersByRole[CreepRoleName.RemoteCourier] = sourceCount*2;
    }else{
      this.maxFollowersByRole[CreepRoleName.RemoteHarvester] = 1;
      this.maxFollowersByRole[CreepRoleName.RemoteCourier] = 2;
    }
  }

  // auditPaths(){
  //   if (this.office){
  //     const roomAudit = getRoomAudit(this.home);
  //     // roomAudit.storage
  //   }
  // }

  // getHarvesterMax(roomAudit:RoomAudit){
  //   if (this.home.name !== roomAudit.room.name) return 0;
  //   //Office room may not initially have vision
  //   const sourceCount = this.office?.find(FIND_SOURCES).length || 1;
  //   const currentCreepCount = this.followerRoleCounts[CreepRoleName.RemoteHarvester] || 0;
  //   //One creep per source in the office room
  //   return Math.max(sourceCount-currentCreepCount, 0);
  // }

  work() {

  }
}
