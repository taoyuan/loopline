'use strict';

var assert = require('chai').assert;
var path = require('path');
var loopline = require('..');
var load = require('../lib/loader');

describe('loader', function () {

  var line;

  beforeEach(function () {
    line = loopline();
  });

  it('should load models', function () {
    line.dataSource('default', {connector: 'memory'});
    load(line, path.resolve(__dirname, 'fixtures'), {dataSource: 'default'});
    assert.ok(line.models('customer'));
  });
});
