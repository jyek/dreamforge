import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifiedStripeBody} from '../lib/stripe-signature';
test('Stripe signatures reject edited bodies, expired deliveries and unsigned events',()=>{
 const raw='{"type":"checkout.session.completed"}',secret='test_only_secret',now=1791960000000,t=now/1000;
 const signature=`t=${t},v1=${createHmac('sha256',secret).update(`${t}.${raw}`).digest('hex')}`;
 assert.ok(verifiedStripeBody(raw,signature,secret,now));
 assert.equal(verifiedStripeBody(raw+' ',signature,secret,now),false);
 assert.equal(verifiedStripeBody(raw,signature,secret,now+301000),false);
 assert.equal(verifiedStripeBody(raw,'',secret,now),false);
 assert.equal(verifiedStripeBody(raw,signature,'wrong secret',now),false);
});
