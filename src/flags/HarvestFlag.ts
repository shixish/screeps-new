import { CreepRoleName, FlagType } from "utils/constants";
import { getRoomAudit } from "utils/tickCache";
import { RemoteFlag, RemoteFlagMemory } from "./_RemoteFlag";

/* Flag name should be in the form: `harvest:${roomName}` where roomName is the name of the parent room. */
enum HarvestStatus{
  Audit,
  Harvest,
}

interface HarvestSourceData{
  // path:Record<Room['name'], string>;
  pathCost: number;
}

interface HarvestFlagMemory extends RemoteFlagMemory{
  status?: HarvestStatus;
  sourceData:Record<string, HarvestSourceData>; //Source['id']
  totalMoveCost: number;
}

export class HarvestFlag extends RemoteFlag<HarvestFlagMemory> {
  get status(){
    return this.memory.status ?? HarvestStatus.Audit;
  }

  set status(status:HarvestStatus){
    this.memory.status = status;
  }

  get sourceData(){
    return this.memory.sourceData || (this.memory.sourceData = {});
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

        let totalMoveCost = 0;
        sources.forEach(source=>{
          const path:PathFinderPath = getPathToSource(source);
          paths.push(path); //This will allow the second source to use the path drawn for the first source.
          // Room.serializePath(path);
          path.path.forEach(step=>{
            const room = Game.rooms[step.roomName];
            room.createConstructionSite(step.x, step.y, STRUCTURE_ROAD);
            room.visual.circle(step.x, step.y);
          });
          // source.stepCount = path.ops;
          this.sourceData[source.id] = { pathCost: path.cost };
          totalMoveCost += path.cost;
        });
        this.memory.totalMoveCost = totalMoveCost;
        this.status = HarvestStatus.Harvest;
      }

      const sourceCount = officeAudit.sources.length;

      this.totalNeededParts[CLAIM] = sourceCount > 1 ? 1 : 0; //don't bother claiming rooms with only 1 source...

      // 3000 energy nodes can optimially mine at 10 energy per tick, so 1500 nodes are 5 per tick
      const energyPerTick = sourceCount*(officeAudit.controller?.anchor.my?10:5);
      const roundTrip = this.memory.totalMoveCost*2; //ticks
      this.totalNeededParts[CARRY] = (roundTrip*energyPerTick)/50;

      const constructionProgress = officeAudit.constructionSites.reduce((out, structure)=>out + (structure.progressTotal-structure.progress), 0);
      const repairableHits = this.office!.find(FIND_STRUCTURES, {
        filter: structure=>{
          return structure.structureType === STRUCTURE_ROAD || structure.structureType === STRUCTURE_CONTAINER
        }
      }).reduce((out, structure)=>out + (structure.hitsMax-structure.hits), 0);

      /* One WORK use 1 energy/tick:
        - build at 5 points/tick
        - repair at 100 hits/tick
      */
      // 1500 ticks is how long a creep will live. It's ok to be a little wasteful if it gets the job done faster.

      //Recall that building on swamp costs a lot more so the cost isn't just a function of distance.
      const buildWork = constructionProgress && (constructionProgress/5)/500; //500 indicates that we will be up to 3 (1500/500=3) times inefficient when initially building
      const repairWork = repairableHits && (repairableHits/100)/1500; //Maximally efficient for repairing roads since it's not urgent.
      this.totalNeededParts[WORK] = Math.ceil(Math.min(buildWork + repairWork, energyPerTick));

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
    // console.log(`this.getNeededParts(CARRY)`, this.getNeededParts(CARRY));
    // console.log(`this.getNeededParts(WORK)`, this.getNeededParts(WORK));
    // console.log(`this.followerParts`, JSON.stringify(this.followerParts));
    // console.log(`this.totalNeededParts`, JSON.stringify(this.totalNeededParts));
  }
}
