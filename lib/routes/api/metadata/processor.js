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

module.exports = function(url, options) {
  debug('process', url, options);
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

      debug('parsing html');
      return htmlParser.parse(result.text, result.finalUrl)
        .then(done);

      function done(json) {
        json = json || {};
        debug('parsed', json);
        if (!json.title) {
          return Promise.reject(new Error('empty'));
        }

        json.unadaptedUrl = result.unadaptedUrl;
        json.displayUrl = decodeURIComponent(json.unadaptedUrl);
        json.id = json.url = result.finalUrl;
        json.originalUrl = url;
        json.maxAge = result.maxAge;
        return json;
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
