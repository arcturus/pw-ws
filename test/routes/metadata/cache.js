'use strict';

/**
 * Dependencies
 */

const app = require('../../../lib/routes/api');
const cache = require('../../../lib/routes/api/metadata').cache;
const supertest = require('supertest');
const assert = require('assert');
const nock = require('nock');

describe('request caching', () => {
  afterEach(function() {
    nock.cleanAll();
    cache.clear();
  });

  it('should cache individual object requests', (done) => {
    const requestBody = {
      objects: [{ url: 'https://mozilla.org' }]
    };

    // mock response
    nock('https://mozilla.org')
      .get('/')
      .reply(200, '<title>mozilla</title><meta name="description" content="desc"/>', {
        'Cache-Control': 'max-age: 30000'
      });

    supertest(app)
      .post('/metadata/')
      .send(requestBody)
      .expect(200)
      .end((err, res) => {
        if (err) {
          throw err;
        }

        cache.get('https://mozilla.org', () => {
          return { value: 'x' };
        }).then((value) => {
          assert.notEqual('x', value);
          assert.equal('mozilla', value.title);
          done();
        }).catch(done);
      });
  });
});
