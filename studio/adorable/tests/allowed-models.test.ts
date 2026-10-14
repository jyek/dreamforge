import {test} from 'node:test';import assert from 'node:assert/strict';import {resolveModel,modelOptions} from '../lib/allowed-models';
test('requested coding models are allowlisted and default is preserved',()=>{
 assert.equal(resolveModel(undefined),modelOptions()[0].id);assert.equal(resolveModel('deepseek/deepseek-v4.1-flash'),'deepseek/deepseek-v4.1-flash');assert.equal(resolveModel('z-ai/glm-5.3-flash'),'z-ai/glm-5.3-flash');assert.throws(()=>resolveModel('unapproved/expensive-model'));assert.throws(()=>resolveModel({id:'z-ai/glm-5.3-flash'}));
});
test('retired Qwen models cannot be selected',()=>{
 assert.throws(()=>resolveModel('qwen/qwen3-coder-30b-a3b-instruct'));
 assert.ok(!modelOptions().some(model=>model.id.includes('qwen')));
});
