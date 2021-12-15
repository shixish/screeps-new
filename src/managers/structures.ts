import { SpawnController } from "structures/SpawnController";
import { TowerController } from "structures/TowerController";

export const manageStructures = ()=>{
  for (const id in Game.structures) {
    const structure = Game.structures[id];
    // "extension" | "rampart" | "road" | "spawn" | "link" | "constructedWall" | "storage" | "tower" | "observer" | "powerSpawn" | "extractor" | "lab" | "terminal" | "container" | "nuker" | "factory" | "keeperLair" | "controller" | "powerBank" | "portal" | "invaderCore"
    // console.log('structure', Object.keys(structure));
    try{
      if (structure instanceof StructureSpawn){
        const spawn = new SpawnController(structure);
        spawn.work();
      }else if (structure instanceof StructureTower){
        const tower = new TowerController(structure);
        tower.work();
      }
    }catch(e:any){
      console.log('structure error', e, e.stack);
    }
  }
}
