# node-irssi-log-parser

## Overview

This package contains a `Parser` module capable of parsing logs created by the
[irssi IRC client](http://irssi.org/), and scripts to export parsed logs or
information from those logs in JSON format.

## Parser

The `Parser.js` module exports a constructor which will create instances of the
parser.  Generally, the primary method of interest on instances is the `parse`
method, which will parse a specified log file.  For more details on public
instance methods, as well as acceptable configuration options, see the
[Parser API documentation](API.md).

The parser emits events for each type of message that can appear in the log.
Generally, all events include `type` and `time` properties indicating what type
of event occurred and when.  Other properties vary depending on the type of event.

By default, the parser expects to receive irssi logs in the default English
format; however, the regular expressions used to parse different types of
messages can be selectively overridden by passing a configuration object
containing a `regexps` property to the `Parser` constructor.  Information on the
overrideable regular expressions, and what they are expected to yield when
executed, is available in the [ParserRegexps API documentation](API.md#parserregexps--object).

## JSON Export

The `bin/export-json` script will run the parser against any number of log files,
outputting all parsed log messages in JSON format.

Typical usage:

	bin/export-json \#mychannel.log > mychannel.json

If multiple log files are specified, they will be treated as one long log
split across multiple files in the order given.

Extra configuration to be passed to the Parser constructor (such as regular
expressions to override) may be specified in a JSON configuration file
indicated by the `--config` option:

	# Reads config from myconfig.json (specifying the .json extension is optional)
	bin/export-json --config=myconfig \#mychannel.log > mychannel.json

## Activity JSON Export

The `bin/export-activity-json` script will run the parser against any number of
log files, outputting information on users observed in the logs, starting from
the most active (in terms of messages sent).

Typical usage:

	bin/export-activity-json \#mychannel.log > mychannel-stats.json

In addition to the usual configuration options available to the parser, this
script allso supports the following options:

* `limit` - Number of users to include in the JSON output; defaults to unlimited
* `synonyms` - Allows to define nicknames that are synonymous with each other.
	This property is a hash, whose keys will be checked against the nick in each
	message, and if a match is found, that message will be counted towards the
	nick indicated in the value instead.
* `indent` - String to use for indenting each nested line in the JSON to make
	it readable; defaults to none

The `limit` and `indent` options may easily be applied via command-line switches
(e.g. `--limit=10`); as always, these can also be provided in a configuration
JSON file referenced via `--config`.

## Bugs or Features

If you find an issue or think of something that might be nice to have, open an
issue on the [issue tracker](https://github.com/kfranqueiro/node-irssi-log-parser/issues).

## Questions

If you have a question, tweet me [@kfranqueiro](https://twitter.com/kfranqueiro)
or `/query kgf` on irc.freenode.net.

## License

This code is published under the [MIT License](LICENSE).
