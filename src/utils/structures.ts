import { SpawnController } from "structures/Spawn";

export const manageStructures = ()=>{
  for (const id in Game.structures) {
    const structure = Game.structures[id];
    // "extension" | "rampart" | "road" | "spawn" | "link" | "constructedWall" | "storage" | "tower" | "observer" | "powerSpawn" | "extractor" | "lab" | "terminal" | "container" | "nuker" | "factory" | "keeperLair" | "controller" | "powerBank" | "portal" | "invaderCore"
    // console.log('structure', Object.keys(structure));
    if (structure instanceof StructureSpawn){
      const spawn = new SpawnController(structure)
      spawn.work();
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
