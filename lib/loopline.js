"use strict";

var merge = require('util')._extend;
var juggler = require('loopback-datasource-juggler');
var proto = require('./line');
var Registry = require('./registry');
var load = require('./loader');

/**
 * LoopBack core module. It provides static properties and
 * methods to create models and data sources. The module itself is a function
 * that creates loopline `app`. For example:
 *
 * ```js
 * var loopline = require('loopline');
 * ```
 *
 * @property {String} version Version of LoopBack framework.  Static read-only property.
 * @property {String} mime
 * @property {Boolean} isBrowser True if running in a browser environment; false otherwise.  Static read-only property.
 * @property {Boolean} isServer True if running in a server environment; false otherwise.  Static read-only property.
 * @property {Registry} registry The global `Registry` object.
 * @property {String} faviconFile Path to a default favicon shipped with LoopBack.
 * Use as follows: `app.use(require('serve-favicon')(loopline.faviconFile));`
 * @class loopline
 * @header loopline
 */

var loopline = module.exports = createLine;

/*!
 * Framework version.
 */

loopline.version = require('../package.json').version;

/*!
 * Expose mime.
 */

loopline.registry = new Registry();

Object.defineProperties(loopline, {
  Model: {
    get: function() { return this.registry.getModel('Model'); }
  },
  PersistedModel: {
    get: function() { return this.registry.getModel('PersistedModel'); }
  },
  defaultDataSources: {
    get: function() { return this.registry.defaultDataSources; }
  },
  modelBuilder: {
    get: function() { return this.registry.modelBuilder; }
  }
});


/*!
 * Create an line.
 *
 * @return {Function}
 * @api public
 */

function createLine(options) {
  var app = {};

  merge(app, proto);

  app.loopline = loopline;

  // Create a new instance of models registry per each app instance
  app.models = function() {
    return proto.models.apply(this, arguments);
  };

  // Create a new instance of datasources registry per each app instance
  app.datasources = app.dataSources = {};

  // Create a new instance of connector registry per each app instance
  app.connectors = {};

  // Register built-in connectors. It's important to keep this code
  // hand-written, so that all require() calls are static
  // and thus browserify can process them (include connectors in the bundle)
  app.connector('memory', loopline.Memory);

  if (loopline.localRegistry || options && options.localRegistry === true) {
    // setup the app registry
    var registry = app.registry = new Registry();
    if (options && options.loadBuiltinModels === true) {
      // require('./builtin-models')(registry);
    }
  } else {
    app.registry = loopline.registry;
  }

  return app;
}

loopline.load = load;

/**
 * Create a named vanilla JavaScript class constructor with an attached
 * set of properties and options.
 *
 * This function comes with two variants:
 *  * `loopline.createModel(name, properties, options)`
 *  * `loopline.createModel(config)`
 *
 * In the second variant, the parameters `name`, `properties` and `options`
 * are provided in the config object. Any additional config entries are
 * interpreted as `options`, i.e. the following two configs are identical:
 *
 * ```js
 * { name: 'Customer', base: 'User' }
 * { name: 'Customer', options: { base: 'User' } }
 * ```
 *
 * **Example**
 *
 * Create an `Author` model using the three-parameter variant:
 *
 * ```js
 * loopline.createModel(
 *   'Author',
 *   {
 *     firstName: 'string',
 *     lastName: 'string'
 *   },
 *   {
 *     relations: {
 *       books: {
 *         model: 'Book',
 *         type: 'hasAndBelongsToMany'
 *       }
 *     }
 *   }
 * );
 * ```
 *
 * Create the same model using a config object:
 *
 * ```js
 * loopline.createModel({
 *   name: 'Author',
 *   properties: {
 *     firstName: 'string',
 *     lastName: 'string'
 *   },
 *   relations: {
 *     books: {
 *       model: 'Book',
 *       type: 'hasAndBelongsToMany'
 *     }
 *   }
 * });
 * ```
 *
 * @param {String} name Unique name.
 * @param {Object} properties
 * @param {Object} options (optional)
 *
 * @header loopline.createModel
 */

loopline.createModel = function(name, properties, options) {
  return this.registry.createModel.apply(this.registry, arguments);
};

/**
 * Alter an existing Model class.
 * @param {Model} ModelCtor The model constructor to alter.
 * @param {Object} config Additional configuration to apply
 * @property {DataSource} dataSource Attach the model to a dataSource.
 * @property {Object} [relations] Model relations to add/update.
 *
 * @header loopline.configureModel(ModelCtor, config)
 */

loopline.configureModel = function(ModelCtor, config) {
  return this.registry.configureModel.apply(this.registry, arguments);
};

/**
 * Look up a model class by name from all models created by
 * `loopline.createModel()`
 * @param {String} modelName The model name
 * @returns {Model} The model class
 *
 * @header loopline.findModel(modelName)
 */
loopline.findModel = function(modelName) {
  return this.registry.findModel.apply(this.registry, arguments);
};

/**
 * Look up a model class by name from all models created by
 * `loopline.createModel()`. Throw an error when no such model exists.
 *
 * @param {String} modelName The model name
 * @returns {Model} The model class
 *
 * @header loopline.getModel(modelName)
 */
loopline.getModel = function(modelName) {
  return this.registry.getModel.apply(this.registry, arguments);
};

/**
 * Look up a model class by the base model class.
 * The method can be used by LoopBack
 * to find configured models in models.json over the base model.
 * @param {Model} modelType The base model class
 * @returns {Model} The subclass if found or the base class
 *
 * @header loopline.getModelByType(modelType)
 */
loopline.getModelByType = function(modelType) {
  return this.registry.getModelByType.apply(this.registry, arguments);
};

/**
 * Create a data source with passing the provided options to the connector.
 *
 * @param {String} name Optional name.
 * @param {Object} options Data Source options
 * @property {Object} connector LoopBack connector.
 * @property {*} [*] Other&nbsp;connector properties.
 *   See the relevant connector documentation.
 */

loopline.createDataSource = function(name, options) {
  return this.registry.createDataSource.apply(this.registry, arguments);
};

/**
 * Get an in-memory data source. Use one if it already exists.
 *
 * @param {String} [name] The name of the data source.
 * If not provided, the `'default'` is used.
 */

loopline.memory = function(name) {
  return this.registry.memory.apply(this.registry, arguments);
};
/*!
 * Built in models / services
 */

loopline.DataSource = juggler.DataSource;
