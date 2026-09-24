import { assert } from "chai";
import {
  FATIGUE_HEAT_COOL_AMOUNT,
  FATIGUE_HEAT_COOL_INTERVAL,
  FatigueHeatMap,
  addFatigueHeat,
  coolFatigueHeat,
  coolFatigueHeatMap,
  drawFatigueHeat,
  fatigueHeatColor,
  processFatigueHeat,
  sampleFatigueHeat
} from "../../src/utils/fatigueHeat";
import { packRoadPos } from "../../src/utils/earlyEconomy";

const globals = global as any;

interface Text{ text:string; x:number; y:number; style:any }

/*
  The heatmap only touches room.memory and room.visual.text, so the fake is thin - but it also records
  createConstructionSite, because "this layer places nothing" is a behaviour worth a test rather than a
  comment.
*/
function fakeRoom(name = "W1N4") {
  const texts: Text[] = [];
  const sites: { x: number; y: number; structureType: string }[] = [];
  const memory: any = {};
  const room = {
    name,
    memory,
    createConstructionSite: (x: number, y: number, structureType: string) => {
      sites.push({ x, y, structureType });
      return globals.OK;
    },
    visual: {
      text: (text: string, x: number, y: number, style: any) => texts.push({ text, x, y, style })
    }
  };
  return { room, texts, sites, memory };
}

const creep = (x: number, y: number, fatigue: number, roomName = "W1N4", my = true) => ({
  my,
  fatigue,
  pos: { x, y },
  room: { name: roomName }
});

const heatAt = (heat: FatigueHeatMap, x: number, y: number) => heat[String(packRoadPos(x, y))];

describe("fatigue heat accumulation", () => {
  beforeEach(() => {
    globals.OK = 0;
    globals.Game = { time: 0, creeps: {} };
  });

  it("adds the live fatigue timer and accumulates across ticks", () => {
    const heat: FatigueHeatMap = {};
    //One swamp step by a loaded 1:1 courier: 50 fatigue, then the timer counts itself down.
    assert.equal(addFatigueHeat(heat, 10, 10, 50), 50);
    assert.equal(addFatigueHeat(heat, 10, 10, 40), 90);
    assert.equal(addFatigueHeat(heat, 10, 10, 30), 120);
    assert.equal(heatAt(heat, 10, 10), 120);
  });

  it("never leaves a key behind for a creep that isn't paying fatigue", () => {
    const heat: FatigueHeatMap = {};
    assert.equal(addFatigueHeat(heat, 10, 10, 0), 0);
    assert.isEmpty(Object.keys(heat));
  });

  it("samples only our own fatigued creeps standing in this room, off the rim", () => {
    const { room, memory } = fakeRoom();
    globals.Game.creeps = {
      laden: creep(10, 10, 50),
      rested: creep(11, 10, 0), //Spare MOVE for this terrain: says nothing about the tile.
      away: creep(12, 10, 20, "W2N4"), //Fatigued, but not in this room.
      hostile: creep(13, 10, 20, "W1N4", false), //Never learn desire lines from somebody else's fleet.
      rim: creep(0, 25, 20) //The rim can't hold a structure, so it can never be road work.
    };
    assert.equal(sampleFatigueHeat(room as any), 1);
    assert.deepEqual(memory.fatigueHeat, { [String(packRoadPos(10, 10))]: 50 });
  });
});

describe("fatigue heat cooling", () => {
  beforeEach(() => {
    globals.OK = 0;
    globals.Game = { time: 0, creeps: {} };
  });

  it("subtracts the same amount from every tile and drops the ones that hit zero", () => {
    const heat: FatigueHeatMap = {
      [String(packRoadPos(10, 10))]: 100,
      [String(packRoadPos(11, 10))]: FATIGUE_HEAT_COOL_AMOUNT, //Exactly cooled out this pass.
      [String(packRoadPos(12, 10))]: FATIGUE_HEAT_COOL_AMOUNT + 1
    };
    assert.equal(coolFatigueHeatMap(heat), 1);
    assert.equal(heatAt(heat, 10, 10), 100 - FATIGUE_HEAT_COOL_AMOUNT);
    assert.isUndefined(heatAt(heat, 11, 10));
    assert.equal(heatAt(heat, 12, 10), 1);
  });

  it("fades a tile all the way back to empty without traffic", () => {
    const heat: FatigueHeatMap = { [String(packRoadPos(10, 10))]: 150 };
    //A single laden swamp crossing (~150) is gone inside ~10 passes, so ~250 ticks of quiet clears it.
    let passes = 0;
    while (Object.keys(heat).length && passes < 100){
      coolFatigueHeatMap(heat);
      passes++;
    }
    assert.equal(passes, Math.ceil(150/FATIGUE_HEAT_COOL_AMOUNT));
    assert.isEmpty(Object.keys(heat));
  });

  it("is throttled and drops the whole map once the last tile cools out", () => {
    const { room, memory } = fakeRoom();
    memory.fatigueHeat = { [String(packRoadPos(10, 10))]: FATIGUE_HEAT_COOL_AMOUNT };
    globals.Game.time = FATIGUE_HEAT_COOL_INTERVAL + 1;
    assert.equal(coolFatigueHeat(room as any), 0); //Off-interval tick: costs nothing.
    assert.equal(heatAt(memory.fatigueHeat, 10, 10), FATIGUE_HEAT_COOL_AMOUNT);
    globals.Game.time = FATIGUE_HEAT_COOL_INTERVAL * 3;
    assert.equal(coolFatigueHeat(room as any), 1);
    //Empty map means no Memory key at all, so a quiet room really does end up back where it started.
    assert.isUndefined(memory.fatigueHeat);
    assert.equal(coolFatigueHeat(room as any, true), 0);
  });
});

describe("fatigue heat visuals", () => {
  beforeEach(() => {
    globals.OK = 0;
    globals.Game = { time: 0, creeps: {} };
  });

  it("writes the number on every hot tile and nothing on the cold ones", () => {
    const { room, memory, texts } = fakeRoom();
    memory.fatigueHeat = {
      [String(packRoadPos(10, 10))]: 120.5,
      [String(packRoadPos(11, 12))]: 0 //Shouldn't happen (cooling deletes these), but never draw a zero.
    };
    assert.equal(drawFatigueHeat(room as any), 1);
    assert.deepEqual(texts.map(item => [item.text, item.x, item.y]), [["121", 10, 10]]);
    assert.equal(texts[0].style.font, 0.45);
  });

  it("colors by magnitude so the hot lanes stand out", () => {
    assert.notEqual(fatigueHeatColor(10), fatigueHeatColor(500));
    assert.notEqual(fatigueHeatColor(500), fatigueHeatColor(5000));
  });
});

describe("fatigue heat processing", () => {
  beforeEach(() => {
    globals.OK = 0;
    globals.Game = { time: 0, creeps: {} };
  });

  it("samples, draws, and places no construction sites", () => {
    const { room, memory, texts, sites } = fakeRoom();
    globals.Game.time = 1; //Off the cool interval, so this tick is sample + draw only.
    globals.Game.creeps = { laden: creep(10, 10, 50) };
    assert.equal(processFatigueHeat(room as any), 1);
    assert.equal(heatAt(memory.fatigueHeat, 10, 10), 50);
    assert.deepEqual(texts.map(item => item.text), ["50"]);
    //Observe-only: this layer never queues road work, whatever the numbers say.
    assert.isEmpty(sites);
  });
});
