global._ = require('lodash');

[["MOVE","move"],["WORK","work"],["CARRY","carry"],["ATTACK","attack"],["RANGED_ATTACK","ranged_attack"],
 ["TOUGH","tough"],["HEAL","heal"],["CLAIM","claim"]].forEach(([name, value])=>{
  if (global[name] === undefined) global[name] = value;
});

process.env.TS_NODE_PROJECT = 'tsconfig.test.json';
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: "commonjs" });
