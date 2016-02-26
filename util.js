var fs = require('fs');
var util = module.exports = {
	/** @module util */
	/**
	 * Takes a destination object and any number of source objects, and
	 * shallow-copies each source's values into the destination object.
	 * Operates left-to-right, so if multiple sources provide the same keys,
	 * the rightmost's key will win.
	 *
	 * @param {Object} dest Object to receive properties from source(s)
	 * @param {...Object} source Object to be mixed into the destination object
	 * @return {Object} Destination object, now including properties from source(s)
	 **/
	mixin: function (dest) {
		var len = arguments.length;
		var src;

		function copyProperty(k) {
			dest[k] = src[k];
		}

		for (var i = 1; i < len; i++) {
			src = arguments[i];
			Object.keys(src).forEach(copyProperty);
		}

		return dest;
	},

	/**
	 * Contains options and parameters discovered by parseArgv.
	 * @typedef {Object} ParsedArgv
	 * @property {Object} options Hash mapping any found option keys to
	 *		their values (or true if the option was a key with no value)
	 * @property {string[]} parameters Array containing any other arguments
	*/

	/**
	 * Parses argv for options in the format --opt or --opt=value.
	 * Yes, there are robust node libraries for option parsing, but
	 * for this simple purpose, incurring a 500-LOC dependency is overkill.
	 *
	 * @return {ParsedArgv}
	 */
	parseArgv: function () {
		var argv = process.argv;
		var options = {};
		var parameters = [];
		var optionRx = /^--([^=]+)(?:=(.+))?$/;
		var len = argv.length;
		var i;
		var arg;
		var match;

		for (i = 2; i < len; i++) {
			arg = argv[i];
			match = optionRx.exec(arg);
			if (match) {
				options[match[1]] = match[2] || true;
			}
			else {
				parameters.push(arg);
			}
		}

		return {
			options: options,
			parameters: parameters
		};
	},

	/**
	 * Contains options and parameters discovered by parseArgvForConfig.
	 * @typedef {Object} ParsedArgvWithConfig
	 * @property {Object} options Hash based on parsed config, additionally
	 *		mapping any other found option keys to their values (or true if
	 *		the option was a key with no value)
	 * @property {string[]} parameters Array containing any other arguments
	*/

	/**
	 * Parses argv for options in the format --opt or --opt=value, then
	 * attempts to open a configuration file in JSON format based on a
	 * path provided via the given paramName; if found, the config will be
	 * used as a base upon which any other command-line arguments will be
	 * mixed atop.
	 *
	 * @param {string} [name="config"] Name of option to check for config filename
	 * @return {ParsedArgvWithConfig}
	 */
	parseArgvForConfig: function (name) {
		name = name || 'config';

		var argv = util.parseArgv();
		var options = argv.options;
		var filename = options[name];
		var config;

		if (filename) {
			delete options[name];
			// Add .json if filename didn't already include it
			filename += filename.slice(-5) === '.json' ? '' : '.json';
			try {
				config = util.mixin(options, JSON.parse(fs.readFileSync(filename)));
			}
			catch (e) {
				console.warn('Failed to parse JSON from ' + filename +
					'; continuing without parsed config');
			}
		}

		if (!config) {
			config = {};
		}

		return {
			options: config,
			parameters: argv.parameters
		};
	}
};
