## Classes

<dl>
<dt><a href="#Parser">Parser</a> ⇐ <code>EventEmitter</code></dt>
<dd></dd>
</dl>

## Typedefs

<dl>
<dt><a href="#ParserRegexps">ParserRegexps</a> : <code>Object</code></dt>
<dd><p>Hash containing regular expressions (or strings convertible to RegExps)
to use for scanning log lines.  All properties are optional, and will
default to regular expressions which match against irssi&#39;s default
log format.</p>
</dd>
<dt><a href="#ParserOptions">ParserOptions</a> : <code>Object</code></dt>
<dd><p>Options recognized by the Parser constructor.</p>
</dd>
<dt><a href="#RemovableListener">RemovableListener</a> : <code>Object</code></dt>
<dd><p>Object containing a remove method for unhooking itself.</p>
</dd>
</dl>

<a name="Parser"></a>
## Parser ⇐ <code>EventEmitter</code>
**Kind**: global class  
**Extends:** <code>EventEmitter</code>  

* [Parser](#Parser) ⇐ <code>EventEmitter</code>
    * [new Parser(options)](#new_Parser_new)
    * [.parse(filename)](#Parser+parse)
    * [.pause()](#Parser+pause)
    * [.resume()](#Parser+resume)
    * [.onAll(handler)](#Parser+onAll) ⇒ <code>[RemovableListener](#RemovableListener)</code>

<a name="new_Parser_new"></a>
### new Parser(options)
Creates a new Parser with the specified options.


| Param | Type | Description |
| --- | --- | --- |
| options | <code>[ParserOptions](#ParserOptions)</code> | Options to apply to the Parser instance |

<a name="Parser+parse"></a>
### parser.parse(filename)
Parses the given log file.

**Kind**: instance method of <code>[Parser](#Parser)</code>  

| Param | Type | Description |
| --- | --- | --- |
| filename | <code>string</code> | File to parse |

<a name="Parser+pause"></a>
### parser.pause()
Pauses parsing after the currently-read chunk.
This means that it might not pause right after the current line, but it
will before the file is read any further.
Additional calls to this function when already paused do nothing.

**Kind**: instance method of <code>[Parser](#Parser)</code>  
<a name="Parser+resume"></a>
### parser.resume()
Causes the previous parse to continue where it left off.

**Kind**: instance method of <code>[Parser](#Parser)</code>  
<a name="Parser+onAll"></a>
### parser.onAll(handler) ⇒ <code>[RemovableListener](#RemovableListener)</code>
Binds a function to all emitted events.

**Kind**: instance method of <code>[Parser](#Parser)</code>  

| Param | Type | Description |
| --- | --- | --- |
| handler | <code>function</code> | The handler to fire on every processed log message |

<a name="ParserRegexps"></a>
## ParserRegexps : <code>Object</code>
Hash containing regular expressions (or strings convertible to RegExps)
to use for scanning log lines.  All properties are optional, and will
default to regular expressions which match against irssi's default
log format.

**Kind**: global typedef  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| logopen | <code>string</code> &#124; <code>RegExp</code> | "Log opened" message; $1 = date+time |
| logclose | <code>string</code> &#124; <code>RegExp</code> | "Log closed" message; $1 = date+time |
| daychange | <code>string</code> &#124; <code>RegExp</code> | "Day changed" message; $1 = date+time; 		Note that these lines will not emit events |
| join | <code>string</code> &#124; <code>RegExp</code> | "X has joined" message; 		`$1` = time, `$2` = nick, `$3` = mask |
| part | <code>string</code> &#124; <code>RegExp</code> | "X has left" message; 		`$1` = time, `$2` = nick, `$3` = mask, `$4` = message |
| quit | <code>string</code> &#124; <code>RegExp</code> | "X has quit" message; 		`$1` = time, `$2` = nick, `$3` = mask, `$4` = message |
| kick | <code>string</code> &#124; <code>RegExp</code> | "X was kicked" message; 		`$1` = time, `$2` = nick, `$3` = kicker, `$4` = message |
| nick | <code>string</code> &#124; <code>RegExp</code> | "X is now known as Y" message; 		`$1` = time, `$2` = old nick, `$3` = new nick |
| ownNick | <code>string</code> &#124; <code>RegExp</code> | "You're now known as X" message; 		`$1` = time, `$2` = new nick |
| nicks | <code>string</code> &#124; <code>RegExp</code> | "Total of ..." message; 		`$1` = time, `$2` = total, `$3` = ops, `$4` = halfops, `$5` = voices, `$6` = normal |
| mode | <code>string</code> &#124; <code>RegExp</code> | "mode ... by X" message; 		`$1` = time, `$2` = modes, `$3` = moder |
| message | <code>string</code> &#124; <code>RegExp</code> | Normal message; 		`$1` = time, `$2` = mode, `$3` = nick, `$4` = message |
| action | <code>string</code> &#124; <code>RegExp</code> | Action (i.e. the /me command); 		`$1` = time, `$2` = nick, `$3` = message |

<a name="ParserOptions"></a>
## ParserOptions : <code>Object</code>
Options recognized by the Parser constructor.

**Kind**: global typedef  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| defaultNick | <code>string</code> | Default initial nick to use for the logging client's own nick changes, 		in case it cannot be discerned automatically from logopen + join + names 		messages |
| debug | <code>boolean</code> | Flag which will cause unhandled log lines to be output to stderr |
| regexps | <code>Object.&lt;string, ParserRegexps&gt;</code> | Custom regular expressions to override the defaults; useful to handle custom log message formats |

<a name="RemovableListener"></a>
## RemovableListener : <code>Object</code>
Object containing a remove method for unhooking itself.

**Kind**: global typedef  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| remove | <code>function</code> | Method that can be called to unhook the listener |

