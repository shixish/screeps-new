import { assert } from "chai";
import { getCreepLabel, getCreepName, toPascalCase } from "../../src/utils/creepNames";

//Names look like 'HarvesterT2#c9d0' - a readable prefix plus a short suffix that keeps them unique.
const NAME_PATTERN = /^([A-Za-z][A-Za-z0-9]*)#([0-9a-f]+)$/;

describe("creep names", () => {
  it("capitalizes the role, folding kebab-case into PascalCase", () => {
    assert.equal(toPascalCase("basic"), "Basic");
    assert.equal(toPascalCase("harvester"), "Harvester");
    assert.equal(toPascalCase("remote-harvester"), "RemoteHarvester");
    assert.equal(toPascalCase("remote-courier"), "RemoteCourier");
  });

  it("leaves the base tier bare and tags every tier above it", () => {
    assert.equal(getCreepLabel("basic", 0), "Basic");
    assert.equal(getCreepLabel("basic", 1), "BasicT2");
    assert.equal(getCreepLabel("courier", 2), "CourierT3");
    assert.equal(getCreepLabel("remote-harvester", 2), "RemoteHarvesterT3");
  });

  it("treats a missing tier as the base tier", () => {
    assert.equal(getCreepLabel("upgrader"), "Upgrader");
    //config.tiers.indexOf() misses return -1 - name the creep rather than throw.
    assert.equal(getCreepLabel("upgrader", -1), "Upgrader");
  });

  it("builds a spawn name from the label plus a short suffix", () => {
    const name = getCreepName("harvester", 1, {});
    const match = NAME_PATTERN.exec(name);
    assert.isNotNull(match, `unexpected creep name: ${name}`);
    assert.equal(match![1], "HarvesterT2");
    assert.equal(match![2].length, 4);
  });

  it("retries until the name is free", () => {
    const taken: { [name: string]: unknown } = {};
    const names = new Set<string>();
    for (let i = 0; i < 25; i++){
      const name = getCreepName("basic", 0, taken);
      assert.isFalse(taken[name] !== undefined, `reused a live creep name: ${name}`);
      taken[name] = true;
      names.add(name);
    }
    assert.equal(names.size, 25);
  });

  it("falls back to a long suffix when every short name is taken", () => {
    //A proxy that claims every short name: the only way out is the long-suffix fallback.
    const taken = new Proxy({} as { [name: string]: unknown }, {
      get: (_target, key) => String(key).length <= "Basic#abcd".length
    });
    const name = getCreepName("basic", 0, taken);
    assert.isTrue(name.startsWith("Basic#"));
    assert.isAbove(name.length, "Basic#abcd".length);
  });

  it("defaults the name pool to Game.creeps", () => {
    const previous = (global as any).Game;
    (global as any).Game = { creeps: {} };
    try{
      assert.isTrue(getCreepName("courier", 1).startsWith("CourierT2#"));
    }finally{
      (global as any).Game = previous;
    }
  });
});
