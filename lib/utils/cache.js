'use strict';
const config = require('../../config.js');
const LRUMap = require('lru-cache');

/* A simple Cache where entries will expire automatically
 * This will serve stale content instead of blocking
 * to create new content to return fresh.
 */
class ServeStaleCache {

  /* Create a ServeStaleCache:
   * @param {Function} options.dispose:  Function called when an item is evicted
   *                                     the underlying LRU cache
   *                                     default: () => {}
   * @param {Number} options.capacity:   The maximum capacity of this cache, once the
   *                                     cache reaches this limit, the least recently
   *                                     used items will be evicted.
   *                                     default: from config
   *                                     'local_cache_capacity'
   * @param {Number} options.defaultTTL: The default time to live in ms, for items in the cache,
   *                                     this is used if the create callback doesn't specify
   *                                     a ttl in it's return value.
   *                                     default: from config
   *                                     'default_cache_ttl'
   * @constructor
   */
  constructor(options) {
    const opts = options || {};
    const dispose = opts.dispose || function() {};
    const capacity = opts.capacity || config.local_cache_capacity;

    this.cache = new LRUMap({
      dispose: dispose,
      max: capacity
    });
    this.defaultTTL = opts.defaultTTL || config.default_cache_ttl;
  }

  /*
   * Clear all items from the cache
   */
  clear() {
    this.cache.reset();
  }

  /*
   * Get an item from the cache using the given key.
   * If the item does not exist in the cache, (or is
   * expiring), `create` is called to create the cached value.
   *
   * @param {String} key
   *
   * @param {Function} createCallback: fn() -> { ttl, value }
   * `createCallback` should be a function, that takes no arguments and returns
   * an object containing at least a `value` property, and optionally
   * a `ttl` property, to specify the time to live for this cache
   * item.
   *
   * @returns {Promise} Returns a Promise resolving to the cached item, or erroring if not cached
   * and `create` fails.
   */
  get(key, createCallback) {
    let cacheRecord = this.cache.get(key);
    const that = this;

    if (cacheRecord === undefined) {
      // Cache is empty
      cacheRecord = this._set(key, Promise.resolve(createCallback()));
    } else {
      const now = this._now();
      // We should really use max-stale or
      // stale-while-revalidate/stale-if-error
      // TODO: for now only serve stale content for two hours
      if (now - cacheRecord.expires > config.max_serve_stale) {
        // Synchronously create the new cache item
        const next = Promise.resolve(createCallback());

        // Assign this new cache item as the current value.
        return updateTTLForValue(next).then((cachedValue) => {
          cacheRecord.next = null;
          cacheRecord.value = next;
          return cachedValue.value;
        });
      }

      // If key in cache, but expired - serve stale and revalidate in the
      // background
      if (cacheRecord.expires < now) {
        const next = Promise.resolve().then(() => {
          return createCallback();
        });
        cacheRecord.next = next;

        updateTTLForValue(cacheRecord.next).then((cachedValue) => {
          // Set new cached value.
          cacheRecord.value = cacheRecord.next;
          cacheRecord.next = null;
          return cachedValue;
        });
      }
    }

    function updateTTLForValue(valuePromise) {
      return valuePromise.then((cachedValue) => {
        if (!cachedValue) {
          const msg = 'Cacheable item should return an object with at least a `value` property';
          throw new Error(msg);
        }

        // If `createCallback` specified a ttl, update the expiry time of
        // the cache record, or use the defaultTTL.
        let _ttl = that.defaultTTL;
        if (cachedValue.ttl) {
          _ttl = cachedValue.ttl;
        }

        cacheRecord.expires = that._now() + _ttl;

        return cachedValue;
      });
    }

    return cacheRecord.value.then((value) => {
      // Return only the inner value
      return value.value;
    });
  }

  /*
   * Create a new item in the cache from the given promise.
   *
   * Usually, you'll only need to use 'get' with a `createCallback`.
   *
   * @param {String} key
   * @param {Promise} promise
   * @returns {Object} The cache record entry.
   * @private
   */
  _set(key, promise) {
    const ttl = this.defaultTTL;
    const now = this._now();

    const cacheRecord = {
      expires: now + ttl,
      next: null,
      value: promise.then((value) => {
        // If the promise returns an object with a 'ttl' value,
        // update the cacheRecord's expiry using this new ttl.
        // This allows for the ttl of the cached item to depend
        // on a result computed from the creation of the cacheable
        // item.
        if (value.ttl) {
          cacheRecord.expires = now + value.ttl;
        }

        return value;
      })
    };

    this.cache.set(key, cacheRecord);
    return cacheRecord;
  }

  /*
   * Get a timestamp representing the time now.
   *
   * Useful for testing (can be overwritten in tests)
   * @returns {Number} Current timestamp in millis
   * @private
   */
  _now() {
    return Date.now();
  }
}

module.exports = ServeStaleCache;
