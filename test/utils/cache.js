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
        value: 'CachedValue'
      };
    }).then((value) => {
      // Assert initial value
      assert.equal(value, 'CachedValue');

      // Step forward in time
      nextTime = 101;

      // Get cached value again - if stale create new value.
      // Because the ttl was 100, and we stepped forward in time, 101,
      // we will create the new value in the background
      return cache.get('id_q', () => {
        return {
          ttl: 100,
          value: 'NewValue'
        };
      });
    }).then((value) => {
      // Should be the stale item from the cache (original value)
      assert.equal(value, 'CachedValue');

      // Step forward in time again.
      nextTime = 102;

      return cache.get('id_q', () => {
        return {
          ttl: 100,
          value: 'FinalValue'
        };
      });
    }).then((value) => {
      // Expects the new value, as the current cache entry.
      assert.equal(value, 'NewValue');
      done();
    }).catch(done);
  });
});
