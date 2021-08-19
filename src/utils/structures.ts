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
    }catch(e){
      console.log('structure error', e);
    }
    // if (structure_controllers[type]) {
    //   let structures = memory.structures[type];
    //   let StructureController = structure_controllers[type];
    //   for (let s in structures) {
    //     let id = structures[s];
    //     let structureDiag = debug.diag(["structure." + type, room.name + "." + type]);
    //     try {
    //       let controller = new StructureController(id);
    //     } catch (e) {
    //       if (e === "Invalid Object ID") {
    //         delete memory.structures[type][id];
    //       } else {
    //         console.log(e);
    //       }
    //     }
    //     structureDiag.stop();
    //   }
    // }
  }
}
