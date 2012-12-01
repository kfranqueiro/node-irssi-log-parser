var fs = require('fs'),
	util = require('util'),
	EventEmitter = require('events').EventEmitter,
	// Separator: $1 = Day changed / Log opened/closed; $2 = date
	separatorRx = /^--- (\w+ \w+) (.*)$/,
	// Join/part/etc.: $1 = time, $2 = nick, $3 = mask, $4 = joined/parted/etc., $5 = quit/part message
	populateRx = /^(\d\d:\d\d:\d\d)-!- (\S+) \[([^\]]+)\] has (\w+)(?:[^\[]*\[([^\]]*))?/,
	// Kick: $1 = time, $2 = nick, $3 = kicker, $4 = message
	kickRx = /^(\d\d:\d\d:\d\d)-!- (\S+) was kicked from \S by (\S) \[([^\]]+)\]$/,
	// Nick change: $1 = time, $2 = old nick, $3 = new nick
	nickRx = /^(\d\d:\d\d:\d\d)-!- (\S+) is now known as (\S+)$/,
	// Own nick change: $1 = time, $2 = new nick
	ownNickRx = /^(\d\d:\d\d:\d\d)-!- You're now known as (\S+)$/,
	// Total nicks in channel upon join: $1 = time, $2 = total, $3 = ops, $4 = halfops, $5 = voices, $6 = normal
	nicksRx = /^(\d\d:\d\d:\d\d)-!- Irssi: \S+ Total of (\d+) nicks \[(\d+) ops, (\d+) halfops, (\d+) voices, (\d+) normal\]$/,
	// Modes: $1 = time, $2 = modes, $3 = moder
	modeRx = /^(\d\d:\d\d:\d\d)-!- (?:ServerM|m)ode\/\S+ \[([^\]]+)\] by (\S*)$/,
	// Regular messages: $1 = time, $2 = mode, $3 = nick, $4 = message
	messageRx = /^(\d\d:\d\d:\d\d)<(.)([^>]+)> (.*)$/,
	// Actions: $1 = time, $2 = nick, $3 = message
	actionRx = /^(\d\d:\d\d:\d\d) \* (\S+) (.*)$/,
	// RegExp for stripping "ed" from "joined", "parted", "kicked"
	edRx = /ed$/;

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
	dateTime.setSeconds(parseInt(timeParts[2], 10));
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
	_parseLine: function (line) {
		var match, type;
		// Run through regular expressions defined above (in order of likelihood)
		if ((match = messageRx.exec(line))) {
			return {
				type: 'message',
				time: combineDateTime(this.currentDate, match[1]),
				mode: match[2],
				nick: match[3],
				message: match[4]
			};
		}
		else if ((match = populateRx.exec(line))) {
			type = match[4].replace(edRx, '');
			if (this._setNick && type === 'join') {
				// Logging client just joined the channel, so update nick
				// (since own nick changes don't indicate previous nick)
				this._nick = match[2];
				this._setNick = false;
			}
			return {
				type: type,
				time: combineDateTime(this.currentDate, match[1]),
				nick: match[2],
				mask: match[3],
				message: match[5]
			};
		}
		else if ((match = actionRx.exec(line))) {
			return {
				type: 'action',
				time: combineDateTime(this.currentDate, match[1]),
				nick: match[2],
				message: match[3]
			};
		}
		else if ((match = nickRx.exec(line))) {
			return {
				type: 'nick',
				time: combineDateTime(this.currentDate, match[1]),
				nick: match[2],
				newNick: match[3]
			};
		}
		else if ((match = ownNickRx.exec(line))) {
			return {
				type: 'nick',
				time: combineDateTime(this.currentDate, match[1]),
				nick: this._nick,
				newNick: (this._nick = match[2])
			};
		}
		else if ((match = modeRx.exec(line))) {
			return {
				type: 'mode',
				time: combineDateTime(this.currentDate, match[1]),
				mode: match[2],
				by: match[3]
			};
		}
		else if ((match = kickRx.exec(line))) {
			return {
				type: 'kick',
				time: combineDateTime(this.currentDate, match[1]),
				nick: match[2],
				by: match[3],
				message: match[4]
			};
		}
		else if ((match = separatorRx.exec(line))) {
			type = match[1];
			this.currentDate = new Date(match[2]);
			if (type === 'Day changed') {
				// Just update currentDate; don't emit
				return;
			}
			type = type === 'Log opened' ? 'logopen' : 'logclose';
			if (type === 'logopen') {
				// Update own nick on next join
				this._setNick = true;
			}

			return {
				type: type,
				time: this.currentDate
			};
		}
		else if ((match = nicksRx.exec(line))) {
			return {
				type: 'nicks',
				time: combineDateTime(this.currentDate, match[1]),
				total: match[2],
				ops: match[3],
				halfops: match[4],
				voices: match[5],
				normal: match[6]
			};
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