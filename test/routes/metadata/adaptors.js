'use strict';

/**
 * Dependencies
 */

const parseHtml = require('magnet-html-parser');
const app = require('../../../lib/routes/api');
const cache = require('../../../lib/routes/api/metadata').cache;
const supertest = require('supertest');
const assert = require('assert');
const sinon = require('sinon');
const nock = require('nock');

const testUrl = 'https://facebook.com/wilsonpage%3E';
const adaptorUrl = 'http://box.wilsonpage.me/magnet-facebook-adaptor';

const requestBody = {
  objects: [ { url: testUrl } ],
  adaptors: [
    {
      pattern: 'facebook\.com/.+',
      url: adaptorUrl
    }
  ]
};

/**
 * Tests
 */

describe('adaptors', () => {
  beforeEach(function() {
    this.sandbox = sinon.sandbox.create();
  });

  afterEach(function() {
    this.sandbox.restore();
    nock.cleanAll();
    cache.clear();
  });

  describe('returns html', function() {
    beforeEach(function(done) {

      // fake adaptor response
      nock(adaptorUrl)
        .get(/./)
        .reply(200, '<title>wilson page</title>');

      supertest(app)
        .post('/metadata/')
        .send({
          objects: [{ url: testUrl }],
          adaptors: requestBody.adaptors
        })

        .end((err, res) => {
          if (err) {
            throw err;
          }

          this.res = res;
          done();
        });
    });

    it('returns the `originalUrl`', function() {
      const body = this.res.body[0];
      assert.equal(body.originalUrl, testUrl);
    });

    it('returns `displayUrl` as the original url (decoded)', function() {
      const body = this.res.body[0];
      assert.equal(body.displayUrl, decodeURIComponent(testUrl));
    });

    it('returns the `url` as the adaptor url', function() {
      const body = this.res.body[0];
      assert.equal(body.url, `${adaptorUrl}?url=${encodeURIComponent(testUrl)}`);
    });
  });

  describe('returns json', function() {
    beforeEach(function(done) {
      this.sandbox.spy(parseHtml, 'parse');

      this.testUrlStub = nock(testUrl)
        .get(/./)
        .reply(200);

      this.adaptorUrlStub = nock(adaptorUrl)
        .defaultReplyHeaders({
          'Content-Type': 'application/json; charset=utf-8'
        })

        .get(/./)
        .reply(200, uri => {
          this.endUrl = uri;
          return { title: 'adapted title' };
        });

      supertest(app)
        .post('/metadata/')
        .send(requestBody)
        .end((err, res) => {
          if (err) {
            throw err;
          }

          this.res = res;
          done();
        });
    });

    it('requests the adaptor url instead', function() {
      assert.equal(this.testUrlStub.isDone(), false, 'original url not called');
      assert.equal(this.adaptorUrlStub.isDone(), true, 'adaptor url called');
      assert.equal(this.endUrl, `/magnet-facebook-adaptor?url=${encodeURIComponent(testUrl)}`);
      assert.equal(this.res.body[0].title, 'adapted title');
    });

    it('does no html parsing if the service returns json', function() {
      assert.equal(this.res.body[0].title, 'adapted title');
      sinon.assert.notCalled(parseHtml.parse);
    });
  });

  describe('after redirects', function() {
    beforeEach(function(done) {
      this.shortenedUrl = 'http://goo.gl/WNdChy';

      // redirect
      nock('http://goo.gl')
        .get('/WNdChy')
        .reply(301, 'CONTENT', {
          'Location': testUrl,
          'Content-Type': 'text/html; charset=utf-8'
        });

      // unwrapped url response
      nock(testUrl)
        .get(/./)
        .reply(200);

      // adaptor response
      this.adaptorUrlStub = nock(adaptorUrl)
        .get(/./)
        .reply(200, '<title>wilson page</title>');

      supertest(app)
        .post('/metadata/')
        .send({
          objects: [{ url: this.shortenedUrl }],
          adaptors: requestBody.adaptors
        })

        .end((err, res) => {
          if (err) {
            throw err;
          }

          this.res = res;
          done();
        });
    });

    it('it uses matching adaptors', function() {
      assert.equal(this.res.body[0].title, 'wilson page');
      assert.equal(this.adaptorUrlStub.isDone(), true, 'adaptor was used');
    });

    it('returns the `originalUrl` before redirects and adaptors', function() {
      assert.equal(this.res.body[0].originalUrl, this.shortenedUrl);
    });

    it('returns the `unadaptedUrl` before adaptors', function() {
      assert.equal(this.res.body[0].unadaptedUrl, testUrl);
    });
  });
});
