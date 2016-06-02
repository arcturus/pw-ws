'use strict';

/**
 * Dependencies
 */

const debug = require('debug')('magnet:route:metadata');
const process = require('./processor');
const metrics = require('../../../utils/metrics');
const Cache = require('../../../utils/cache');

const cache = new Cache();

/**
 * Exports
 */

module.exports = function(req, res, next) {
  const respTimeTimer = metrics.timer('respTime').start();
  metrics.counter('requests').inc();

  const items = req.body.objects;
  debug('items: ', items);
  const tasks = items.map(item => {
    console.log(`request for '${item.url}'`);
    return cache.get(item.url, () => {
      return process(item.url, { adaptors: req.magnet.adaptors })
      .then((value) => {
        return {
          ttl: value.maxAge,
          value: value
        };
      });
    }).catch(err => {
      debug('item error', err);
      return { error: err.message };
    });
  });

  Promise.all(tasks)
    .then((data) => {
      res.json(data);
      respTimeTimer.end();
    }).catch(next);
};

module.exports.cache = cache;
