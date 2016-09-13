'use strict';

/**
 * Dependencies
 */

const debug = require('debug')('magnet-metadata-service:processor');
const htmlParser = require('magnet-html-parser');
const request = require('./request');

const types = {
  json: 'application/json',
  html: 'text/html'
};

/**
 * Exports
 */

/**
 * Fetch and parse the given URL.
 *
 * @param  {String} url
 * @param  {Object} [options]
 * @param  {Object} [options.adaptors] - a list of 'adaptors' to apply to fetched urls
 * @param  {Object} [options.findParams] - a list of params to extract from fetched urls
 * @return {Promise}
 */
module.exports = function(url, options) {
  debug('process', url, options);
  if (url.includes('axaet.com')) {
    url = 'https://github.com/mozilla-magnet';
  }

  return request(url, options)
    .then(result => {
      debug('got response', result);
      const contentType = result.contentType || types.html;

      // if the service returned json, we don't need to parse anything
      if (isType(contentType, types.json)) {
        debug('url returned json');
        return done(parseJson(result.text));
      }

      // only handle html content from here on
      if (!isType(contentType, types.html)) {
        debug('unsupported content-type', contentType);
        return { error: `unsupported response type: ${contentType}` };
      }

      debug('parsing html ...');
      return htmlParser.parse(result.text, result.finalUrl)
        .then(done);

      function done(metadata={}) {
        debug('parsed', metadata);

        if (!(metadata.embed || metadata.title)) {
          return Promise.reject(new Error('empty'));
        }

        metadata.unadaptedUrl = metadata.id = metadata.url;
        metadata.displayUrl = decodeURIComponent(metadata.url);
        metadata.originalUrl = url;
        metadata.maxAge = result.maxAge;

        const twitterUsername = result.foundParams.magnet_twitter_username;
        if (twitterUsername) {
          metadata.twitterUsername = twitterUsername.replace('@', '');
        }

        return metadata;
      }
    });
};

function isType(header, type) {
  return header.indexOf(type) > -1;
}

function parseJson(string) {
  if (!string) {
    return;
  }

  try { return JSON.parse(string); }
  catch (e) { return; }
}
