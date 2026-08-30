import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticationHeaders, createTarget, publicTarget } from './inference-target.mjs';
import { getInferenceAdapter } from './inference-adapters.mjs';

test('normalizes a runtime-independent openai-chat target', () => {
  const target = createTarget({
    name:'candidate', model:'provider/model', protocol:'openai-chat', baseUrl:'http://runtime.test/v1',
    path:'/custom', authentication:{ type:'bearer', env:'TEST_TOKEN' }, requestParameters:{ seed:42 }
  });
  assert.equal(target.model, 'provider/model');
  assert.equal(target.protocol, 'openai-chat');
  assert.equal(target.path, '/custom');
  assert.deepEqual(authenticationHeaders(target.authentication, { TEST_TOKEN:'secret' }), { authorization:'Bearer secret' });
  assert.deepEqual(publicTarget(target).authentication, { type:'bearer', env:'TEST_TOKEN', configured:true });
  assert.equal(JSON.stringify(publicTarget(target)).includes('secret'), false);
});

test('rejects ambiguous endpoint and path configuration', () => {
  assert.throws(() => createTarget({ model:'candidate', endpoint:'http://runtime.test/v1/chat', path:'/other' }), /cannot combine endpoint/);
});

test('adapter registry rejects protocols that have not been implemented', () => {
  assert.throws(() => getInferenceAdapter('messages'), /Unsupported inference protocol/);
});
