import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BoundedCache} from '../web/bounded-cache.js';
import {escapeHtml,decodeFloat32} from '../web/format.js';

test('bounded cache releases evicted and replaced resources, preserving recent hits',()=>{
  const disposed=[];
  const cache=new BoundedCache(2,value=>disposed.push(value));
  cache.set('a','blob:a');cache.set('b','blob:b');
  assert.equal(cache.get('a'),'blob:a');
  cache.set('c','blob:c');
  assert.equal(cache.has('b'),false);
  assert.deepEqual(disposed,['blob:b']);
  cache.set('a','blob:a2');
  assert.deepEqual(disposed,['blob:b','blob:a']);
  cache.clear();
  assert.deepEqual(disposed,['blob:b','blob:a','blob:c','blob:a2']);
  cache.clear();
  assert.equal(disposed.length,4);
});

test('shared codecs preserve HTML escaping and exact float32 payload bits',()=>{
  assert.equal(escapeHtml(`<&>"'`),'&lt;&amp;&gt;&quot;&#39;');
  assert.equal(escapeHtml(null),'');
  const bytes=new Uint8Array([0,0,128,63,0,0,0,192]);
  const decoded=decodeFloat32({data:Buffer.from(bytes).toString('base64')});
  assert.deepEqual(new Uint8Array(decoded.buffer),bytes);
});
