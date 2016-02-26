var fs = require('fs');
var util = require('util');
var mixin = require('./util').mixin;
var EventEmitter = require('events').EventEmitter;
// Default regular expressions for log parsing
var defaultRegexps = {
	// Log open / log close / day change: $1 = date+time
	logopen: /^--- Log opened (.*)$/,
	logclose: /^--- Log closed (.*)$/,
	daychange: /^--- Day changed (.*)$/,
	// Join/part/quit: $1 = time, $2 = nick, $3 = mask, $4 = quit/part message
	join: /^(\d\d:\d\d(?::\d\d)?)-!- (\S+) \[([^\]]+)\] has joined/,
	part: /^(\d\d:\d\d(?::\d\d)?)-!- (\S+) \[([^\]]+)\] has left(?:[^\[]*\[([^\]]*))?/,
	quit: /^(\d\d:\d\d(?::\d\d)?)-!- (\S+) \[([^\]]+)\] has quit(?:[^\[]*\[([^\]]*))?/,
	// Kick: $1 = time, $2 = nick, $3 = kicker, $4 = message
	kick: /^(\d\d:\d\d(?::\d\d)?)-!- (\S+) was kicked from \S by (\S) \[([^\]]+)\]$/,
	// Nick change: $1 = time, $2 = old nick, $3 = new nick
	nick: /^(\d\d:\d\d(?::\d\d)?)-!- (\S+) is now known as (\S+)$/,
	// Own nick change: $1 = time, $2 = new nick
	ownNick: /^(\d\d:\d\d(?::\d\d)?)\W+You're now known as (\S+)$/,
	// Total nicks in channel upon join: $1 = time, $2 = total, $3 = ops, $4 = halfops, $5 = voices, $6 = normal
	nicks: /^(\d\d:\d\d(?::\d\d)?)\W+Irssi: \S+ Total of (\d+) nicks \[(\d+) ops, (\d+) halfops, (\d+) voices, (\d+) normal\]$/,
	// Modes: $1 = time, $2 = modes, $3 = moder
	mode: /^(\d\d:\d\d(?::\d\d)?)-!- (?:ServerM|m)ode\/\S+ \[([^\]]+)\] by (\S*)$/,
	// Regular messages: $1 = time, $2 = mode, $3 = nick, $4 = message
	message: /^(\d\d:\d\d(?::\d\d)?)<(.)([^>]+)> (.*)$/,
	// Actions: $1 = time, $2 = nick, $3 = message
	action: /^(\d\d:\d\d(?::\d\d)?) \* (\S+) (.*)$/
};
// Actions to be taken for each line type above
var mappings = {
	logopen: function (match) {
		return {
			time: (this.currentDate = this._openTime = new Date(match[1]))
		};
	},
	logclose: function (match) {
		return {
			time: (this.currentDate = new Date(match[1]))
		};
	},
	daychange: function (match) {
		// Update currentDate but don't bother emitting an event
		this.currentDate = new Date(match[1]);
	},
	join: function (match) {
		var time = combineDateTime(this.currentDate, match[1]);

		if (this._openTime && !this._joinNick &&
				(time - this._openTime) < 2000) {

			// First join after a log open should be the logging client
			// (unless log rotation is in play);
			// update internal variable which will be confirmed
			// once we receive a total nicks message
			this._joinNick = match[2];
		}
		return {
			time: time,
			nick: match[2],
			mask: match[3]
		};
	},
	part: function (match) {
		return {
			time: combineDateTime(this.currentDate, match[1]),
			nick: match[2],
			mask: match[3],
			message: match[4]
		};
	},
	quit: function (match) {
		return {
			time: combineDateTime(this.currentDate, match[1]),
			nick: match[2],
			mask: match[3],
			message: match[4]
		};
	},
	kick: function (match) {
		return {
			time: combineDateTime(this.currentDate, match[1]),
			nick: match[2],
			by: match[3],
			message: match[4]
		};
	},
	nick: function (match) {
		return {
			time: combineDateTime(this.currentDate, match[1]),
			nick: match[2],
			newNick: match[3]
		};
	},
	ownNick: function (match) {
		return {
			type: 'nick',
			time: combineDateTime(this.currentDate, match[1]),
			nick: this._nick || this.defaultNick,
			newNick: (this._nick = match[2])
		};
	},
	nicks: function (match) {
		var time = combineDateTime(this.currentDate, match[1]);

		// "Total of x nicks" message logs immediately after client joins,
		// but also any time the /names command is manually run;
		// in only the former case, update logging client's current nick
		// (since the client's own nick change messages don't include it)
		if (this._joinNick && (time - this._openTime) < 2000) {
			this._nick = this._joinNick;
			delete this._joinNick;
			delete this._openTime;
		}

		return {
			time: time,
			total: match[2],
			ops: match[3],
			halfops: match[4],
			voices: match[5],
			normal: match[6]
		};
	},
	mode: function (match) {
		return {
			time: combineDateTime(this.currentDate, match[1]),
			mode: match[2],
			by: match[3]
		};
	},
	message: function (match) {
		return {
			time: combineDateTime(this.currentDate, match[1]),
			mode: match[2],
			nick: match[3],
			message: match[4]
		};
	},
	action: function (match) {
		return {
			time: combineDateTime(this.currentDate, match[1]),
			nick: match[2],
			message: match[3]
		};
	}
};
// Order to test RegExps in, from least to most common (will iterate backwards)
var testOrder = [
	'nicks',
	'daychange',
	'logclose',
	'logopen',
	'ownNick',
	'kick',
	'mode',
	'nick',
	'part',
	'quit',
	'join',
	'action',
	'message'
];

function combineDateTime(date, time) {
	// Yields a new Date object combining the given Date object and
	// a "hh:mm:ss" time string.
	var dateTime = new Date(date);
	var timeParts = time.split(':');
	dateTime.setHours(parseInt(timeParts[0], 10));
	dateTime.setMinutes(parseInt(timeParts[1], 10));
	dateTime.setSeconds(parseInt(timeParts[2] || 0, 10));
	return dateTime;
}

/**
 * Hash containing regular expressions (or strings convertible to RegExps)
 * to use for scanning log lines.  All properties are optional, and will
 * default to regular expressions which match against irssi's default
 * log format.
 * @typedef {Object} ParserRegexps
 * @property {string|RegExp} logopen "Log opened" message; $1 = date+time
 * @property {string|RegExp} logclose "Log closed" message; $1 = date+time
 * @property {string|RegExp} daychange "Day changed" message; $1 = date+time;
 *		Note that these lines will not emit events
 * @property {string|RegExp} join "X has joined" message;
 *		`$1` = time, `$2` = nick, `$3` = mask
 * @property {string|RegExp} part "X has left" message;
 *		`$1` = time, `$2` = nick, `$3` = mask, `$4` = message
 * @property {string|RegExp} quit "X has quit" message;
 *		`$1` = time, `$2` = nick, `$3` = mask, `$4` = message
 * @property {string|RegExp} kick "X was kicked" message;
 *		`$1` = time, `$2` = nick, `$3` = kicker, `$4` = message
 * @property {string|RegExp} nick "X is now known as Y" message;
 *		`$1` = time, `$2` = old nick, `$3` = new nick
 * @property {string|RegExp} ownNick "You're now known as X" message;
 *		`$1` = time, `$2` = new nick
 * @property {string|RegExp} nicks "Total of ..." message;
 *		`$1` = time, `$2` = total, `$3` = ops, `$4` = halfops, `$5` = voices, `$6` = normal
 * @property {string|RegExp} mode "mode ... by X" message;
 *		`$1` = time, `$2` = modes, `$3` = moder
 * @property {string|RegExp} message Normal message;
 *		`$1` = time, `$2` = mode, `$3` = nick, `$4` = message
 * @property {string|RegExp} action Action (i.e. the /me command);
 *		`$1` = time, `$2` = nick, `$3` = message
 */

/**
 * Options recognized by the Parser constructor.
 * @typedef {Object} ParserOptions
 * @property {string} defaultNick
 *		Default initial nick to use for the logging client's own nick changes,
 *		in case it cannot be discerned automatically from logopen + join + names
 *		messages
 * @property {boolean} debug
 *		Flag which will cause unhandled log lines to be output to stderr
 * @property {Object.<string, ParserRegexps>} regexps
 *		Custom regular expressions to override the defaults; useful to handle custom log message formats
 */

/**
 * Creates a new Parser with the specified options.
 * @class
 * @augments EventEmitter
 * @param {ParserOptions} options Options to apply to the Parser instance
 */
var Parser = module.exports = function (options) {
	var regexps = options && options.regexps;

	EventEmitter.call(this);

	if (regexps) {
		for (var key in regexps) {
			// Allow strings to be passed in (e.g. from JSON),
			// instantiating RegExps from them here
			var rx = regexps[key];
			if (typeof rx === 'string') {
				regexps[key] = new RegExp(rx);
			}
		}
		// Mix provided regexps on top of defaults to allow partial override
		options.regexps = mixin({}, defaultRegexps, regexps);
	}

	options && mixin(this, options);

	this._onAllHandlers = [];
};
util.inherits(Parser, EventEmitter);

mixin(Parser.prototype, /** @lends Parser.prototype */ {
	defaultNick: 'logging client',

	_parseLine: function (line) {
		var i = testOrder.length;
		var regexps = this.regexps || defaultRegexps;
		var match;

		while (i--) {
			var key = testOrder[i];
			if ((match = regexps[key].exec(line))) {
				var object = mappings[key].call(this, match);
				if (object && !object.type) {
					object.type = key;
				}
				return object;
			}
		}
		if (this.debug) {
			console.warn('Unhandled line: ' + line);
		}
	},

	_parseLines: function (str) {
		// Parses any full lines in str and adds their info to the `parsed` object.
		// Returns any remainder of str (i.e. from a final line with no newline).

		var lines = str.split('\n');
		var i = 0;
		var remainder = lines.pop();
		var len = lines.length;
		var parsedObj;

		do {
			parsedObj = this._parseLine(lines[i]);
			if (parsedObj) {
				this.emit(parsedObj.type, parsedObj);
			}
		}
		while (++i < len);

		return remainder;
	},

	/**
	 * Parses the given log file.
	 *
	 * @param {string} filename File to parse
	 */
	parse: function (filename) {
		var resume = filename === true; // should only ever be set by resume calls
		var fd = this._fd = resume ? this._fd : fs.openSync(filename, 'r');
		var buffer = new Buffer(4096);
		var bytesRead;
		var current = '';
		var remainder = resume ? this._remainder : '';

		while (!this._paused && (bytesRead = fs.readSync(fd, buffer, 0, buffer.length))) {
			current = buffer.toString('utf-8');
			if (current.length > bytesRead) {
				current = current.slice(0, bytesRead);
			}
			remainder = this._remainder = this._parseLines(remainder + current);
		}

		// The loop will end either when EOF is reached, or pause was called.
		// In the former case, close the file; in the latter case, leave it
		// open with the expectation that we'll pick up where we left off.
		if (!this._paused) {
			fs.closeSync(fd);
		}
	},

	/**
	 * Pauses parsing after the currently-read chunk.
	 * This means that it might not pause right after the current line, but it
	 * will before the file is read any further.
	 * Additional calls to this function when already paused do nothing.
	 */
	pause: function () {
		this._paused = true;
	},

	/**
	 * Causes the previous parse to continue where it left off.
	 */
	resume: function () {
		if (this._paused) {
			this._paused = false;
			this.parse(true);
		}
	},

	emit: function () {
		var i;
		var handlers = this._onAllHandlers;
		var len = handlers.length;

		// Emit as usual
		EventEmitter.prototype.emit.apply(this, arguments);

		// Also invoke any handlers registered for all events
		for (i = 0; i < len; i++) {
			if (handlers[i]) {
				handlers[i].apply(this, handlers.slice.call(arguments, 1));
			}
		}
	},

	/**
	 * Object containing a remove method for unhooking itself.
	 * @typedef {Object} RemovableListener
	 * @property {function} remove Method that can be called to unhook the listener
	 */

	/**
	 * Binds a function to all emitted events.
	 * @param handler {function} The handler to fire on every processed log message
	 * @return {RemovableListener}
	 */
	onAll: function (handler) {
		// Binds a function to all emitted events.
		// Rather than impose an obtuse separate removal method,
		// this method returns an object with a remove function.

		var i = this._onAllHandlers.push(handler) - 1;
		return {
			remove: function () {
				this._onAllHandlers[i] = null;
			}
		};
	}
});
