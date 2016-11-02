'use strict';

/**
 * Dependencies
 */

const debug = require('debug')('magnet-metadata-service:processor');
const htmlParser = require('magnet-html-parser');
const request = require('./request');
const { getDataForUrl } = require('../../../processors/content-service');

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

  // Make a request to the content service to see if there is any extra data
  // for this URL.
  const contentServiceRequest = getDataForUrl(url);

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

        return contentServiceRequest.then((res) => {
          const addedData = res.extra_metadata || {};

          // Add call to action to every response,
          // and merge any from the already parsed metadata.
          addedData.call_to_action = Object.assign({},
            metadata.call_to_action || {}, res.call_to_action || {});

          return Object.assign({}, metadata, addedData);
        })
        .catch((err) => {
          // Ignore, if the fetch to the content service fails for any reason,
          // don't fail the entire response. The additional data from the content
          // isn't mandatory.
          return metadata;
        })
        .then((metadata) => {
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
        });
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
