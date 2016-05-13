"use strict";

module.exports = function(registry) {
  var Model = registry.modelBuilder.define('Model');

  Model.registry = registry;

  Model.setup = function() {

  };

  Model.setup();

  return Model;
};
