'use strict';

const Cache = require('../../lib/utils/cache');
const assert = require('assert');

describe('ServeStaleCache', () => {

  it('should create a new value if not in cache', (done) => {
    const cache = new Cache();
    const cachedValue = cache.get('id_1', () => {
      return {
        value: 'CachedValue'
      };
    });

    cachedValue.then((value) => {
      assert.equal(value, 'CachedValue');
      done();
    }).catch(done);
  });

  it('should not serve stale content after two hours', (done) => {
    const cache = new Cache();
    const twoHours = 60 * 60 * 2 * 1000;

    let nextTime = 0;
    cache._now = function() {
      return nextTime;
    };

    cache.get('id_q', () => {
      return {
        ttl: twoHours,
        value: 'FirstCachedValue'
      };
    }).then((value) => {
      assert.equal(value, 'FirstCachedValue');
      nextTime += (twoHours * 2) + 1;
      return cache.get('id_q', () => {
        return {
          value: 'NewCachedValue'
        };
      });
    }).then((value) => {
      assert.equal(value, 'NewCachedValue');
      done();
    }).catch(done);

  });

  it('should serve stale content, and rebuild in background', (done) => {
    const cache = new Cache();

    let nextTime = 0;

    cache._now = function() {
      return nextTime;
    };

    cache.get('id_q', () => {
      // Create initial value in cache.
      return {
        ttl: 100,
        value: '1'
      };
    }).then((value) => {
      // Assert initial value
      assert.equal(value, '1');

      // Step forward in time
      nextTime = 101;

      // Get cached value again - if stale create new value.
      // Because the ttl was 100, and we stepped forward in time, 101,
      // we will create the new value in the background
      return cache.get('id_q', () => {
        return {
          ttl: 100,
          value: '2'
        };
      });
    }).then((value) => {
      // Should be the stale item from the cache (original value)
      assert.equal(value, '1');

      // Step forward in time again.
      nextTime = 102;

      return cache.get('id_q', () => {
        return {
          ttl: 1000,
          value: '3'
        };
      });
    }).then((value) => {
      function waitForAsyncValue(expects, actual) {
        if (actual === expects) {
          return Promise.resolve(true);
        }

        return cache.get('id_q', () => {
          return {
            ttl: 1000,
            value: 'x'
          };
        }).then((value) => {
          return waitForAsyncValue(expects, value);
        });
      }

      waitForAsyncValue('2', value);
      done();
    }).catch(done);
  });
});
