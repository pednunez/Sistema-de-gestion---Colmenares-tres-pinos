import assert from 'node:assert/strict';
import { test, beforeEach, afterEach } from 'node:test';
import { resolverApiUrl } from '../src/config/api.js';
import { api, establecerSesion, alExpirarSesion } from '../src/services/api.js';
const originalFetch = globalThis.fetch;
let calls;
let expired;
beforeEach(() => { calls=[];expired=0;establecerSesion(false);alExpirarSesion(()=>expired++); });
afterEach(() => { globalThis.fetch=originalFetch;alExpirarSesion(null);establecerSesion(false); });
function responses(...items) {
  globalThis.fetch=async (url,options)=>{
    calls.push({url,options});
    const item=items.shift();
    if(item instanceof Error)throw item;
    assert.ok(item,'Unexpected additional request');
    return new Response(JSON.stringify(item.body),{status:item.status??200});
  };
}
test('local development matches hostname without changing production or remote hosts',()=>{
 const location=new URL('http://localhost:5173');
 assert.equal(resolverApiUrl('http://127.0.0.1:8000',location,true),'http://localhost:8000');
 assert.equal(resolverApiUrl('http://127.0.0.1:8000',location,false),'http://127.0.0.1:8000');
 assert.equal(resolverApiUrl('https://api.example.invalid/',location,true),'https://api.example.invalid');
});
test('login sends cookies and no Authorization header',async()=>{
 responses({body:{usuario:{id:1},csrf_token:'csrf-test'}});
 const body=await api.post('/auth/login',{email:'test@example.invalid',password:'test-only'});
 assert.equal(body.usuario.id,1);
 assert.equal(calls[0].options.credentials,'include');
 assert.equal(calls[0].options.headers.Authorization,undefined);
});
test('authenticated writes and logout include CSRF, reads include cookie',async()=>{
 establecerSesion(true,'csrf-test');responses({body:{}},{body:{}},{body:{}});
 await api.patch('/usuarios/1',{nombre:'Test'});await api.post('/auth/logout');await api.get('/auth/me');
 assert.equal(calls[0].options.headers['X-CSRF-Token'],'csrf-test');
 assert.equal(calls[1].options.headers['X-CSRF-Token'],'csrf-test');
 assert.equal(calls[2].options.headers['X-CSRF-Token'],undefined);
 assert.ok(calls.every(call=>call.options.credentials==='include'));
});
test('invalid credentials are not reported as expiration',async()=>{
 establecerSesion(true,'old');responses({status:401,body:{detail:'Correo o contraseña incorrectos'}});
 await assert.rejects(api.post('/auth/login',{}),e=>e.estado===401&&e.message.includes('contraseña'));
 assert.equal(expired,0);
});
test('protected 401 expires session once',async()=>{
 establecerSesion(true,'csrf-test');responses({status:401,body:{}},{status:401,body:{}});
 await assert.rejects(api.get('/usuarios/'),e=>e.estado===401);
 await assert.rejects(api.get('/apiarios/'),e=>e.estado===401);
 assert.equal(expired,1);
});
test('CSRF refresh retries a rejected write only once',async()=>{
 establecerSesion(true,'old');responses({status:403,body:{detail:'Token CSRF invalido'}},{body:{csrf_token:'new'}},{body:{ok:true}});
 assert.deepEqual(await api.patch('/usuarios/1',{}),{ok:true});
 assert.ok(calls[1].url.endsWith('/auth/csrf'));
 assert.equal(calls[2].options.headers['X-CSRF-Token'],'new');
});
test('expired cookie during CSRF refresh reports 401 instead of old 403',async()=>{
 establecerSesion(true,'old');responses({status:403,body:{detail:'Token CSRF invalido'}},{status:401,body:{}});
 await assert.rejects(api.post('/auth/logout'),e=>e.estado===401);
 assert.equal(expired,1);assert.equal(calls.length,2);
});
test('forbidden action is not retried and does not log user out',async()=>{
 establecerSesion(true,'csrf-test');responses({status:403,body:{detail:'No tienes permisos'}});
 await assert.rejects(api.delete('/usuarios/1'),e=>e.estado===403);
 assert.equal(calls.length,1);assert.equal(expired,0);
});
test('network errors remain distinguishable from invalid credentials',async()=>{
 responses(new TypeError('offline'));
 await assert.rejects(api.get('/auth/me'),e=>e.estado===0&&e.message.includes('conectar'));
 assert.equal(expired,0);
});

test('server error during CSRF refresh does not expire session or retry write',async()=>{
 establecerSesion(true,'old');responses({status:403,body:{detail:'Token CSRF invalido'}},{status:503,body:{}});
 await assert.rejects(api.patch('/usuarios/1',{}),e=>e.estado===503);
 assert.equal(expired,0);assert.equal(calls.length,2);
});
test('a second CSRF rejection does not create an infinite retry',async()=>{
 establecerSesion(true,'old');responses({status:403,body:{detail:'Token CSRF invalido'}},{body:{csrf_token:'new'}},{status:403,body:{detail:'Token CSRF invalido'}});
 await assert.rejects(api.patch('/usuarios/1',{}),e=>e.estado===403);
 assert.equal(expired,0);assert.equal(calls.length,3);
});

test('logout recovers CSRF when memory was reset but the cookie is still valid',async()=>{
 establecerSesion(false);
 responses({status:403,body:{detail:'Token CSRF invalido'}},{body:{csrf_token:'current-cookie-csrf'}},{body:{mensaje:'Sesiones cerradas'}});
 assert.deepEqual(await api.post('/auth/logout'),{mensaje:'Sesiones cerradas'});
 assert.equal(calls.length,3);
 assert.equal(calls[2].options.headers['X-CSRF-Token'],'current-cookie-csrf');
 assert.ok(calls.every(call=>call.options.credentials==='include'));
});
