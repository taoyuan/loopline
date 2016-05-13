var assert = require('assert');
var extend = require('util')._extend;
var juggler = require('loopback-datasource-juggler');
var debug = require('debug')('loopback:registry');
var DataSource = juggler.DataSource;
var ModelBuilder = juggler.ModelBuilder;

module.exports = Registry;

/**
 * Define and reference `Models` and `DataSources`.
 *
 * @class
 */

function Registry() {
  this.defaultDataSources = {};
  this.modelBuilder = new ModelBuilder();
  require('./model')(this);
  require('./persisted-model')(this);
  // this.modelBuilder.define('Model');
  // this.modelBuilder.define('PersistedModel');

  // Set the default model base class.
  this.modelBuilder.defaultModelBaseClass = this.getModel('Model');
}

/**
 * Create a named vanilla JavaScript class constructor with an attached
 * set of properties and options.
 *
 * This function comes with two variants:
 *  * `registry.createModel(name, properties, options)`
 *  * `registry.createModel(config)`
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
 * registry.createModel(
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
 * registry.createModel({
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
 * @param {String|Object} name Unique name.
 * @param {Object} [properties]
 * @param {Object} [options] (optional)
 *
 * @header registry.createModel
 */

Registry.prototype.createModel = function(name, properties, options) {
  if (arguments.length === 1 && typeof name === 'object') {
    var config = name;
    name = config.name;
    properties = config.properties;
    options = buildModelOptionsFromConfig(config);

    assert(typeof name === 'string', 'The model-config property `name` must be a string');
  }

  options = options || {};
  var BaseModel = options.base || options.super;

  if (typeof BaseModel === 'string') {
    var baseName = BaseModel;
    BaseModel = this.findModel(BaseModel);
    if (!BaseModel) {
      throw new Error('Model not found: model `' + name + '` is extending an unknown model `' +
        baseName + '`.');
    }
  }

  BaseModel = BaseModel || this.getModel('PersistedModel');
  var model = BaseModel.extend(name, properties, options);
  model.registry = this;

  return model;
};

function buildModelOptionsFromConfig(config) {
  var options = extend({}, config.options);
  for (var key in config) {
    if (['name', 'properties', 'options'].indexOf(key) !== -1) {
      // Skip items which have special meaning
      continue;
    }

    if (options[key] !== undefined) {
      // When both `config.key` and `config.options.key` are set,
      // use the latter one
      continue;
    }

    options[key] = config[key];
  }
  return options;
}

/*
 * Add the acl entry to the acls
 * @param {Object[]} acls
 * @param {Object} acl
 */
function addACL(acls, acl) {
  for (var i = 0, n = acls.length; i < n; i++) {
    // Check if there is a matching acl to be overriden
    if (acls[i].property === acl.property &&
      acls[i].accessType === acl.accessType &&
      acls[i].principalType === acl.principalType &&
      acls[i].principalId === acl.principalId) {
      acls[i] = acl;
      return;
    }
  }
  acls.push(acl);
}

/**
 * Alter an existing Model class.
 * @param {Model} ModelCtor The model constructor to alter.
 * @param {Object} config Additional configuration to apply
 * @property {DataSource} dataSource Attach the model to a dataSource.
 * @property {Object} [relations] Model relations to add/update.
 *
 * @header registry.configureModel(ModelCtor, config)
 */

Registry.prototype.configureModel = function(ModelCtor, config) {
  var settings = ModelCtor.settings;
  var modelName = ModelCtor.modelName;

  // Relations
  if (typeof config.relations === 'object' && config.relations !== null) {
    var relations = settings.relations = settings.relations || {};
    Object.keys(config.relations).forEach(function(key) {
      // FIXME: [rfeng] We probably should check if the relation exists
      relations[key] = extend(relations[key] || {}, config.relations[key]);
    });
  } else if (config.relations != null) {
    console.warn('The relations property of `%s` configuration ' +
      'must be an object', modelName);
  }

  // ACLs
  if (Array.isArray(config.acls)) {
    var acls = settings.acls = settings.acls || [];
    config.acls.forEach(function(acl) {
      addACL(acls, acl);
    });
  } else if (config.acls != null) {
    console.warn('The acls property of `%s` configuration ' +
      'must be an array of objects', modelName);
  }

  // Settings
  var excludedProperties = {
    base: true,
    'super': true,
    relations: true,
    acls: true,
    dataSource: true,
  };
  if (typeof config.options === 'object' && config.options !== null) {
    for (var p in config.options) {
      if (!(p in excludedProperties)) {
        settings[p] = config.options[p];
      } else {
        console.warn('Property `%s` cannot be reconfigured for `%s`',
          p, modelName);
      }
    }
  } else if (config.options != null) {
    console.warn('The options property of `%s` configuration ' +
      'must be an object', modelName);
  }

  // It's important to attach the datasource after we have updated
  // configuration, so that the datasource picks up updated relations
  if (config.dataSource) {
    assert(config.dataSource instanceof DataSource,
      'Cannot configure ' + ModelCtor.modelName + ': config.dataSource must be an instance of DataSource');
    ModelCtor.attachTo(config.dataSource);
    debug('Attached model `%s` to dataSource `%s`',
      modelName, config.dataSource.name);
  } else if (config.dataSource === null || config.dataSource === false) {
    debug('Model `%s` is not attached to any DataSource by configuration.', modelName);
  } else {
    debug('Model `%s` is not attached to any DataSource, possibly by a mistake.', modelName);
    console.warn(
      'The configuration of `%s` is missing `dataSource` property.\n' +
      'Use `null` or `false` to mark models not attached to any data source.',
      modelName);
  }
};

/**
 * Look up a model class by name from all models created by
 * `registry.createModel()`
 * @param {String|Function} modelOrName The model name or a `Model` constructor.
 * @returns {Model} The model class
 *
 * @header registry.findModel(modelName)
 */
Registry.prototype.findModel = function(modelOrName) {
  if (typeof modelOrName === 'function') return modelOrName;
  return this.modelBuilder.models[modelOrName];
};

/**
 * Look up a model class by name from all models created by
 * `registry.createModel()`. **Throw an error when no such model exists.**
 *
 * @param {String} modelOrName The model name or a `Model` constructor.
 * @returns {Model} The model class
 *
 * @header registry.getModel(modelName)
 */
Registry.prototype.getModel = function(modelOrName) {
  var model = this.findModel(modelOrName);
  if (model) return model;

  throw new Error('Model not found: ' + modelOrName);
};

/**
 * Look up a model class by the base model class.
 * The method can be used by LoopBack
 * to find configured models in models.json over the base model.
 * @param {Model} modelType The base model class
 * @returns {Model} The subclass if found or the base class
 *
 * @header registry.getModelByType(modelType)
 */
Registry.prototype.getModelByType = function(modelType) {
  var type = typeof modelType;
  var accepted = ['function', 'string'];

  assert(accepted.indexOf(type) > -1,
    'The model type must be a constructor or model name');

  if (type === 'string') {
    modelType = this.getModel(modelType);
  }

  var models = this.modelBuilder.models;
  for (var m in models) {
    if (models[m].prototype instanceof modelType) {
      return models[m];
    }
  }
  return modelType;
};

/**
 * Create a data source with passing the provided options to the connector.
 *
 * @param {String} name Optional name.
 * @options {Object} options Data Source options
 * @property {Object} connector LoopBack connector.
 * @property {*} [*] Other&nbsp;connector properties.
 *   See the relevant connector documentation.
 */

Registry.prototype.createDataSource = function(name, options) {
  var self = this;

  var ds = new DataSource(name, options, self.modelBuilder);
  ds.createModel = function(name, properties, settings) {
    settings = settings || {};
    var BaseModel = settings.base || settings.super;
    if (!BaseModel) {
      // Check the connector types
      var connectorTypes = ds.getTypes();
      if (Array.isArray(connectorTypes) && connectorTypes.indexOf('db') !== -1) {
        // Only set up the base model to PersistedModel if the connector is DB
        BaseModel = self.PersistedModel;
      } else {
        BaseModel = self.Model;
      }
      settings.base = BaseModel;
    }
    var ModelCtor = self.createModel(name, properties, settings);
    ModelCtor.attachTo(ds);
    return ModelCtor;
  };

  if (ds.settings && ds.settings.defaultForType) {
    var msg = 'DataSource option "defaultForType" is no longer supported';
    throw new Error(msg);
  }

  return ds;
};

/**
 * Get an in-memory data source. Use one if it already exists.
 *
 * @param {String} [name] The name of the data source.
 * If not provided, the `'default'` is used.
 */

Registry.prototype.memory = function(name) {
  name = name || 'default';
  var memory = (
    this._memoryDataSources || (this._memoryDataSources = {})
  )[name];

  if (!memory) {
    memory = this._memoryDataSources[name] = this.createDataSource({
      connector: 'memory'
    });
  }

  return memory;
};