import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolverApiUrl } from '../src/config/api.js';

test('login local uses localhost on both sides even with an old API setting', () => {
  assert.equal(resolverApiUrl('http://127.0.0.1:8000',new URL('http://localhost:5173'),true),'http://localhost:8000');
});
test('login local also works when opened through 127.0.0.1', () => {
  assert.equal(resolverApiUrl('http://localhost:8000/',new URL('http://127.0.0.1:5173'),true),'http://127.0.0.1:8000');
});
test('remote and production API addresses are preserved', () => {
  const location=new URL('http://localhost:5173');
  assert.equal(resolverApiUrl('http://127.0.0.1:8000',location,false),'http://127.0.0.1:8000');
  assert.equal(resolverApiUrl('https://api.example.invalid/',location,true),'https://api.example.invalid');
});
test('default API follows the frontend hostname', () => {
  assert.equal(resolverApiUrl('',new URL('http://localhost:5173'),true),'http://localhost:8000');
});
