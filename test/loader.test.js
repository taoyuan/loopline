'use strict';

var assert = require('chai').assert;
var path = require('path');
var loopline = require('..');

describe('loader', function () {

  var line;

  beforeEach(function () {
    line = loopline();
  });

  it('should load models', function () {
    line.dataSource('default', {connector: 'memory'});
    loopline.load(line, path.resolve(__dirname, 'fixtures'), {dataSource: 'default'});
    assert.ok(line.models('customer'));
  });

  it('should persist model instance', function () {
    line.dataSource('default', {connector: 'memory'});
    loopline.load(line, path.resolve(__dirname, 'fixtures'), {dataSource: 'default'});
    var Customer = loopline.getModel('Customer');
    var customer = new Customer();
    customer.name = 'TY';
    return customer.save().then(function () {
      return Customer.findById(customer.id).then(function (cus) {
        assert.equal(cus.name, customer.name);
      });
    });
  });
});
