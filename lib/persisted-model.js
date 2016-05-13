"use strict";

module.exports = function(registry) {
  var Model = registry.getModel('Model');

  /**
   * Extends Model with basic query and CRUD support.
   *
   * **Change Event**
   *
   * Listen for model changes using the `change` event.
   *
   * ```js
   * MyPersistedModel.on('changed', function(obj) {
   *    console.log(obj) // => the changed model
   * });
   * ```
   *
   * @class PersistedModel
   */

  var PersistedModel = Model.extend('PersistedModel');

  /*!
   * Setup the `PersistedModel` constructor.
   */
  PersistedModel.setup = function setupPersistedModel() {
    // call Model.setup first
    Model.setup.call(this);

  };

  PersistedModel.setup();

  return PersistedModel;
};
