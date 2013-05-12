var fs = require('fs'),
	util = require('util'),
	EventEmitter = require('events').EventEmitter,
	// RegExp for stripping "ed" from "joined", "parted", "kicked"
	edRx = /ed$/,
	// Default regular expressions for log parsing
	defaultRegexps = {
		// Log open / log close / day change: $1 = date+time
		logopen: /^--- Log opened (.*)$/,
		logclose: /^--- Log closed (.*)$/,
		daychange: /^--- Day changed (.*)$/,
		// Join/part/etc.: $1 = time, $2 = nick, $3 = mask, $4 = joined/parted/etc., $5 = quit/part message
		populate: /^(\d\d:\d\d(?::\d\d)?)-!- (\S+) \[([^\]]+)\] has (\w+)(?:[^\[]*\[([^\]]*))?/,
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
	},
	// Actions to be taken for each line type above
	mappings = {
		logopen: function (match) {
			return {
				type: 'logopen',
				time: (this.currentDate = this._openTime = new Date(match[1]))
			};
		},
		logclose: function (match) {
			return {
				type: 'logclose',
				time: (this.currentDate = new Date(match[1]))
			};
		},
		daychange: function (match) {
			// Update currentDate but don't bother emitting an event
			this.currentDate = new Date(match[1]);
		},
		populate: function (match) {
			var type = match[4].replace(edRx, ''),
				time = combineDateTime(this.currentDate, match[1]);

			if (type === 'join' && this._openTime && !this._joinNick &&
					(time - this._openTime) < 2000) {

				// First join after a log open should be the logging client
				// (unless log rotation is in play);
				// update internal variable which will be confirmed
				// once we receive a total nicks message
				this._joinNick = match[2];
			}
			return {
				type: type,
				time: time,
				nick: match[2],
				mask: match[3],
				message: match[5]
			};
		},
		kick: function (match) {
			return {
				type: 'kick',
				time: combineDateTime(this.currentDate, match[1]),
				nick: match[2],
				by: match[3],
				message: match[4]
			};
		},
		nick: function (match) {
			return {
				type: 'nick',
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
				type: 'nicks',
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
				type: 'mode',
				time: combineDateTime(this.currentDate, match[1]),
				mode: match[2],
				by: match[3]
			};
		},
		message: function (match) {
			return {
				type: 'message',
				time: combineDateTime(this.currentDate, match[1]),
				mode: match[2],
				nick: match[3],
				message: match[4]
			};
		},
		action: function (match) {
			return {
				type: 'action',
				time: combineDateTime(this.currentDate, match[1]),
				nick: match[2],
				message: match[3]
			};
		}
	},
	// Order to test RegExps in, from least to most common (will iterate backwards)
	testOrder = ['nicks', 'daychange', 'logclose', 'logopen', 'ownNick', 'kick', 'mode', 'nick', 'action', 'populate', 'message'];

function mixin(dest, src) {
	Object.keys(src).forEach(function (k) {
		dest[k] = src[k];
	});
}

function combineDateTime(date, time) {
	// Yields a new Date object combining the given Date object and
	// a "hh:mm:ss" time string.
	var dateTime = new Date(date),
		timeParts = time.split(':');
	dateTime.setHours(parseInt(timeParts[0], 10));
	dateTime.setMinutes(parseInt(timeParts[1], 10));
	dateTime.setSeconds(parseInt(timeParts[2] || 0, 10));
	return dateTime;
}

var Parser = module.exports = function (options) {
	EventEmitter.call(this);
	if (options) {
		mixin(this, options);
	}
	this._onAllHandlers = [];
};
util.inherits(Parser, EventEmitter);

mixin(Parser.prototype, {
	defaultNick: 'logging client',

	_parseLine: function (line) {
		var i = testOrder.length,
			key,
			match;

		while (i--) {
			key = testOrder[i];
			if ((match = defaultRegexps[key].exec(line))) {
				return mappings[key].call(this, match);
			}
		}
		if (this.debug) {
			console.warn('Unhandled line: ' + line);
		}
	},

	_parseLines: function (str) {
		// Parses any full lines in str and adds their info to the `parsed` object.
		// Returns any remainder of str (i.e. from a final line with no newline).

		var lines = str.split('\n'),
			i = 0,
			remainder = lines.pop(),
			len = lines.length,
			parsedObj;

		do {
			parsedObj = this._parseLine(lines[i]);
			if (parsedObj) {
				this.emit(parsedObj.type, parsedObj);
			}
		}
		while (++i < len);

		return remainder;
	},

	parse: function (filename) {
		var
			resume = filename === true, // should only ever be set by resume calls
			fd = this._fd = resume ? this._fd : fs.openSync(filename, 'r'),
			buffer = new Buffer(4096),
			bytesRead,
			current = '',
			remainder = resume ? this._remainder : '';

		while (!this._paused && (bytesRead = fs.readSync(fd, buffer, 0, buffer.length))) {
			current = buffer.toString('utf-8');
			if (current.length > bytesRead) { current = current.slice(0, bytesRead); }
			remainder = this._remainder = this._parseLines(remainder + current);
		}

		// The loop will end either when EOF is reached, or pause was called.
		// In the former case, close the file; in the latter case, leave it
		// open with the expectation that we'll pick up where we left off.
		if (!this._paused) {
			fs.closeSync(fd);
		}
	},

	pause: function () {
		// Pauses after the currently-read chunk is processed.
		// This means that it might not pause right after the current line, but
		// it will before the file is read any further.
		// Consecutive calls to this function when already paused are harmless.
		this._paused = true;
	},

	resume: function () {
		// Causes the previous parse to continue where it left off.
		if (this._paused) {
			this._paused = false;
			this.parse(true);
		}
	},

	emit: function () {
		var i,
			handlers = this._onAllHandlers,
			len = handlers.length;

		// Emit as usual
		EventEmitter.prototype.emit.apply(this, arguments);

		// Also invoke any handlers registered for all events
		for (i = 0; i < len; i++) {
			if (handlers[i]) {
				handlers[i].apply(this, handlers.slice.call(arguments, 1));
			}
		}
	},

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