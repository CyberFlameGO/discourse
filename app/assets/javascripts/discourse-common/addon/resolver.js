import { classify, dasherize } from "@ember/string";
import deprecated from "discourse-common/lib/deprecated";
import { findHelper } from "discourse-common/lib/helpers";
import { get } from "@ember/object";
import SuffixTrie from "discourse-common/lib/suffix-trie";

let _options = {};
let moduleSuffixTrie = null;

export function setResolverOption(name, value) {
  _options[name] = value;
}

export function getResolverOption(name) {
  return _options[name];
}

export function clearResolverOptions() {
  _options = {};
}

function parseName(fullName) {
  const nameParts = fullName.split(":");
  const type = nameParts[0];
  let fullNameWithoutType = nameParts[1];
  const namespace = get(this, "namespace");
  const root = namespace;

  return {
    fullName,
    type,
    fullNameWithoutType,
    name: fullNameWithoutType,
    root,
    resolveMethodName: "resolve" + classify(type),
  };
}

function lookupModuleBySuffix(suffix) {
  if (!moduleSuffixTrie) {
    moduleSuffixTrie = new SuffixTrie("/");
    Object.keys(requirejs.entries).forEach((name) => {
      if (!name.includes("/templates/")) {
        moduleSuffixTrie.add(name);
      }
    });
  }
  return moduleSuffixTrie.withSuffix(suffix, 1)[0];
}

export function buildResolver(baseName) {
  return Ember.DefaultResolver.extend({
    parseName,

    resolveRouter(parsedName) {
      const routerPath = `${baseName}/router`;
      if (requirejs.entries[routerPath]) {
        const module = requirejs(routerPath, null, null, true);
        return module.default;
      }
      return this._super(parsedName);
    },

    normalize(fullName) {
      if (fullName === "app-events:main") {
        deprecated(
          "`app-events:main` has been replaced with `service:app-events`",
          { since: "2.4.0" }
        );
        return "service:app-events";
      }

      for (const [key, value] of Object.entries({
        "controller:discovery.categoryWithID": "controller:discovery.category",
        "controller:discovery.parentCategory": "controller:discovery.category",
        "controller:tags-show": "controller:tag-show",
        "controller:tags.show": "controller:tag.show",
        "controller:tagsShow": "controller:tagShow",
        "route:discovery.categoryWithID": "route:discovery.category",
        "route:discovery.parentCategory": "route:discovery.category",
        "route:tags-show": "route:tag-show",
        "route:tags.show": "route:tag.show",
        "route:tagsShow": "route:tagShow",
      })) {
        if (fullName === key) {
          deprecated(`${key} was replaced with ${value}`, { since: "2.6.0" });
          return value;
        }
      }

      const split = fullName.split(":");
      if (split.length > 1) {
        const appBase = `${baseName}/${split[0]}s/`;
        const adminBase = "admin/" + split[0] + "s/";

        // Allow render 'admin/templates/xyz' too
        split[1] = split[1].replace(".templates", "").replace("/templates", "");

        // Try slashes
        let dashed = dasherize(split[1].replace(/\./g, "/"));
        if (
          requirejs.entries[appBase + dashed] ||
          requirejs.entries[adminBase + dashed]
        ) {
          return split[0] + ":" + dashed;
        }

        // Try with dashes instead of slashes
        dashed = dasherize(split[1].replace(/\./g, "-"));
        if (
          requirejs.entries[appBase + dashed] ||
          requirejs.entries[adminBase + dashed]
        ) {
          return split[0] + ":" + dashed;
        }
      }
      return this._super(fullName);
    },

    customResolve(parsedName) {
      // If we end with the name we want, use it. This allows us to define components within plugins.
      const suffix = parsedName.type + "s/" + parsedName.fullNameWithoutType,
        dashed = dasherize(suffix),
        moduleName = lookupModuleBySuffix(dashed);

      let module;
      if (moduleName) {
        module = requirejs(moduleName, null, null, true /* force sync */);
        if (module && module["default"]) {
          module = module["default"];
        }
      }
      return module;
    },

    resolveWidget(parsedName) {
      return this.customResolve(parsedName) || this._super(parsedName);
    },

    resolveAdapter(parsedName) {
      return this.customResolve(parsedName) || this._super(parsedName);
    },

    resolveModel(parsedName) {
      return this.customResolve(parsedName) || this._super(parsedName);
    },

    resolveView(parsedName) {
      return this.customResolve(parsedName) || this._super(parsedName);
    },

    resolveHelper(parsedName) {
      return (
        findHelper(parsedName.fullNameWithoutType) ||
        this.customResolve(parsedName) ||
        this._super(parsedName)
      );
    },

    resolveController(parsedName) {
      return this.customResolve(parsedName) || this._super(parsedName);
    },

    resolveComponent(parsedName) {
      return this.customResolve(parsedName) || this._super(parsedName);
    },

    resolveService(parsedName) {
      return this.customResolve(parsedName) || this._super(parsedName);
    },

    resolveRoute(parsedName) {
      if (parsedName.fullNameWithoutType === "basic") {
        return requirejs("discourse/routes/discourse", null, null, true)
          .default;
      }

      return this.customResolve(parsedName) || this._super(parsedName);
    },

    findLoadingTemplate(parsedName) {
      if (parsedName.fullNameWithoutType.match(/loading$/)) {
        return Ember.TEMPLATES.loading;
      }
    },

    findConnectorTemplate(parsedName) {
      const full = parsedName.fullNameWithoutType.replace("components/", "");
      if (full.indexOf("connectors") === 0) {
        return Ember.TEMPLATES[`javascripts/${full}`];
      }
    },

    resolveTemplate(parsedName) {
      return (
        this.findPluginMobileTemplate(parsedName) ||
        this.findPluginTemplate(parsedName) ||
        this.findMobileTemplate(parsedName) ||
        this.findTemplate(parsedName) ||
        this.findLoadingTemplate(parsedName) ||
        this.findConnectorTemplate(parsedName) ||
        Ember.TEMPLATES.not_found
      );
    },

    findPluginTemplate(parsedName) {
      const pluginParsedName = this.parseName(
        parsedName.fullName.replace("template:", "template:javascripts/")
      );
      return this.findTemplate(pluginParsedName);
    },

    findPluginMobileTemplate(parsedName) {
      if (_options.mobileView) {
        let pluginParsedName = this.parseName(
          parsedName.fullName.replace(
            "template:",
            "template:javascripts/mobile/"
          )
        );
        return this.findTemplate(pluginParsedName);
      }
    },

    findMobileTemplate(parsedName) {
      if (_options.mobileView) {
        let mobileParsedName = this.parseName(
          parsedName.fullName.replace("template:", "template:mobile/")
        );
        return this.findTemplate(mobileParsedName);
      }
    },

    findTemplate(parsedName) {
      const withoutType = parsedName.fullNameWithoutType,
        slashedType = withoutType.replace(/\./g, "/"),
        decamelized = withoutType.decamelize(),
        dashed = decamelized.replace(/\./g, "-").replace(/\_/g, "-"),
        templates = Ember.TEMPLATES;

      return (
        this._super(parsedName) ||
        templates[slashedType] ||
        templates[withoutType] ||
        templates[withoutType.replace(/\.raw$/, "")] ||
        templates[dashed] ||
        templates[decamelized.replace(/\./, "/")] ||
        templates[decamelized.replace(/\_/, "/")] ||
        templates[`${baseName}/templates/${withoutType}`] ||
        this.findAdminTemplate(parsedName) ||
        this.findUnderscoredTemplate(parsedName)
      );
    },

    findUnderscoredTemplate(parsedName) {
      let decamelized = parsedName.fullNameWithoutType.decamelize();
      let underscored = decamelized.replace(/\-/g, "_");
      return Ember.TEMPLATES[underscored];
    },

    // Try to find a template within a special admin namespace, e.g. adminEmail => admin/templates/email
    // (similar to how discourse lays out templates)
    findAdminTemplate(parsedName) {
      let decamelized = parsedName.fullNameWithoutType.decamelize();
      if (decamelized.indexOf("components") === 0) {
        let comPath = `admin/templates/${decamelized}`;
        const compTemplate =
          Ember.TEMPLATES[`javascripts/${comPath}`] || Ember.TEMPLATES[comPath];
        if (compTemplate) {
          return compTemplate;
        }
      }

      if (decamelized === "javascripts/admin") {
        return Ember.TEMPLATES["admin/templates/admin"];
      }

      if (
        decamelized.indexOf("admin") === 0 ||
        decamelized.indexOf("javascripts/admin") === 0
      ) {
        decamelized = decamelized.replace(/^admin\_/, "admin/templates/");
        decamelized = decamelized.replace(/^admin\./, "admin/templates/");
        decamelized = decamelized.replace(/\./g, "_");

        const dashed = decamelized.replace(/_/g, "-");
        return (
          Ember.TEMPLATES[decamelized] ||
          Ember.TEMPLATES[dashed] ||
          Ember.TEMPLATES[dashed.replace("admin-", "admin/")]
        );
      }
    },
  });
}
