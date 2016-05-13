"use strict";

var DataSource = require('loopback-datasource-juggler').DataSource;
var assert = require('assert');
var fs = require('fs');
var extend = require('util')._extend;
var classify = require('underscore.string/classify');
var camelize = require('underscore.string/camelize');
var path = require('path');
var util = require('util');

/**
 * The `Line` object represents a Loopback application.
 *
 * The Line object extends [Express](http://expressjs.com/api.html#express) and
 * supports Express middleware. See
 * [Express documentation](http://expressjs.com/) for details.
 *
 * ```js
 * var loopline = require('loopline');
 * var line = loopline();
 * ```
 *
 * @class Line
 * @header var line = loopline()
 */
function Line() {
  // this is a dummy placeholder for jsdox
}

/*!
 * Export the line prototype.
 */

var line = module.exports = {};

/**
 * Attach a model to the line. The `Model` will be available on the
 * `line.models` object.
 *
 * Example - Attach an existing model:
 ```js
 * var User = loopline.User;
 * line.model(User);
 *```
 * Example - Attach an existing model, alter some aspects of the model:
 * ```js
 * var User = loopline.User;
 * line.model(User, { dataSource: 'db' });
 *```
 *
 * @param {Object|String} Model The model to attach.
 * @param {Object} config The model's configuration.
 * @property {String|DataSource} dataSource The `DataSource` to which to attach the model.
 * @property {Boolean} [public] Whether the model should be exposed via REST API.
 * @property {Object} [relations] Relations to add/update.
 * @end
 * @returns {ModelConstructor} the model class
 */

line.model = function(Model, config) {
  var registry = this.registry;

  if (arguments.length > 1) {
    config = config || {};
    if (typeof Model === 'string') {
      // create & attach the model - backwards compatibility

      // create config for loopline.modelFromConfig
      var modelConfig = extend({}, config);
      modelConfig.options = extend({}, config.options);
      modelConfig.name = Model;

      // modeller does not understand `dataSource` option
      delete modelConfig.dataSource;

      Model = registry.createModel(modelConfig);

      // delete config options already applied
      ['relations', 'base', 'acls', 'hidden', 'methods'].forEach(function(prop) {
        delete config[prop];
        if (config.options) delete config.options[prop];
      });
      delete config.properties;
    }

    configureModel(Model, config, this);
  } else {
    assert(Model.prototype instanceof Model.registry.getModel('Model'),
      Model.modelName + ' must be a descendant of loopline.Model');
  }

  var modelName = Model.modelName;
  this.models[modelName] =
    this.models[classify(modelName)] =
      this.models[camelize(modelName)] = Model;

  this.models().push(Model);

  Model.line = this;
  Model.emit('attached', this);
  return Model;
};

/**
 * Get the models exported by the line. Returns only models defined using `line.model()`
 *
 * There are two ways to access models:
 *
 * 1.  Call `line.models()` to get a list of all models.
 *
 * ```js
 * var models = line.models();
 *
 * models.forEach(function(Model) {
 *  console.log(Model.modelName); // color
 * });
 * ```
 *
 * 2. Use `line.model` to access a model by name.
 * `line.models` has properties for all defined models.
 *
 * The following example illustrates accessing the `Product` and `CustomerReceipt` models
 * using the `models` object.
 *
 * ```js
 * var loopline = require('loopline');
 *  var line = loopline();
 *  line.boot({
 *   dataSources: {
 *     db: {connector: 'memory'}
 *   }
 * });
 *
 * line.model('product', {dataSource: 'db'});
 * line.model('customer-receipt', {dataSource: 'db'});
 *
 * // available based on the given name
 * var Product = line.models.Product;
 *
 * // also available as camelCase
 * var product = line.models.product;
 *
 * // multi-word models are avaiable as pascal cased
 * var CustomerReceipt = line.models.CustomerReceipt;
 *
 * // also available as camelCase
 * var customerReceipt = line.models.customerReceipt;
 * ```
 *
 * @returns {Array} Array of model classes.
 */

line.models = function() {
  return this._models || (this._models = []);
};

/**
 * Define a DataSource.
 *
 * @param {String} name The data source name
 * @param {Object} config The data source config
 */
line.dataSource = function(name, config) {
  try {
    var ds = dataSourcesFromConfig(name, config, this.connectors, this.registry);
    this.dataSources[name] =
      this.dataSources[classify(name)] =
        this.dataSources[camelize(name)] = ds;
    return ds;
  } catch (err) {
    if (err.message) {
      err.message = 'Cannot create data source ' + JSON.stringify(name) + ': ' + err.message;
    }
    throw err;
  }
};

/**
 * Register a connector.
 *
 * When a new data-source is being added via `line.dataSource`, the connector
 * name is looked up in the registered connectors first.
 *
 * Connectors are required to be explicitly registered only for applications
 * using browserify, because browserify does not support dynamic require,
 * which is used by LoopBack to automatically load the connector module.
 *
 * @param {String} name Name of the connector, e.g. 'mysql'.
 * @param {Object} connector Connector object as returned
 *   by `require('loopback-connector-{name}')`.
 */
line.connector = function(name, connector) {
  this.connectors[name] =
    this.connectors[classify(name)] =
      this.connectors[camelize(name)] = connector;
};

/**
 * An object to store dataSource instances.
 */

line.dataSources = line.datasources = {};

function dataSourcesFromConfig(name, config, connectorRegistry, registry) {
  var connectorPath;

  assert(typeof config === 'object',
    'can not create data source without config object');

  if (typeof config.connector === 'string') {
    name = config.connector;
    if (connectorRegistry[name]) {
      config.connector = connectorRegistry[name];
    } else {
      connectorPath = path.join(__dirname, 'connectors', name + '.js');

      if (fs.existsSync(connectorPath)) {
        config.connector = require(connectorPath);
      }
    }
    if (!config.connector.name)
      config.connector.name = name;
  }

  return registry.createDataSource(config);
}

function configureModel(ModelCtor, config, line) {
  assert(ModelCtor.prototype instanceof ModelCtor.registry.getModel('Model'),
    ModelCtor.modelName + ' must be a descendant of loopline.Model');

  var dataSource = config.dataSource;

  if (dataSource) {
    if (typeof dataSource === 'string') {
      dataSource = line.dataSources[dataSource];
    }

    assert(
      dataSource instanceof DataSource,
      ModelCtor.modelName + ' is referencing a dataSource that does not exist: "' +
      config.dataSource + '"'
    );
  }

  config = extend({}, config);
  config.dataSource = dataSource;

  line.registry.configureModel(ModelCtor, config);
}
