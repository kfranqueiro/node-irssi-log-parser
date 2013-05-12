var fs = require('fs'),
	util = module.exports = {
		/**
		 * Takes a destination object and any number of source objects, and
		 * shallow-copies each source's values into the destination object.
		 * Operates left-to-right, so if multiple sources provide the same keys,
		 * the rightmost's key will win.
		 * 
		 * @param {Object} dest Object to receive properties from source(s)
		 * @param {...Object} sources Objects to be mixed into the destination object
		 * @return {Object} Destination object, now including properties from source(s)
		 **/
		mixin: function (dest) {
			var len = arguments.length,
				i,
				src;

			function copyProperty(k) {
				dest[k] = src[k];
			}

			for (i = 1; i < len; i++) {
				src = arguments[i];
				Object.keys(src).forEach(copyProperty);
			}

			return dest;
		},

		/**
		 * Parses argv for options in the format --opt or --opt=value.
		 * Yes, there are robust node libraries for option parsing, but
		 * for this simple purpose, incurring a 500-LOC dependency is overkill.
		 *
		 * @return { { options:Object parameters:String[] } }
		 *		Object containing an options object mapping any found
		 *		option keys to their values, and a parameters array containing
		 *		any other arguments.
		 */
		parseArgv: function () {
			var argv = process.argv,
				options = {},
				parameters = [],
				optionRx = /^--([^=]+)(?:=(.+))?$/,
				len = argv.length,
				i,
				arg,
				match;

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
		 * Parses argv for options in the format --opt or --opt=value, then
		 * attempts to open a configuration file in JSON format based on a
		 * path provided via the given paramName; if found, the config will be
		 * used as a base upon which any other command-line arguments will be
		 * mixed atop.
		 *
		 * @param {String} [name="config"] Name of option to check for config filename
		 * @return { { options:Object parameters:String[] } }
		 *		Object containing an options object mapping any found
		 *		config properties and option keys to their values, and a
		 *		parameters array containing any other arguments.
		 */
		parseArgvForConfig: function (name) {
			name = name || 'config';

			var argv = util.parseArgv(),
				options = argv.options,
				filename = options[name],
				config;

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