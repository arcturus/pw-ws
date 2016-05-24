'use strict';
const LRUMap = require('lru-cache');

/* A simple Cache where entries will expire automatically
 * This will serve stale content instead of blocking
 * to create new content to return fresh.
 */
class ServeStaleCache {

  /* Create a ServeStaleCache:
   * options.dispose:    A function called when an item is evicted
   *                     the underlying LRU cache
   *                     default: () => {}
   * options.capacity:   The maximum capacity of this cache, once the
   *                     cache reaches this limit, the least recently
   *                     used items will be evicted.
   *                     default: 5000
   * options.defaultTTL: The default time to live in ms, for items in the cache,
   *                     this is used if the create callback doesn't specify
   *                     a ttl in it's return value.
   *                     default: 0
   */
  constructor(options) {
    const opts = options || {};
    const dispose = opts.dispose || function() {};
    const capacity = opts.capacity || 5000;

    this.cache = new LRUMap({
      dispose: dispose,
      max: capacity
    });
    this.defaultTTL = opts.defaultTTL || 0;
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
   * key: String
   *
   * create: fn() -> { ttl, value }
   *
   * `create` should be a function, that takes no arguments and returns
   * an object containing at least a `value` property, and optionally
   * a `ttl` property, to specify the time to live for this cache
   * item.
   *
   * Returns a Promise resolving to the cached item, or erroring if not cached
   * and `create` fails.
   */
  get(key, create) {
    let cacheRecord = this.cache.get(key);

    if (cacheRecord === undefined) {
      // Cache is empty
      cacheRecord = this._set(key, Promise.resolve(create()));
    } else {
      const now = this._now();
      // If key in cache, but expired - serve stale and revalidate in the
      // background
      if (cacheRecord.expires < now) {
        const next = Promise.resolve(create());
        cacheRecord.next = next;

        cacheRecord.next.then((cachedValue) => {
          if (!cachedValue) {
            const msg = 'Cacheable item should return an object with at least a `value` property';
            throw new Error(msg);
          }

          // Set new cached value.
          cacheRecord.value = cacheRecord.next;
          cacheRecord.next = null;

          // If `create` specified a ttl, update the expiry time of
          // the cache record, or use the defaultTTL.
          let _ttl = this.defaultTTL;
          if (cachedValue.ttl) {
            _ttl = cachedValue.ttl;
          }

          cacheRecord.expires = this._now() + _ttl;
        });
      }
    }

    return cacheRecord.value.then((val) => {
      // Return only the inner value
      return val.value;
    });
  }

  /*
   * Create a new item in the cache from the given promise.
   *
   * Usually, you'll only need to use 'get' with a `create` callback.
   *
   * @private
   */
  _set(key, promise) {
    const ttl = this.defaultTTL;
    const now = this._now();

    const cacheRecord = {
      expires: now + ttl,
      next: null,
      value: promise.then((val) => {
        if (val.ttl) {
          cacheRecord.expires = now + val.ttl;
        }

        return val;
      })
    };

    this.cache.set(key, cacheRecord);
    return cacheRecord;
  }

  /*
   * Get a timestamp representing the time now.
   *
   * Useful for testing
   * @private
   */
  _now() {
    return Date.now();
  }
}

module.exports = ServeStaleCache;
