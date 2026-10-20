import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../web/terrain-data.js", import.meta.url), "utf8");
const moduleURL = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
test("terrain requests coalesce, separate targets, evict, and retry failures", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0, fail = false;
  globalThis.fetch = async () => {
    calls++;
    return fail ? { ok: false, status: 404, json: async () => ({ detail: "Not cached" }) }
      : { ok: true, json: async () => ({ terrain: "fixture" }) };
  };
  try {
    const { terrainData } = await import(moduleURL);
    const site = { lat: 28.25, lon: 63.25 };
    const first = terrainData(site, "jezero_crater");
    assert.equal(terrainData(site, "jezero_crater"), first);
    assert.deepEqual(await first, { terrain: "fixture" });
    assert.equal(calls, 1);
    await terrainData(site, "lunar_south_pole");
    assert.equal(calls, 2);
    for (let lat = 0; lat < 6; lat++) await terrainData({ lat, lon: 0 });
    await terrainData(site, "jezero_crater");
    assert.equal(calls, 9);
    fail = true;
    await assert.rejects(terrainData({ lat: 1, lon: 1 }), /Not cached/);
    fail = false;
    await terrainData({ lat: 1, lon: 1 });
    assert.equal(calls, 11);
  } finally { globalThis.fetch = originalFetch; }
});

test('an evicted failing request cannot remove its newer replacement', async () => {
  const originalFetch=globalThis.fetch;
  let rejectFirst,calls=0;
  globalThis.fetch=()=>{
    calls++;
    if(calls===1) return new Promise((resolve,reject)=>{rejectFirst=reject;});
    return Promise.resolve({ok:true,json:async()=>({terrain:'replacement'})});
  };
  try {
    const {terrainData}=await import(`${moduleURL}#replacement`);
    const old=terrainData({lat:0,lon:0});
    const rejection=assert.rejects(old,/old failure/);
    await Promise.resolve();
    for(let lat=1;lat<=6;lat++) await terrainData({lat,lon:0});
    const replacement=terrainData({lat:0,lon:0});
    await replacement;
    rejectFirst(new Error('old failure'));
    await rejection;
    assert.equal(terrainData({lat:0,lon:0}),replacement);
    assert.equal(calls,8);
  }finally{globalThis.fetch=originalFetch;}
});
