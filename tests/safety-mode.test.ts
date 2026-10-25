import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safetyEnabled,moderationConfigured} from '../lib/safety-mode';
test('anonymous safety is independent of login and classroom cannot disable protection',()=>{
 const previous={login:process.env.STUDENT_LOGIN_ENABLED,safety:process.env.SAFETY_ENABLED};
 try {
  process.env.STUDENT_LOGIN_ENABLED='false';delete process.env.SAFETY_ENABLED;assert.equal(safetyEnabled(),false);
  process.env.SAFETY_ENABLED='true';assert.equal(safetyEnabled(),true);
  process.env.STUDENT_LOGIN_ENABLED='true';process.env.SAFETY_ENABLED='false';assert.equal(safetyEnabled(),true);
  delete process.env.STUDENT_LOGIN_ENABLED;assert.equal(safetyEnabled(),true);
 }finally{for(const [key,value] of [['STUDENT_LOGIN_ENABLED',previous.login],['SAFETY_ENABLED',previous.safety]]){if(value===undefined)delete process.env[key!];else process.env[key!]=value;}}
});
test('moderation readiness requires both service URL and key',()=>{
 const previous=[process.env.STUDENT_MODERATION_URL,process.env.STUDENT_MODERATION_KEY];
 try {delete process.env.STUDENT_MODERATION_URL;delete process.env.STUDENT_MODERATION_KEY;assert.equal(moderationConfigured(),false);process.env.STUDENT_MODERATION_URL='https://example.test';assert.equal(moderationConfigured(),false);process.env.STUDENT_MODERATION_KEY='test';assert.equal(moderationConfigured(),true);}
 finally{for(const [i,key] of ['STUDENT_MODERATION_URL','STUDENT_MODERATION_KEY'].entries()){if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];}}
});
