"use strict";

var util = require('util');
var inherits = util.inherits;
var JdbMemory = require('loopback-datasource-juggler/lib/connectors/memory');
var Connector = require('./base-connector');

module.exports = Memory;

/**
 * Create a new `Memory` connector with the given `options`.
 *
 * @param {Object} options
 * @return {Memory}
 */

function Memory() {
  // TODO implement entire memory connector
}

/**
 * Inherit from `DBConnector`.
 */

inherits(Memory, Connector);

/**
 * JugglingDB Compatibility
 */

Memory.initialize = JdbMemory.initialize;
