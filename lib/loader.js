"use strict";

var assert = require('assert');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var toposort = require('toposort');
var Module = require('module');
var debug = require('debug')('loopline:loader');

var FILE_EXTENSION_JSON = '.json';

module.exports = function (line, root, options) {
  assert(line && line.loopline && line.model, '`line` is invalid');

  if (typeof root === 'string') {
    options = options || {};
    options.root = root;
    root = null;
  }

  options = options || root || {};
  options.root = options.root || process.cwd();
  options.dataSouce = options.dataSouce || 'default';

  return setupModels(line, {
    models: loadModelInstructions(options.root, options)
  });
};

function setupModels(line, instructions) {
  defineMixins(line, instructions);
  defineModels(line, instructions);

  return instructions.models.forEach(function (data) {
    // Skip base models that are not exported to the line
    if (!data.config) return;

    line.model(data._model, data.config);
  });
}

function defineMixins(line, instructions) {
  var loopline = line.loopback || line.loopline;
  var modelBuilder = (line.registry || loopline).modelBuilder;
  var BaseClass = loopline.Model;
  var mixins = instructions.mixins || [];

  if (!modelBuilder.mixins || !mixins.length) return;

  mixins.forEach(function (obj) {
    var mixin = require(obj.sourceFile);

    if (typeof mixin === 'function' || mixin.prototype instanceof BaseClass) {
      debug('Defining mixin %s', obj.name);
      modelBuilder.mixins.define(obj.name, mixin); // TODO (name, mixin, meta)
    } else {
      debug('Skipping mixin file %s - `module.exports` is not a function or Loopback model', obj);
    }
  });
}

function defineModels(line, instructions) {
  var registry = line.registry || line.loopback;
  instructions.models.forEach(function (data) {
    var name = data.name;
    var model;

    if (!data.definition) {
      model = registry.getModel(name);
      if (!model) {
        throw new Error('Cannot configure unknown model ' + name);
      }
      debug('Configuring existing model %s', name);
      // } else if (isBuiltinLoopBackModel(line, data)) {
      //   model = registry.getModel(name);
      //   assert(model, 'Built-in model ' + name + ' should have been defined');
      //   debug('Configuring built-in LoopBack model %s', name);
    } else {
      debug('Creating new model %s %j', name, data.definition);
      model = registry.createModel(data.definition);
      if (data.sourceFile) {
        debug('Loading customization script %s', data.sourceFile);
        var code = require(data.sourceFile);
        if (typeof code === 'function') {
          debug('Customizing model %s', name);
          code(model);
        } else {
          debug('Skipping model file %s - `module.exports` is not a function', data.sourceFile);
        }
      }
    }

    data._model = model;
  });
}

function loadModelInstructions(root, options) {
  var sources = options.sources || ['./models'];
  return buildAllModelInstructions(root, sources, options.modelDefinitions, options);
}

function buildAllModelInstructions(rootDir, sources, modelDefinitions, options) {
  var modelsConfig = options.models;
  var registry = verifyModelDefinitions(rootDir, modelDefinitions) || findModelDefinitions(rootDir, sources);

  var modelNamesToBuild = addAllBaseModels(registry, Object.keys(modelsConfig || registry));

  var instructions = modelNamesToBuild.map(function createModelInstructions(name) {
    var config = modelsConfig ? modelsConfig[name] : {dataSource: options.dataSouce};
    var definition = registry[name] || {};

    debug('Using model "%s"\nConfiguration: %j\nDefinition %j', name, config, definition.definition);

    return {
      name: name,
      config: config,
      definition: definition.definition,
      sourceFile: definition.sourceFile
    };
  });

  return sortByInheritance(instructions);
}

// ---------------------------------------------
//
// ---------------------------------------------

function tryReadDir() {
  try {
    return fs.readdirSync.apply(fs, arguments);
  } catch (e) {
    return [];
  }
}

function getExcludedExtensions() {
  return {
    '.json': '.json',
    '.node': 'node'
  };
}

function isPreferredExtension(filename) {
  var includeExtensions = require.extensions;

  var ext = path.extname(filename);
  return (ext in includeExtensions) && !(ext in getExcludedExtensions());
}

function fixFileExtension(filepath, files, onlyScriptsExportingFunction) {
  var results = [];
  var otherFile;

  /* Prefer coffee scripts over json */
  if (isPreferredExtension(filepath)) return filepath;

  var basename = path.basename(filepath, FILE_EXTENSION_JSON);
  var sourceDir = path.dirname(filepath);

  files.forEach(function (f) {
    otherFile = path.resolve(sourceDir, f);

    var stats = fs.statSync(otherFile);
    if (stats.isFile()) {
      var otherFileExtension = path.extname(f);

      if (!(otherFileExtension in getExcludedExtensions()) &&
        path.basename(f, otherFileExtension) == basename) {
        if (!onlyScriptsExportingFunction)
          results.push(otherFile);
        else if (onlyScriptsExportingFunction &&
          (typeof require.extensions[otherFileExtension]) === 'function') {
          results.push(otherFile);
        }
      }
    }
  });
  return (results.length > 0 ? results[0] : undefined);
}

function addAllBaseModels(registry, modelNames) {
  var result = [];
  var visited = {};

  while (modelNames.length) {
    var name = modelNames.shift();

    if (visited[name]) continue;
    visited[name] = true;
    result.push(name);

    var definition = registry[name] && registry[name].definition;
    if (!definition) continue;

    var base = getBaseModelName(definition);

    // ignore built-in models like User
    if (!registry[base]) continue;

    modelNames.push(base);
  }

  return result;
}

function getBaseModelName(modelDefinition) {
  if (!modelDefinition)
    return undefined;

  return modelDefinition.base || modelDefinition.options && modelDefinition.options.base;
}

function sortByInheritance(instructions) {
  // create edges Base name -> Model name
  var edges = instructions
    .map(function (inst) {
      return [getBaseModelName(inst.definition), inst.name];
    });

  var sortedNames = toposort(edges);

  var instructionsByModelName = {};
  instructions.forEach(function (inst) {
    instructionsByModelName[inst.name] = inst;
  });

  return sortedNames
  // convert to instructions
    .map(function (name) {
      return instructionsByModelName[name];
    })
    // remove built-in models
    .filter(function (inst) {
      return !!inst;
    });
}

function verifyModelDefinitions(rootDir, modelDefinitions) {
  if (!modelDefinitions || modelDefinitions.length < 1) {
    return undefined;
  }

  var registry = {};
  modelDefinitions.forEach(function (definition, idx) {
    if (definition.sourceFile) {
      var fullPath = path.resolve(rootDir, definition.sourceFile);
      definition.sourceFile = fixFileExtension(
        fullPath,
        tryReadDir(path.dirname(fullPath)),
        true);
      if (!definition.sourceFile) {
        debug('Model source code not found: %s - %s', definition.sourceFile);
      }
    }

    debug('Found model "%s" - %s %s', definition.definition.name, 'from options',
      definition.sourceFile ? path.relative(rootDir, definition.sourceFile) : '(no source file)');

    var modelName = definition.definition.name;
    if (!modelName) {
      debug('Skipping model definition without Model name ' +
        '(from options.modelDefinitions @ index %s)',
        idx);
      return;
    }
    registry[modelName] = definition;
  });

  return registry;
}

function findModelDefinitions(rootDir, sources) {
  var registry = {};

  sources.forEach(function (src) {
    var srcDir = tryResolveAppPath(rootDir, src, {strict: false});
    if (!srcDir) {
      debug('Skipping unknown module source dir %j', src);
      return;
    }

    var files = tryReadDir(srcDir);

    files
      .filter(function (f) {
        return f[0] !== '_' && path.extname(f) === '.json';
      })
      .forEach(function (f) {
        var fullPath = path.resolve(srcDir, f);
        var entry = loadModelDefinition(rootDir, fullPath, files);
        var modelName = entry.definition.name;
        if (!modelName) {
          debug('Skipping model definition without Model name: %s',
            path.relative(srcDir, fullPath));
          return;
        }
        registry[modelName] = entry;
      });
  });

  return registry;
}


function loadModelDefinition(rootDir, jsonFile, allFiles) {
  var definition = require(jsonFile);
  var basename = path.basename(jsonFile, path.extname(jsonFile));
  definition.name = definition.name || _.capitalize(_.camelCase(basename));

  // find a matching file with a supported extension like `.js` or `.coffee`
  var sourceFile = fixFileExtension(jsonFile, allFiles, true);

  if (sourceFile === undefined) {
    debug('Model source code not found: %s', sourceFile);
  }

  debug('Found model "%s" - %s %s', definition.name, path.relative(rootDir, jsonFile),
    sourceFile ? path.relative(rootDir, sourceFile) : '(no source file)');

  return {
    definition: definition,
    sourceFile: sourceFile
  };
}


function tryResolveAppPath(rootDir, relativePath, resolveOptions) {
  var fullPath;
  var start = relativePath.substring(0, 2);

  /* In order to retain backward compatibility, we need to support
   * two ways how to treat values that are not relative nor absolute
   * path (e.g. `relativePath = 'foobar'`)
   *  - `resolveOptions.strict = true` searches in `node_modules` only
   *  - `resolveOptions.strict = false` attempts to resolve the value
   *     as a relative path first before searching `node_modules`
   */
  resolveOptions = resolveOptions || {strict: true};

  var isModuleRelative = false;
  if (relativePath[0] === '/') {
    fullPath = relativePath;
  } else if (start === './' || start === '..') {
    fullPath = path.resolve(rootDir, relativePath);
  } else if (!resolveOptions.strict) {
    isModuleRelative = true;
    fullPath = path.resolve(rootDir, relativePath);
  }

  if (fullPath) {
    // This check is needed to support paths pointing to a directory
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }

    try {
      fullPath = require.resolve(fullPath);
      return fullPath;
    } catch (err) {
      if (!isModuleRelative) {
        debug('Skipping %s - %s', fullPath, err);
        return undefined;
      }
    }
  }

  // Handle module-relative path, e.g. `loopback/common/models`

  // Module.globalPaths is a list of globally configured paths like
  //   [ env.NODE_PATH values, $HOME/.node_modules, etc. ]
  // Module._nodeModulePaths(rootDir) returns a list of paths like
  //   [ rootDir/node_modules, rootDir/../node_modules, etc. ]
  var modulePaths = Module.globalPaths
    .concat(Module._nodeModulePaths(rootDir));

  fullPath = modulePaths
    .map(function (candidateDir) {
      var absPath = path.join(candidateDir, relativePath);
      try {
        // NOTE(bajtos) We need to create a proper String object here,
        // otherwise we can't attach additional properties to it
        var filePath = new String(require.resolve(absPath));
        filePath.unresolvedPath = absPath;
        return filePath;
      } catch (err) {
        return absPath;
      }
    })
    .filter(function (candidate) {
      return fs.existsSync(candidate.toString());
    })
    [0];

  if (fullPath) {
    if (fullPath.unresolvedPath && resolveOptions.fullResolve === false)
      return fullPath.unresolvedPath;
    // Convert String object back to plain string primitive
    return fullPath.toString();
  }

  debug('Skipping %s - module not found', fullPath);
  return undefined;
}
