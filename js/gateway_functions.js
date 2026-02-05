/* Copyright (c) 2020 k4be and the PIRC.pl Team
 * 
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

// definicje stałych globalnych
function setEnvironment(){
	try {
		window.icons = [
			'/styles/img/users.png',
			'/styles/img/voice.png',
			'/styles/img/hop.png',
			'/styles/img/op.png',
			'/styles/img/prot.png',
			'/styles/img/owner.png',
			'/styles/img/user-registered.png'
		];
		window.alt = [ 	'', '+', '%', '@', '&', '~', '' ];
		window.chStatusInfo = language.chStatusInfo;

		window.reqChannel = '';



        // banData should be managed by the Domain Layer, but its structure is defined here
		window.banData = {
			'nick' : '',
			'channel' : '',
			'noIdent' : false,
			'ident' : '',
			'hostElements' : [],
			'hostElementSeparators' : [],
			'clear' : function(){
				banData.nick = '';
				banData.channel = '';
				banData.noIdent = false;
				banData.ident = '';
				banData.hostElements = [];
				banData.hostElementSeparators = [];
			}
		}

		window.modes = {
			/* default modes from rfc1459, we're overwriting it with ISUPPORT data later */
			'single': ['p', 's', 'i', 't', 'n', 'm'],
			'argBoth': ['k'],
			'argAdd': ['l'],
			'list': ['b'],
			'user': ['o', 'v'],
			'changeableSingle': language.modes.changeableSingle,
			'changeableArg': language.modes.changeableArg,
			/* again defaults from rfc1459 */
			'prefixes': {
				'o': '@',
				'v': '+'
			},
			'reversePrefixes': {
				'@': 'o',
				'+': 'v'
			}
		};

		window.servicesNicks = ['NickServ', 'ChanServ', 'HostServ', 'OperServ', 'Global', 'BotServ'];

		window.newMessage = language.newMessage;

		var emoji = {
			':D':	'😃',
			'O:->':	'😇',
			']:->': '😈',
			'^^':	'😊',
			':p':	'😋',
			'3)':	'😌',
			'8)':	'😎',
			':>':	'😏',
			':|':	'😐',
			':<':	'😒',
			':((': 	'😓',
			':/':	'😕',
			':c':	'😕',
			':o':	'😕',
			':O':	'😱',
			'xo':	'😵',
			':*':	'😘',
			';*':	'😙',
			':P':	'😛',
			';p':	'😜',
			':(': 	'🙁',
			':)':	'🙂',
			'(':':	'🙃',
			'<3':	'💗',
			'-_-':	'😑',
			';(': 	'😢',
			';)':	'😉'
		};

		window.emojiRegex = [];

		var out1 = '';
		var out2 = '';
		for(i in emoji){
			var expr = rxEscape(i)+'(($)|(\s))';
			var regex = new RegExp(expr, 'g');
			emojiRegex.push([regex, emoji[i]]);
			out1 += emoji[i] + ' ';
			out2 += i + ' ';
		}

		window.settings = {
			'backlogLength': 15
		}

        // New event listeners for settings changes
        ircEvents.on('settings:changed:tabsListBottom', function(data) {
            if (data.newValue) {
                $('#top_menu').detach().insertAfter('#inputbox');
                if($('#tabsDownCss').length == 0) {
                    $('head').append('<link rel="stylesheet" type="text/css" href="/styles/gateway_tabs_down.css" id="tabsDownCss">');
                }
            } else {
                $('#top_menu').detach().insertAfter('#options-box');
                $('#tabsDownCss').remove();
            }
        });

        ircEvents.on('settings:changed:blackTheme', function(data) {
            if (data.newValue) {
                if($('#blackCss').length == 0) {
                    $('head').append('<link rel="stylesheet" type="text/css" href="/styles/gateway_black.css" id="blackCss">');
                }
            } else {
                $('#blackCss').remove();
            }
        });

        ircEvents.on('settings:changed:monoSpaceFont', function(data) {
            if (data.newValue) {
                if($('#monospace_font').length == 0){
                    var style = $('<style id="monospace_font">#chat-wrapper { font-family: DejaVu Sans Mono, Consolas, monospace, Symbola; } </style>');
                    $('html > head').append(style);
                }
            } else {
                $('#monospace_font').remove();
            }
        });

        ircEvents.on('settings:changed:noAvatars', function(data) {
            if (data.newValue) {
                $('#avatars-style').remove();
                if($('#no_avatars').length == 0){
                    var style = $('<style id="no_avatars">.msgRepeat { display: block; } .msgRepeatBlock { display: none; } .messageDiv { padding-bottom: unset; } .messageMeta { display: none; } .messageHeader { display: inline; } .messageHeader::after { content: " "; } .messageHeader .time { display: inline; } .evenMessage { background: none !important; } .oddMessage { background: none !important; }</style>');
                    $('html > head').append(style);
                }
            } else {
                $('#no_avatars').remove();
                if($('#avatars-style').length == 0){
                    var style = $('<style id="avatars-style">span.repeat-hilight, span.repeat-hilight span { color: #1F29D3 !important; font-weight: bold; }</style>');
                    $('html > head').append(style);
                }
            }
        });

        ircEvents.on('settings:changed:showUserHostnames', function(data) {
            if (data.newValue) {
                $('#userhost_hidden').remove();
            } else {
                if($('#userhost_hidden').length == 0){
                    var style = $('<style id="userhost_hidden">.userhost { display:none; }</style>');
                    $('html > head').append(style);
                }
            }
        });

        ircEvents.on('settings:changed:automLogIn', function(data) {
            if (data.newValue) {
                $('#automLogIn').parent().parent().css('display', '');
            } else {
                $('#automLogIn').parent().parent().css('display', 'none');
            }
        });

        ircEvents.on('settings:changed:enableautomLogIn', function(data) {
            if (data.newValue) { // If enableautomLogIn is checked
                $('#save_password').prop('checked', true); // Check save_password
                // Note: save_password needs to be added to settings definition for its value to persist
            }
        });

        ircEvents.on('settings:changed:biggerEmoji', function(data) {
            if (data.newValue) {
                document.documentElement.style.setProperty('--emoji-scale', '3');
            } else {
                document.documentElement.style.setProperty('--emoji-scale', '1.8');
            }
        });

        ircEvents.on('settings:changed:dispEmoji', function(data) {
            if(!data.newValue){ // If dispEmoji is turned off
                settings.set('sendEmoji', false); // Update related setting in UI and localStorage
            }
        });

        ircEvents.on('settings:changed:sendEmoji', function(data) {
            if(data.newValue){ // If sendEmoji is turned on
                settings.set('dispEmoji', true); // Update related setting in UI and localStorage
            }
        });

        ircEvents.on('settings:changed:setUmodeD', function(data) {
            if(data.newValue){ // If setUmodeD is turned on
                settings.set('setUmodeR', true); // Update related setting in UI and localStorage
                ircEvents.emit('domain:requestUmodeChange', { mode: '+D' }); // Request domain action
                ircEvents.emit('domain:requestUmodeChange', { mode: '+R' }); // Request domain action
            } else { // If setUmodeD is turned off
                ircEvents.emit('domain:requestUmodeChange', { mode: '-D' }); // Request domain action
            }
        });

        ircEvents.on('settings:changed:setUmodeR', function(data) {
            if (!data.newValue) { // If setUmodeR is turned off
                settings.set('setUmodeD', false); // Update related setting in UI and localStorage
                ircEvents.emit('domain:requestUmodeChange', { mode: '-R' }); // Request domain action
            } else { // If setUmodeR is turned on
                ircEvents.emit('domain:requestUmodeChange', { mode: '+R' }); // Request domain action
            }
        });

        ircEvents.on('settings:changed:setLanguage', function(data) {
            setLanguage(data.newValue);
        });

        ircEvents.on('settings:changed:showPartQuit', function(data) {
            disp.updateEventVisibility();
            if(!data.newValue){ // If showPartQuit is turned off (meaning events are shown)
                disp.regroupAllEvents();
            }
        });

        ircEvents.on('settings:changed:groupEvents', function(data) {
            if(data.newValue){
                disp.regroupAllEvents();
            } else {
                disp.ungroupAllEvents();
            }
        });

        ircEvents.on('settings:changed:sortChannelsByJoinOrder', function(data) {
            gateway.sortChannelTabs();
        });

        ircEvents.on('settings:changed', function() { // General listener for other UI updates
            $('#nicklist').removeAttr('style');
            $('#chlist').removeAttr('style');
            if($('#chlist-body').is(':visible')){
                gateway.toggleChanList();
            }
        });

	} catch(e){
		console.error('Failed to set up environment:', e)
	}
}


window.addons = [];
var loaded = false;

/**
 * Event emitter with priority support for IRC handlers
 * Must be defined here (before gateway_cmd_binds.js loads)
 * @constructor
 */
var IRCEventEmitter = function() {
	this._handlers = {};
};

IRCEventEmitter.prototype = {
	/**
	 * Register event handler with optional priority
	 * @param {string} event - Event name (e.g., 'cmd:PRIVMSG', 'batch:chathistory')
	 * @param {function} handler - Handler function
	 * @param {object} options - { priority: 0-100 (default 50), once: false }
	 * @returns {function} Unsubscribe function
	 */
	on: function(event, handler, options) {
		options = options || {};
		var priority = options.priority !== undefined ? options.priority : 50;
		var once = options.once || false;

		if (!this._handlers[event]) {
			this._handlers[event] = [];
		}

		var entry = {
			handler: handler,
			priority: priority,
			once: once
		};

		this._handlers[event].push(entry);
		// Sort by priority (higher first)
		this._handlers[event].sort(function(a, b) {
			return b.priority - a.priority;
		});

		// Return unsubscribe function
		var self = this;
		return function() {
			self.off(event, handler);
		};
	},

	/**
	 * Register one-time event handler
	 */
	once: function(event, handler, options) {
		options = options || {};
		options.once = true;
		return this.on(event, handler, options);
	},

	/**
	 * Unregister event handler
	 */
	off: function(event, handler) {
		if (!this._handlers[event]) return;
		this._handlers[event] = this._handlers[event].filter(function(entry) {
			return entry.handler !== handler;
		});
	},

	/**
	 * Emit event to all registered handlers
	 * @param {string} event - Event name
	 * @param {*} data - Data to pass to handlers
	 * @returns {boolean} false if propagation was stopped, true otherwise
	 */
	emit: function(event, data) {
		if (!this._handlers[event]) return true;

		var toRemove = [];
		var stopped = false;

		for (var i = 0; i < this._handlers[event].length; i++) {
			var entry = this._handlers[event][i];

			try {
				var result = entry.handler(data);
				if (result === false) {
					stopped = true;
				}
			} catch (e) {
				console.error('Event handler error [' + event + ']:', e);
			}

			if (entry.once) {
				toRemove.push(entry);
			}

			if (stopped) break;
		}

		// Remove once handlers
		for (var j = 0; j < toRemove.length; j++) {
			this.off(event, toRemove[j].handler);
		}

		return !stopped;
	},

	/**
	 * Check if any handlers exist for event
	 */
	hasListeners: function(event) {
		return this._handlers[event] && this._handlers[event].length > 0;
	}
};

// Global IRC event emitter instance
var ircEvents = new IRCEventEmitter();
window.ircEvents = ircEvents;

// Register initialization functions defined in this file
ircEvents.on('system:ready', setEnvironment);
ircEvents.on('system:ready', fillEmoticonSelector);
ircEvents.on('system:ready', fillColorSelector);

var readyFunc = function(){
	if(loaded) return;
	if(!('mainSettings' in window)){
		$('.not-connected-text > h3').html('Błąd / Error');
		$('.not-connected-text > p').html('Niepoprawna konfiguracja aplikacji. Proszę skontaktować się z administratorem.<br>Invalid application configuration. Please contact administrator.');
		return;
	}

	settings.load();
	var slang = settings.get('setLanguage');
	if (!slang) slang = mainSettings.language;
	setLanguage(slang);
	$('.gateway-version').html(mainSettings.version);
	$('.not-connected-text > h3').html(language.loading);
	$('.not-connected-text > p').html(language.loadingWait);
	if($.browser.msie && parseInt($.browser.version, 10) < 9) {
		$('.not-connected-text > h3').html(language.outdatedBrowser);
		$('.not-connected-text > p').html(language.outdatedBrowserInfo);
		gateway = 0;
		guser = 0;
		// cmd_binds = 0; // cmd_binds is now decoupled
		$('div#wrapper').html('');
	} else {
		loaded = true;
		console.log('[gateway_functions.js] Emitting system:ready');
		ircEvents.emit('system:ready');
	}
}

// readyFunc is now called from load.js after all scripts are loaded

function ChannelModes() {
	modes.single.forEach(function(mode){
		this[mode] =  false;
	}, this);
	modes.argAdd.forEach(function(mode){
		this[mode] = false;
	}, this);
	this['k'] = false;
	this['f'] = false;
}

function getModeInfo(letter, type){
	if(!type){
		type = 0;
	}
	if(settings.get('shortModeDisplay')){
		return letter;
	}
	if(!(letter in language.modes.chModeInfo)) return language.mode+' '+letter; // no text description for this mode char
	var data = language.modes.chModeInfo[letter];
	if(data.constructor === Array){
		return data[type];
	} else {
		return data;
	}
}

// pomocnicze funkcje globalne
function str2bool(b){
	return (b === 'true');
}

function he(text) { //HTML Escape
	return $('<div/>').text(text).html().replace(/\n/g, '\n').replace(/\r/g, '\r');
}

function bsEscape(text) { // escapowanie beksleszy i zakończeń stringa
	text = text.replace(/\/g, '\\');
	text = text.replace(/'/g, '\\'
	); // Corrected escaping for single quote
	text = text.replace(/"/g, '\"');
	return text;
}

// Password encryption functions
// Generates or retrieves browser-specific encryption key
function getEncryptionKey() {
	var keyName = 'pirc_ek';
	var key = localStorage.getItem(keyName);
	if (!key) {
		// Generate new random key (256 bits / 64 hex chars)
		key = '';
		for (var i = 0; i < 64; i++) {
			key += '0123456789abcdef'.charAt(Math.floor(Math.random() * 16));
		}
		try {
			localStorage.setItem(keyName, key);
		} catch(e) {
			// If localStorage fails, use session-based key
			if (!window.sessionEncryptionKey) {
				window.sessionEncryptionKey = key;
			}
			return window.sessionEncryptionKey;
		}
	}
	return key;
}

// Encrypt password with XOR cipher and key stretching
function encryptPassword(password) {
	if (!password) return '';

	var key = getEncryptionKey();
	// Key stretching: hash key multiple times for better security
	var stretchedKey = key;
	for (var i = 0; i < 1000; i++) {
		stretchedKey = md5(stretchedKey + key);
	}

	// Convert password to array of char codes
	var encrypted = [];
	for (var i = 0; i < password.length; i++) {
		var keyChar = stretchedKey.charCodeAt(i % stretchedKey.length);
		var passChar = password.charCodeAt(i);
		// XOR encryption
		encrypted.push(passChar ^ keyChar);
	}

	// Convert to hex string
	var hexResult = '';
	for (var i = 0; i < encrypted.length; i++) {
		var hex = encrypted[i].toString(16);
		hexResult += (hex.length === 1 ? '0' : '') + hex;
	}

	// Prefix with version identifier for future compatibility
	return 'v1:' + hexResult;
}

// Decrypt password
function decryptPassword(encryptedPassword) {
	if (!encryptedPassword) return '';

	// Check if it's old base64 format (backward compatibility)
	if (encryptedPassword.indexOf('v1:') !== 0) {
		// Old format - decode with atob and migrate
		try {
			var decoded = atob(encryptedPassword);
			// Re-encrypt with new method
			var newEncrypted = encryptPassword(decoded);
			try {
				localStorage.setItem('password', newEncrypted);
			} catch(e) {}
			return decoded;
		} catch(e) {
			return '';
		}
	}

	// New format - decrypt
	var hexData = encryptedPassword.substring(3); // Remove 'v1:' prefix
	var key = getEncryptionKey();

	// Key stretching (same as encryption)
	var stretchedKey = key;
	for (var i = 0; i < 1000; i++) {
		stretchedKey = md5(stretchedKey + key);
	}

	// Convert hex to array
	var encrypted = [];
	for (var i = 0; i < hexData.length; i += 2) {
		encrypted.push(parseInt(hexData.substr(i, 2), 16));
	}

	// XOR decryption
	var decrypted = '';
	for (var i = 0; i < encrypted.length; i++) {
		var keyChar = stretchedKey.charCodeAt(i % stretchedKey.length);
		decrypted += String.fromCharCode(encrypted[i] ^ keyChar);
	}

	return decrypted;
}

// Color validation and sanitization
function isValidColor(color) {
	if (!color || typeof color !== 'string') return false;
	// Valid hex color: #RGB or #RRGGBB
	return /^#[0-9A-Fa-f]{3}$|^#[0-9A-Fa-f]{6}$/.test(color);
}

function sanitizeColor(color) {
	if (!color) return '';
	// Remove any whitespace
	color = color.trim();
	// Only allow valid hex colors
	if (isValidColor(color)) {
		return color;
	}
	// Return empty string if invalid (will use default color)
	return '';
}

// Color contrast functions for accessibility
// Convert hex color to RGB
function hexToRgb(hex) {
	// Remove # if present
	hex = hex.replace(/^#/, '');

	// Handle 3-digit hex codes
	if (hex.length === 3) {
		hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
	}

	var r = parseInt(hex.substr(0, 2), 16);
	var g = parseInt(hex.substr(2, 2), 16);
	var b = parseInt(hex.substr(4, 2), 16);

	return { r: r, g: g, b: b };
}

// Convert RGB to hex
function rgbToHex(r, g, b) {
	var toHex = function(n) {
		n = Math.round(Math.max(0, Math.min(255, n)));
		var hex = n.toString(16);
		return hex.length === 1 ? '0' + hex : hex;
	};
	return '#' + toHex(r) + toHex(g) + toHex(b);
}

// Calculate relative luminance (WCAG formula)
function getRelativeLuminance(rgb) {
	var rsRGB = rgb.r / 255;
	var gsRGB = rgb.g / 255;
	var bsRGB = rgb.b / 255;

	var r = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
	var g = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
	var b = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Calculate contrast ratio between two colors (WCAG formula)
function getContrastRatio(color1, color2) {
	var lum1 = getRelativeLuminance(hexToRgb(color1));
	var lum2 = getRelativeLuminance(hexToRgb(color2));

	var lighter = Math.max(lum1, lum2);
	var darker = Math.min(lum1, lum2);

	return (lighter + 0.05) / (darker + 0.05);
}

// Get current theme background color
function getThemeBackgroundColor() {
	// Check which stylesheet is active by looking at the chat-wrapper background
	var chatWrapper = document.getElementById('chat-wrapper');
	if (!chatWrapper) {
		return '#FFFFFF'; // Default to white
	}

	var bgColor = window.getComputedStyle(chatWrapper).backgroundColor;

	// Convert rgb/rgba to hex
	if (bgColor.indexOf('rgb') === 0) {
		var matches = bgColor.match(/rgba?(\d+),\s*(\d+),\s*(\d+)/);
		if (matches) {
			return rgbToHex(parseInt(matches[1]), parseInt(matches[2]), parseInt(matches[3]));
		}
	}

	return bgColor || '#FFFFFF';
}

// Adjust color to meet minimum contrast ratio
function adjustColorContrast(color, backgroundColor, minRatio) {
	if (!color || color === '') return color;

	minRatio = minRatio || 4.5; // WCAG AA standard for normal text

	var currentRatio = getContrastRatio(color, backgroundColor);
	if (currentRatio >= minRatio) {
		return color; // Already has good contrast
	}

	var rgb = hexToRgb(color);
	var bgRgb = hexToRgb(backgroundColor);
	var bgLum = getRelativeLuminance(bgRgb);

	// Determine if we need to make the color lighter or darker
	// If background is light, we need to darken the text for contrast
	// If background is dark, we need to lighten the text for contrast
	var makeLighter = bgLum < 0.5;

	// Binary search for the right adjustment
	var step = makeLighter ? 10 : -10;
	var maxIterations = 30;
	var iterations = 0;

	while (getContrastRatio(rgbToHex(rgb.r, rgb.g, rgb.b), backgroundColor) < minRatio && iterations < maxIterations) {
		if (makeLighter) {
			// Lighten: move towards white
			rgb.r = Math.min(255, rgb.r + Math.abs(step));
			rgb.g = Math.min(255, rgb.g + Math.abs(step));
			rgb.b = Math.min(255, rgb.b + Math.abs(step));
		} else {
			// Darken: move towards black
			rgb.r = Math.max(0, rgb.r + step);
			rgb.g = Math.max(0, rgb.g + step);
			rgb.b = Math.max(0, rgb.b + step);
		}
		iterations++;
	}

	return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function rxEscape(text) { //backupowanie regex
	return text.replace(/[.^$*+?()[{\|]/g, '\\$&');
}

if (!String.prototype.isInList) {
   String.prototype.isInList = function(list) {
	  var value = this.valueOf();
	  for (var i = 0, l = list.length; i < l; i += 1) {
		 if (list[i].toLowerCase() === value.toLowerCase()) return true;
	  }
	  return false;
   }
}

if(!String.prototype.apList){
	String.prototype.apList = function(data){
		if(this == ''){
			return data;
		} else {
			return this.valueOf() + ', '+data;
		}
	}
}

if(!String.prototype.startsWith){
	String.prototype.startsWith = function(searchString, position) {
		position = position || 0;
		return this.indexOf(searchString, position) === position;
	};
}

function fillColorSelector(){
	var html = '<tr>';
	for(var i=0; i<=98; i++){
		if(i%16 == 0){
			html += '</tr><tr>';
		}
		html += '<td><button type="button" class="colorButton" value="" style="background-color: ' + $$.getColor(i) + ';" onClick="gateway.insertColor(' + i + ')" /></td>';
	}
	if(i%8 != 0){
		html += '</tr>';
	}
	$('#color-array').html(html);
}

function fillEmoticonSelector(){
	if (emoji.selectable.length == 0) {
		var read = localStorage.getItem('selectableEmojiStore');
		if (read)
			emoji.selectable = JSON.parse(read);
		else
			emoji.selectable = [
				'☺', '😀', '😁', '😂', '😃', '😄', '😅', '😅', '😇', '😈', '😉', '😊', '😋', '😌', '😍', '😎', '😏', '😐', '😑', '😒',
				'😓', '😔', '😕', '😖', '😗', '😘', '😙', '😚', '😛', '😜', '😝', '😞', '😟', '😠', '😡', '😢', '😣', '😤', '😥', '😦',
				'😧', '😨', '😩', '😪', '😫', '😬', '😭', '😮', '😯', '😰', '😱', '😲', '😳', '😴', '😵', '😶', '😷', '😸', '😹', '😽',
				'😿', '😘', '😙', '😚', '😛', '😜', '😝', '🙁', '🙂', '🙃', '💀'
			];
	}
	var html = '';
	for(var i=0; i<emoji.selectable.length; i++){
		var c = emoji.selectable[i];
		html += makeEmojiSelector(c);
	}
	$('#emoticon-symbols').html(html);
	saveSelectableEmoji();
}

function makeEmojiSelector(c){
	return '<span><a class="charSelect" onclick="gateway.insertEmoji(\' + c + '\')">' + emoji.addTags(c).text + '</a> </span>';
}

function saveSelectableEmoji(){
	localStorage.setItem('selectableEmojiStore', JSON.stringify(emoji.selectable));
}

var geoip = {
	'getName': function(code){
		var name = language.countries[code];
		if(name == undefined) return false;
		return name;
	},
	'flag': function(code){
		var out = '';
		code = code.toUpperCase();
		for(var i=0; i<code.length; i++){
			out += String.fromCodePoint(code.codePointAt(i) + 0x1F1A5);
		}
		return emoji.addTags(out).text;
	}
};

function onBlur() {
	disp.focused = false;
	var act = gateway.getActive();
	if(act){
		act.setMark();
	} else {
		gateway.statusWindow.setMark();
	}
};
function onFocus(){
	clearInterval(disp.titleBlinkInterval);
	disp.titleBlinkInterval = false;
	if(document.title == newMessage) document.title = he(guser.me.nick)+' @ PIRC.pl';
	disp.focused = true;
	var act = gateway.getActive();
	if(act){
		act.markRead();
	} else {
		gateway.statusWindow.markRead();
	}
};

if (/*@cc_on!@*/false) { // check for Internet Explorer
	document.onfocusin = onFocus;
	document.onfocusout = onBlur;
} else {
	window.onfocus = onFocus;
	window.onblur = onBlur;
}

function browserTooOld(){
	$('.not-connected-text > h3').html(language.outdatedBrowser);
	$('.not-connected-text > p').html(language.outdatedBrowserInfo);
	return;
}

function parseISOString(s) {
	var b = s.split(/\D+/);
	return new Date(Date.UTC(b[0], --b[1], b[2], b[3], b[4], b[5], b[6]));
}

function lengthInUtf8Bytes(str) {
	// Matches only the 10.. bytes that are non-initial characters in a multi-byte sequence.
	var add = 0;
	var success = false;
	do {
		try {
			var m = encodeURIComponent(str).match(/%[89ABab]/g);
			success = true;
		} catch(e){ // in case the last character is invalid
			str = str.slice(0, -1);
			add++;
		}
	} while(!success);
	return str.length + (m ? m.length : 0) + add;
}

function ImageExists(url) {
	var img = new Image();
	img.src = url;
	return img.height != 0;
}

var disp = {
	'size': 1,
	'focused': true,
	'titleBlinkInterval': false,
	'setSize': function(s) {
		if(!s) return;
		$('body').css('font-size', s+'em');
		$('input[type="checkbox"]').css('transform', 'scale('+s+')');
		disp.size = s;
		localStorage.setItem('tsize', s);
	},
	'displaySpecialDialog': function(name, button) {
		$('#'+name).dialog({
			resizable: false,
			draggable: true,
			close: function(){
				$(this).dialog('destroy');
			},
			width: 600
		});
		if(button) {
			$('#'+name).dialog('option', 'buttons', [ {
				text: button,
				click: function(){
					$(this).dialog('close');
				}
			} ]);
		}
	},
	'listWindowShow': function() {
		disp.displaySpecialDialog('list-dialog', 'OK');
	},
	'colorWindowShow': function() {
		disp.displaySpecialDialog('color-dialog');
	},
	'symbolWindowShow': function() {
		disp.displaySpecialDialog('symbol-dialog');
	},
	'toggleImageView': function(id, url) {
		$('#img-'+id).fadeToggle(200);
		setTimeout(function(){
			if($('#img-'+id).css('display') == 'none'){
				$('#show-'+id).css('display', 'inline');
				$('#hide-'+id).css('display', 'none');
			} else {
				if($('#imgc-'+id).prop('src') == ''){
					$('#imgc-'+id).prop('src', url);
				}
				$('#show-'+id).css('display', 'none');
				$('#hide-'+id).css('display', 'inline');
			}
		}, 250);
	},
	'toggleVideoView': function(id, video) {
		$('#img-'+id).fadeToggle(200);
		setTimeout(function(){
			if($('#img-'+id).css('display') == 'none'){
				$('#show-'+id).css('display', 'inline');
				$('#hide-'+id).css('display', 'none');
			} else {
				if($('#vid-'+id).prop('src') == ''){
					$('#vid-'+id).prop('src', 'https://www.youtube.com/embed/'+video);
				}
				$('#show-'+id).css('display', 'none');
				$('#hide-'+id).css('display', 'inline');
			}
		}, 250);
	},
	'changeSettings': function(e) {
		if (!e || !e.currentTarget || !e.currentTarget.id) {
			// If called without event, assume a general save or initialization.
			// For now, we'll ensure saveAllFromDom is called if e is missing.
			// This branch needs careful re-evaluation once all setters are event-driven.
			settings.saveAllFromDom();
		} else {
			var settingName = e.currentTarget.id;
			var newValue = settings.get(settingName); // Get the new value after DOM update
			var oldValue = settings.get(settingName); // Needs to be obtained before saveFromDom if it affects comparison
			
			settings.saveFromDom(settingName); // Save the specific setting that changed

			// Retrieve new value after saving
			newValue = settings.get(settingName);

			// Emit granular event for the specific setting that changed
			ircEvents.emit('settings:changed:' + settingName, { key: settingName, newValue: newValue, oldValue: oldValue, event: e });
		}

		// Update global settings.backlogLength if backlogCount changed
		if (e && e.currentTarget.id === 'backlogCount') {
			settings.backlogLength = settings.get('backlogCount');
		} else if (!e) { // If called generally, ensure backlogLength is updated
			settings.backlogLength = settings.get('backlogCount');
		}
		
		// Emit a general event that settings have changed (for listeners that need to react to any change)
		ircEvents.emit('settings:changed');
	},
	'showAbout': function() {
		disp.displaySpecialDialog('about-dialog', 'OK');
	},
	'showAvatarSetting': function(){
		if(!mainSettings.supportAvatars) return;
		if(!guser.me.registered || window.FormData === undefined || !mainSettings.avatarUploadUrl){ // Check guser.me.registered via domain event
			var html =
				'<div id="current-avatar">' +
					'<div id="current-letter-avatar">' +
						'<span class="avatar letterAvatar" id="letterAvatarExample"><span role="presentation" id="letterAvatarExampleContent"></span></span>' +
					'</div>' +
					'<img id="current-avatar-image" src="/styles/img/noavatar.png" alt="' + language.noAvatarSet + '"><br>' +
					'<span id="current-avatar-info">' + language.noAvatarSet + '</span> <button type="button" value="" id="delete-avatar">' + language.remove + '</button>' +
				'</div>' +
				'<div id="set-avatar">' +
					language.enterUrl + ' <input type="text" id="avatar-url" name="avatar-url" autocomplete="photo"> <button type="button" id="check-avatar-button" value="">' + language.check +  '</button><br>' +
					'<button type="button" id="submit-avatar" value="">' + language.applySetting + '</button><br>' +
					language.avatarFileInfo + '<br>';
				if(window.FormData === undefined){
					html += language.browserTooOldForAvatars;
				} else if(mainSettings.avatarUploadUrl) {
					html += language.registerNickForAvatars;
				}
			html += '</div>';
			$('#avatar-dialog').html(html);
			$('#delete-avatar').click(disp.deleteAvatar);
			$('#submit-avatar').click(disp.submitAvatar);
			$('#check-avatar-button').click(disp.checkAvatarUrl);
			if(!settings.get('avatar')){
				$('#letterAvatarExample').css('background-color',$$.nickColor(guser.me.nick, true));
				$('#letterAvatarExampleContent').text(guser.me.nick.charAt(0));
				$('#current-avatar-info').text(language.noAvatarSet);
				$('#current-avatar-image').attr('src', '/styles/img/noavatar.png');
				$('#current-letter-avatar').show();
				$('#delete-avatar').hide();
			} else {
				$('#current-avatar-info').text(language.currentAvatar);
				$('#current-avatar-image').attr('src', settings.get('avatar').replace('{size}', '100'));
				$('#current-avatar-image').attr('alt', language.currentAvatar);
				$('#current-letter-avatar').hide();
				$('#avatar-url').val(settings.get('avatar'));
				$('#delete-avatar').show();
			}
			$('#submit-avatar').hide();
		} else {
			var html =
				'<div id="current-avatar">' +
					'<div id="current-letter-avatar">' +
						'<span class="avatar letterAvatar" id="letterAvatarExample"><span role="presentation" id="letterAvatarExampleContent"></span></span>' +
					'</div>' +
					'<img id="current-avatar-image" src="/styles/img/noavatar.png" alt="' + language.noAvatarSet + '"><br>' +
					'<span id="current-avatar-info">' + language.noAvatarSet + '</span> <button type="button" value="" id="delete-avatar">' + language.remove + '</button>' +
				'</div>' +
				'<div id="set-avatar">' +
					language.selectAnImage + ' <input type="file" name="avatarFileToUpload" id="avatarFileToUpload"><br>' +
					'<button type="submit" value="" id="submit-avatar" name="submit">' + language.applySetting + '</button><br>' +
					language.youAcceptToStoreTheData + mainSettings.networkName + '.';
			$('#avatar-dialog').html(html);
			$('#delete-avatar').click(disp.deleteAvatar);
			$('#submit-avatar').click(disp.submitAvatar);
			if(!settings.get('avatar')){
				$('#letterAvatarExample').css('background-color',$$.nickColor(guser.me.nick, true));
				$('#letterAvatarExampleContent').text(guser.me.nick.charAt(0));
				$('#current-avatar-info').text(language.avatarNotSet);
				$('#current-avatar-image').attr('src', '/styles/img/noavatar.png');
				$('#current-letter-avatar').show();
				$('#delete-avatar').hide();
			} else {
				$('#current-avatar-info').text(language.currentAvatar);
				$('#current-avatar-image').attr('src', settings.get('avatar'));
				$('#current-avatar-image').attr('alt', language.currentAvatar);
				$('#current-letter-avatar').hide();
				$('#avatar-url').val(settings.get('avatar'));
				$('#delete-avatar').show();
			}
			$('#submit-avatar').show();
		}
		disp.displaySpecialDialog('avatar-dialog', 'OK');
	},
	'checkAvatarUrl': function() {
		var url = $('#avatar-url').val();
		if(!url.startsWith('https://')){
			$$.alert(language.addressMustStartWithHttps);
			return;
		}
		$('#delete-avatar').hide();
		$('#current-letter-avatar').hide();
		$('#current-avatar-image').attr('src', url);
		$('#current-avatar-image').attr('alt', language.preview);
		$('#current-avatar-info').text(language.acceptPreview);
		$('#submit-avatar').show();
	},
	'submitAvatar': function() {
		if(!guser.me.registered){
			var url = $('#avatar-url').val();
			if(!url.startsWith('https://')){
				$$.alert(language.addressMustStartWithHttps);
				return;
			}
			settings.set('avatar', url);
			disp.showAvatarSetting();
			disp.avatarChanged();
		} else {
			var fd = new FormData();
			var file = $('#avatarFileToUpload')[0].files[0];
			if(!file){
				$$.alert(language.noFileSelected);
				return;
			}
			fd.append('fileToUpload', file);
			fd.append('image-type', 'avatar');
			$('#set-avatar').append('<br>' + language.processing);
			var label = ircEvents.emit('domain:generateLabel'); // Get label from domain
			// gateway.labelCallbacks[label] = function(label, msg, batch){ // Replaced with domain event
			ircEvents.emit('domain:setLabelCallback', { label: label, callback: function(label, msg, batch){ // Emit domain event
				if(!batch){
					var jwt = msg.args[2];
				} else {
					var jwt = batch.extjwtContent;
				}
				fd.append('jwt', jwt);
				$.ajax({
					url: mainSettings.avatarUploadUrl,
					dataType: 'json',
					method: 'post',
					processData: false,
					contentType: false,
					data: fd,
					success: function(data){
						if(data['result'] == 'ok'){
							settings.set('avatar', data['url']);
							disp.showAvatarSetting();
							disp.avatarChanged();
						} else {
							$$.alert(language.failedToSendImageWithResponse + data['result']); // TODO parse the result
						}
					},
					error: function(){
									$$.alert(language.failedToSendImage);
								}
				});
			}});
			ircEvents.emit('domain:requestExtJwt', { service: mainSettings.extjwtService || '*', label: label }); // Emit domain event
		}
	},
	'deleteAvatar': function() {
		if(!guser.me.registered){
			if(!confirm(language.areYouSureToDeleteAvatar + '"' +settings.get('avatar')+ '"?')){
				return;
			}
			settings.set('avatar', false);
			disp.showAvatarSetting();
			disp.avatarChanged();
		} else {
			if(!confirm(language.deleteAvatarQ)){
				return;
			}
			var label = ircEvents.emit('domain:generateLabel'); // Get label from domain
			// gateway.labelCallbacks[label] = function(label, msg, batch){ // Replaced with domain event
			ircEvents.emit('domain:setLabelCallback', { label: label, callback: function(label, msg, batch){ // Emit domain event
				if(!batch){
					var jwt = msg.args[2];
				} else {
					var jwt = batch.extjwtContent;
				}
				$.ajax({
					url: mainSettings.avatarDeleteUrl,
					dataType: 'json',
					method: 'post',
					data: {
						'image-type': 'avatar',
						'jwt': jwt
					},
					success: function(data){
						if(data['result'] == 'ok'){
							settings.set('avatar', false);
							disp.showAvatarSetting();
							disp.avatarChanged();
						} else {
							$$.alert(language.failedToDeleteImageWithResponse + data['result']); // TODO parse the result
						}
					},
					error: function(){
									$$.alert(language.failedToDeleteImage);
								}
				});
			}});
			ircEvents.emit('domain:requestExtJwt', { service: mainSettings.extjwtService || '*', label: label }); // Emit domain event
		}
	},
	'avatarChanged': function() {
		disp.changeSettings();
		if(settings.get('avatar')){
			ircEvents.emit('domain:requestMetadataUpdate', { key: 'avatar', value: settings.get('avatar') }); // Emit domain event
		} else {
			ircEvents.emit('domain:requestMetadataUpdate', { key: 'avatar', value: null }); // Emit domain event to clear
		}
	},
	'getAvatarIcon': function(nick, isRegistered){
		var avatar = gateway.getAvatarUrl(nick, 50);
		if(avatar) return avatar;
		if(isRegistered) return icons[6];
		return icons[0];
	},
	'showOptions': function() {
		disp.displaySpecialDialog('options-dialog', 'OK');
	},
	'showQueryUmodes': function() {
		disp.displaySpecialDialog('query-umodes-dialog', 'OK');
	},
	'showSizes': function() {
		disp.displaySpecialDialog('size-dialog', language.close);
	},
	'topicClick': function() {
		var channel = gateway.findChannel(gateway.active);
		if(!channel){
			return;
		}
		var topic = $('#'+channel.id+'-topic > h2').html();
		if(topic == ''){
			topic = language.topicIsNotSet;
		}
		var html = topic +
			'<p class="' + channel.id + '-operActions" style="display:none;">' +
				'<b>' + language.changeChannelTopic + '</b><textarea name="topicEdit" id="topicEdit">'+he(channel.topic)+'</textarea>' + // escaped channel.topic
				'<button id="topic-change-button-' + channel.id + '">' + language.changeTopicSubmit + '</button><br>' +
				language.youCanCopyCodesToTopic +
			'</p>';
		$$.closeDialog('confirm', 'topic');
		$$.displayDialog('confirm', 'topic', language.topicOfChannel + channel.name, html);
		$('#topic-change-button-' + channel.id).click(function(){
			ircEvents.emit('domain:requestTopicChange', { channelName: channel.name, newTopic: $('#topicEdit').val() }); // Emit domain event
		});
	},
	'playSound': function() {
		if ( ! settings.get('newMsgSound')) {
			return;
		}
		var filename = '/styles/audio/served';
		$('#sound').html('<audio autoplay="autoplay"><source src="' + filename + '.mp3" type="audio/mpeg" /><source src="' + filename + '.ogg" type="audio/ogg" /><embed hidden="true" autostart="true" loop="false" src="' + filename +'.mp3" /></audio>');
	},
	'insertLinebeI': function(mode, args){ // This function is now superseded by event listeners in gateway_display.js
	    console.warn('disp.insertLinebeI() is deprecated. Use channel:*ListEntry events instead.');
	},
	'endListbeI': function(mode, chan){ // This function is now superseded by event listeners in gateway_display.js
	    console.warn('disp.endListbeI() is deprecated. Use channel:endOf*List events instead.');
	},
	'getNamebeI': function(mode){ // Still used by disp.insertLinebeI/endListbeI, so keep for now (or remove if those are fully gone)
		var listName = mode;
		switch(mode){
			case 'b': listName = language.ofBans; break;
			case 'e': listName = language.ofExcepts; break;
			case 'I': listName = language.ofInvites; break;
		}
		return listName;
	},
	'showAllEmoticons': function(){
		$$.closeDialog('emoticons', 'allEmoticons');
		var html = '<div class="emojiSelector">';
		var data = emoji.getAll();
		for(var i=0; i<data.length; i++){
			html += '<a class="charSelect" onclick="gateway.insertEmoji(\' + data[i].text + '\')"><g-emoji fallback-src="/styles/emoji/' + data[i].code + '.png" class="emoji-wrapper">' + data[i].text + '</g-emoji></a> ';
		}
		html += '</div>';
		$$.displayDialog('emoticons', 'allEmoticons', language.allEmoticons, html);
	},
	'updateEventVisibility': function(){
		// Hide or show event messages based on showPartQuit setting
		var hideEvents = settings.get('showPartQuit');
		var groupEnabled = settings.get('groupEvents');

		$('.event-message').each(function(){
			var $this = $(this);
			var isInGroup = $this.hasClass('grouped-event');

			if(hideEvents){
				$this.hide();
			} else if(isInGroup){
				// Keep grouped events hidden, they're shown via expand
				$this.hide();
			} else {
				$this.show();
			}
		});

		// Also hide/show group summaries
		$('.event-group-summary').each(function(){
			if(hideEvents){
				$(this).hide();
			} else {
				$(this).show();
			}
		});
	},
	'extendEventGroup': function($summary, newEvents) {
		var groupId = $summary.data('group-id');
		if (!groupId) return;

		var isExpanded = $('#hide-' + groupId).is(':visible');

		var oldEvents = [];
		$('.grouped-event[data-group-id="' + groupId + '"]').each(function(){
			oldEvents.push($(this));
		});

		var allEvents = oldEvents.concat(newEvents);

		// Clean up old group
		$summary.remove();
		oldEvents.forEach(function($el){
			$el.removeClass('grouped-event').removeAttr('data-group-id');
		});

		// Create a new group with all events
		disp.createEventGroup(allEvents);

		// Restore expanded state if needed
		var newGroupId = allEvents[0].attr('data-group-id');
		if(isExpanded && newGroupId){
			disp.expandEventGroup(newGroupId);
		}
	},
	'groupEvents': function(container){
		// Group consecutive event messages (>2) into a collapsible summary
		if(settings.get('showPartQuit')) return; // Don't group when hiding all events
		if(!settings.get('groupEvents')) return; // Grouping disabled

		var $container = $(container);
		var $messages = $container.children('.messageDiv');
		var consecutiveEvents = [];

		$messages.each(function(){
			var $this = $(this);
			var isEvent = $this.hasClass('event-message');

			if (isEvent && !$this.hasClass('grouped-event')) {
				consecutiveEvents.push($this);
			} else { // Not an event, or a summary, or already grouped
				if (consecutiveEvents.length > 0) {
					var prevEl = consecutiveEvents[0].prev();
					if (prevEl.hasClass('event-group-summary')) {
						disp.extendEventGroup(prevEl, consecutiveEvents);
					} else if (consecutiveEvents.length > 2) {
						disp.createEventGroup(consecutiveEvents);
					}
				}
				consecutiveEvents = [];
			}
		});

		// After the loop, handle any trailing events
		if (consecutiveEvents.length > 0) {
			var prevEl = consecutiveEvents[0].prev();
			if (prevEl.hasClass('event-group-summary')) {
				disp.extendEventGroup(prevEl, consecutiveEvents);
			} else if (consecutiveEvents.length > 2) {
				disp.createEventGroup(consecutiveEvents);
			}
		}
	},
	'createEventGroup': function(events){
		if(events.length <= 2) return;

		// Count event types
		var counts = { join: 0, part: 0, quit: 0, kick: 0, mode: 0, nick: 0 };
		events.forEach(function($el){
			var type = $el.attr('data-event-type');
			if(type in counts) counts[type]++;
		});

		// Combine part and quit for "left" count
		var leftCount = counts.part + counts.quit;

		// Build summary text
		var summaryParts = [];
		if(counts.join > 0){
			var label = counts.join === 1 ? language.usersJoined[0] : language.usersJoined[1];
			summaryParts.push(label.replace('%d', counts.join));
		}
		if(leftCount > 0){
			var label = leftCount === 1 ? language.usersLeft[0] : language.usersLeft[1];
			summaryParts.push(label.replace('%d', leftCount));
		}
		if(counts.kick > 0){
			var label = counts.kick === 1 ? language.usersKicked[0] : language.usersKicked[1];
			summaryParts.push(label.replace('%d', counts.kick));
		}
		if(counts.mode > 0){
			var label = counts.mode === 1 ? language.modeChanges[0] : language.modeChanges[1];
			summaryParts.push(label.replace('%d', counts.mode));
		}
		if(counts.nick > 0){
			var label = counts.nick === 1 ? language.nickChanges[0] : language.nickChanges[1];
			summaryParts.push(label.replace('%d', counts.nick));
		}

		var summaryText = summaryParts.join(', ');
		var groupId = 'evtgrp-' + Math.random().toString(36).substr(2, 9);

		// Create summary element
		var $summary = $('<div class="messageDiv event-group-summary" data-group-id="' + groupId + '">' +
			'<span class="time">'+$$.niceTime()+'</span> &nbsp; ' +
			'<span class="mode"><span class="symbolFont">⋯</span> ' + summaryText + ' ' +
			'<a href="javascript:void(0)" class="event-group-toggle" id="show-' + groupId + '" style="display:inline">[' + language.expand + ']</a>' +
			'<a href="javascript:void(0)" class="event-group-toggle" id="hide-' + groupId + '" style="display:none">[' + language.collapse + ']</a>' +
			'</span></div>');

		// Insert summary before first event in group
		events[0].before($summary);

		// Mark events as grouped and hide them
		events.forEach(function($el){
			$el.addClass('grouped-event').attr('data-group-id', groupId).hide();
		});

		// Set up toggle handlers
		$('#show-' + groupId).click(function(){
			disp.expandEventGroup(groupId);
		});
		$('#hide-' + groupId).click(function(){
			disp.collapseEventGroup(groupId);
		});
	},
	'expandEventGroup': function(groupId){
		var $groupedEvents = $('.grouped-event[data-group-id="' + groupId + '"]');
		$groupedEvents.show();
		$('#show-' + groupId).hide();
		$('#hide-' + groupId).show();

		// Auto-scroll if expanded events would be below the viewport
		var $chatWrapper = $('#chat-wrapper');
		var wrapperTop = $chatWrapper.offset().top;
		var wrapperVisibleBottom = wrapperTop + $chatWrapper.innerHeight();
		var eventBottom = $groupedEvents.last().offset().top + $groupedEvents.last().outerHeight();
		if(eventBottom > wrapperVisibleBottom){
			// Scroll to make the last event visible
			$chatWrapper.scrollTop($chatWrapper.scrollTop() + (eventBottom - wrapperVisibleBottom));
		}
	},
	'collapseEventGroup': function(groupId){
		$('.grouped-event[data-group-id="' + groupId + '"]').hide();
		$('#show-' + groupId).show();
		$('#hide-' + groupId).show();
	},
	'ungroupAllEvents': function(){
		// Expand and remove all event groups
		$('.event-group-summary').each(function(){
			var groupId = $(this).attr('data-group-id');
			$('.grouped-event[data-group-id="' + groupId + '"]').removeClass('grouped-event').removeAttr('data-group-id').show();
			$(this).remove();
		});
	},
	'regroupAllEvents': function(){
		// First ungroup, then regroup all windows
		disp.ungroupAllEvents();
		$('#main-window > span').each(function(){
			disp.groupEvents(this);
		});
	}
};

//funkcje do obrabiania tekstów i podobne
var $$ = {
	'parseTime': function(timestamp) {
		var nd = new Date();
		nd.setTime(timestamp*1000);
		if((new Date()).getFullYear() != nd.getFullYear()){
			return $.vsprintf("%s, %s %s %s, %02s:%02s:%02s", [ language.weekdays[nd.getDay()], nd.getDate(), language.months[nd.getMonth()], nd.getFullYear(), nd.getHours(), nd.getMinutes(), nd.getSeconds() ] );
		} else {
			return $.vsprintf("%s, %s %s, %02s:%02s:%02s", [ language.weekdays[nd.getDay()], nd.getDate(), language.months[nd.getMonth()], nd.getHours(), nd.getMinutes(), nd.getSeconds() ] );
		}
	},
	'nickColor': function(nick, codeOnly) {
		if (!settings.get('coloredNicks')){
			return '';
		}
		var color;
		var colorid = nick.length;
		for(var i = 0; i<nick.length; i++){
			colorid += nick.charCodeAt(i);
		}
		switch(colorid % 15){
			case 0: color = '#515185'; break;
			case 1: color = '#623c00'; break;
			case 2: color = '#c86c00'; break;
			case 3: color = '#ff6500'; break;
			case 4: color = '#ff0000'; break;
			case 5: color = '#e40f0f'; break;
			case 6: color = '#990033'; break;
			case 7: color = '#8800ab'; break;
			case 8: color = '#ce00ff'; break;
			case 9: color = '#0f2ab1'; break;
			case 10: color = '#3030ce'; break;
			case 11: color = '#006699'; break;
			case 12: color = '#1a866e'; break;
			case 13: color = '#008100'; break;
			case 14: color = '#959595'; break;
		}
		// Emit event for nick color processing
		var colorData = { nick: nick, color: color };
		ircEvents.emit('nick:color', colorData);
		color = colorData.color;

	// Sanitize and adjust color for contrast with current theme background
	if(color){
		color = sanitizeColor(color);
		if(color){
			var backgroundColor = getThemeBackgroundColor();
			color = adjustColorContrast(color, backgroundColor, 4.5);
		}
	}

		if(codeOnly){
			return color;
		} else {
			return 'style="color:' + color + '"';
		}
	},
	'colorize': function(message, strip) {
		if(strip == undefined) var strip = false;
		if (settings.get('blackTheme')) {
			var pageFront = 'white';
			var pageBack = 'black';
		} else {
			var pageBack  = 'white';
			var pageFront = 'black';
		}
		var currBack = pageBack;
		var currFront = pageFront;
		var newText = '';
		if(settings.get('dispEmoji')){
			message = $$.textToEmoji(message);
		}
		if(!strip){
			message = he(message);
			message = $$.parseLinks(message);
			if(settings.get('dispEmoji')){
				// Check if message is emoji-only with ≤5 emoji for auto-enlargement
			var enlargeEmoji = emoji.isTextEmojiOnly(message);
			var emojiResult = emoji.addTags(message, enlargeEmoji);
			message = emojiResult.text;
			// Note: enlargeEmoji already applied during addTags if ≤5
			}
		}
		var length = message.length;
		var bold = false;
		var italic = false;
		var underline = false;
		var invert = false;
		var formatSet = false;
		var formatWaiting = false;
		for (var i = 0 ; i < length ; i++) {
			var isText = false;
			var append = '';
			switch (message.charAt(i)) {
				case String.fromCharCode(3):
					var fgCode = null;
					var bgCode = null;
					if (!isNaN(parseInt(message.charAt(i+1)))) {
						if (!isNaN(parseInt(message.charAt(++i+1)))) {
							fgCode = parseInt(message.charAt(i)) * 10 + parseInt(message.charAt(++i));
						} else {
							fgCode = parseInt(message.charAt(i));
						}
						if ((message.charAt(i+1) == ',') && !isNaN(parseInt(message.charAt(++i+1)))) {
							if (!isNaN(parseInt(message.charAt(++i+1)))) {
								bgCode = parseInt(message.charAt(i)) * 10 + parseInt(message.charAt(++i));
							} else {
								bgCode = parseInt(message.charAt(i));
							}
						}
						if(fgCode != null){
							currFront = $$.getColor(fgCode, "foreground");
						}
						if(bgCode != null){
							currBack = $$.getColor(bgCode, "background");
						}
					} else {
						currFront = pageFront;
						currBack = pageBack;
					}
					formatWaiting = true;
					break;

				case String.fromCharCode(4): // hex color
					var end = i+7;
					i++;
					var code = '#';
					for(; i<end; ++i){
						code += message.charAt(i);
					}
					i--;
					currFront = code;
					formatWaiting = true;
					break;

				case String.fromCharCode(15): // wyczyszczenie
					currFront = pageFront;
					currBack = pageBack;
					bold = false;
					italic = false;
					underline = false;
					invert = false;
					formatWaiting = true;
					break;
				case String.fromCharCode(2):
					bold = !bold;
					formatWaiting = true;
					break;

				case String.fromCharCode(22): // inwersja
					invert = !invert;
					formatWaiting = true;
					break;
				case String.fromCharCode(29): // pochylenie - tylko kto je obsługuje?
					italic = !italic;
					formatWaiting = true;
					break;

				case String.fromCharCode(31): // podkreślenie
					underline = !underline;
					formatWaiting = true;
					break;
				default:
					isText = true;
					append = message.charAt(i);
					break;
			}
			if(!strip && isText && formatWaiting){
				formatWaiting = false;
				if(formatSet){
					newText += '</span>';
					formatSet = false;
				}
				if(invert || italic || underline || bold || currFront != pageFront || currBack != pageBack){
					formatSet = true;
					newText += '<span style="';
					newText += italic?'font-style:italic;':'';
					newText += underline?'text-decoration:underline;':'';
					newText += bold?'font-weight:bold;':'';
					if(invert){
						newText += 'color:'+currBack+';background-color:'+currFront+';';
					} else {
						if(currFront != pageFront){
							newText += 'color:'+currFront+';';
						}
						if(currBack != pageBack){
							newText += 'background-color:'+currBack+';';
						}
					}
					newText += '"><wbr>';
				}
			}
			if(isText){
				newText += append;
			}
		}
		if(!strip && formatSet){
			newText += '</span><wbr>';
		}
		return newText;
	},
	'getColor': function(numeric, what) {
		var num = parseInt(numeric);
		/*if (what == "foreground") {
			switch (num) {
				case 0:  return 'white';
				case 1:  return 'black';
				case 2:  return '#002AA8';
				case 3:  return '#1B7800';
				case 4:  return '#C30003';
				case 5:  return '#5F0002';
				case 6:  return '#950093';
				case 7:  return '#8800ab';
				case 8:  return '#CED800';
				case 9:  return '#07D800';
				case 10: return '#00837E';
				case 11: return '#00D5CD';
				case 12: return '#0010D5';
				case 13: return '#D500BF';
				case 14: return '#8B8B8B';
				default: return '#B9B9B9';
			}
		} else {*/
			switch (num) {
				case 0:  return 'white';
				case 1:  return 'black';
				case 2:  return '#1B54FF';
				case 3:  return '#4BC128';
				case 4:  return '#F15254';
				case 5:  return '#9B4244';
				case 6:  return '#D749D6';
				case 7:  return '#AEB32F';
				case 8:  return '#E7EF3B';
				case 9:  return '#59FF54';
				case 10: return '#00DFD6';
				case 11: return '#60FFF8';
				case 12: return '#5F6BFF';
				case 13: return '#FF83F2';
				case 14: return '#B5B5B5';
				case 15: return '#E0E0E0';
				// extended codes
				case 16: return '#470000';
				case 17: return '#472100';
				case 18: return '#474700';
				case 19: return '#324700';
				case 20: return '#004700';
				case 21: return '#00472c';
				case 22: return '#004747';
				case 23: return '#002747';
				case 24: return '#000047';
				case 25: return '#2e0047';
				case 26: return '#470047';
				case 27: return '#47002a';
				case 28: return '#740000';
				case 29: return '#743a00';
				case 30: return '#747400';
				case 31: return '#517400';
				case 32: return '#007400';
				case 33: return '#007449';
				case 34: return '#007474';
				case 35: return '#004074';
				case 36: return '#000074';
				case 37: return '#4b0074';
				case 38: return '#740074';
				case 39: return '#740045';
				case 40: return '#b50000';
				case 41: return '#b56300';
				case 42: return '#b5b500';
				case 43: return '#7db500';
				case 44: return '#00b500';
				case 45: return '#00b571';
				case 46: return '#00b5b5';
				case 47: return '#0063b5';
				case 48: return '#0000b5';
				case 49: return '#7500b5';
				case 50: return '#b500b5';
				case 51: return '#b5006b';
				case 52: return '#ff0000';
				case 53: return '#ff8c00';
				case 54: return '#ffff00';
				case 55: return '#b2ff00';
				case 56: return '#00ff00';
				case 57: return '#00ffa0';
				case 58: return '#00ffff';
				case 59: return '#008cff';
				case 60: return '#0000ff';
				case 61: return '#a500ff';
				case 62: return '#ff00ff';
				case 63: return '#ff0098';
				case 64: return '#ff5959';
				case 65: return '#ffb459';
				case 66: return '#ffff71';
				case 67: return '#cfff60';
				case 68: return '#6fff6f';
				case 69: return '#65ffc9';
				case 70: return '#6dffff';
				case 71: return '#59b4ff';
				case 72: return '#5959ff';
				case 73: return '#c459ff';
				case 74: return '#ff66ff';
				case 75: return '#ff59bc';
				case 76: return '#ff9c9c';
				case 77: return '#ffd39c';
				case 78: return '#ffff9c';
				case 79: return '#e2ff9c';
				case 80: return '#9cff9c';
				case 81: return '#9cffdb';
				case 82: return '#9cffff';
				case 83: return '#9cd3ff';
				case 84: return '#9c9cff';
				case 85: return '#dc9cff';
				case 86: return '#ff9cff';
				case 87: return '#ff94d3';
				case 88: return '#000000';
				case 89: return '#131313';
				case 90: return '#282828';
				case 91: return '#363636';
				case 92: return '#4d4d4d';
				case 93: return '#656565';
				case 94: return '#818181';
				case 95: return '#9f9f9f';
				case 96: return '#bcbcbc';
				case 97: return '#e2e2e2';
				case 98: return '#ffffff';
				default: return '#666666';
			}
		}
	},
	'parseImages': function(text, attrs) {
		if(!attrs)
			attrs = '';
		var rmatch = text.match(/(https?:\/\/[^ ]+\.(png|jpeg|jpg|gif)(\?[^ ]+)?)/gi);
		var html = '';
		var callbacks = {};
		if(rmatch){
			rmatch.forEach(function(arg){
				var rand = Math.floor(Math.random() * 10000).toString();
				var imgurl = arg;
				html += '<a id="a-img-' + rand + '"'+ 
					' class="image_link"'+attrs+'><span id="show-'+rand+'" style="display:inline;">' + language.show + '</span><span id="hide-'+rand+'" style="display:none;">' + language.hide + '</span>' + language.aPicture + '</a>'+ 
					'<div style="display:none;" id="img-'+rand+'"><img id="imgc-'+rand+'" style="max-width:100%;" /></div>';
				callbacks['a-img-' + rand] = function() {
					disp.toggleImageView(rand, imgurl);
				};
			});
		}
		var rexpr = /https?:\/\/(?:(?:www|m)\.youtube\.com\/watch\?[^ ]*v=|youtu\.be\/)([^ ]+)/i;
		var fmatch = text.match(/(https?:\/\/(?:(?:www|m)\.youtube\.com\/watch\?[^ ]*v=|youtu\.be\/)[^ ?&]+)/gi);
		if(fmatch){
			fmatch.forEach(function(arg){
				var rmatch = rexpr.exec(arg);
				if(rmatch[1]){
					var rand = Math.floor(Math.random() * 10000).toString();
					var videoId = rmatch[1]; // Corrected to videoId
					html += '<a id="a-video-' + rand + '"'+ 
						' class="image_link"'+attrs+'><span id="show-'+rand+'" style="display:inline;">' + language.show + '</span><span id="hide-'+rand+'" style="display:none;">' + language.hide + '</span>' + language.aVideo + '</a>'+ 
						'<div style="display:none;" id="img-'+rand+'"><iframe width="560" height="315" id="vid-'+rand+'" frameborder="0" allowfullscreen></iframe></div>';
					callbacks['a-video-' + rand] = function() {
						disp.toggleVideoView(rand, videoId);
					};
				}
			});
		}
		return { 'html': html, 'callbacks': callbacks };
	},
	'applyCallbacks': function(callbacks){
		for(var key in callbacks) {
			$('#' + key).click(callbacks[key]);
		}
	},
	'checkLinkStart': function(text, stubs){
		var ret = { 'found' : false, 'linkBegin' : '', 'beginLength' : 0 };
		stubs.forEach(function(stub){
			if(text.substring(0, stub.length) == stub){
				ret.found = true;
				ret.linkBegin = stub;
				ret.beginLength = stub.length;
			}
		});
		return ret;
	},
	'correctLink': function(link){
		var append = '';
		var text = link;
		var stripLink = $$.colorize(link, true);
		if(stripLink.slice(-1) == '.') {
			stripLink = stripLink.slice(0, -1);
			append = '.';
		}
		if(stripLink.startsWith('www.')){
			stripLink = 'http://' + stripLink;
		}
		return {'link': stripLink, 'append': append, 'text': text};
	},
	'parseLinks': function(text){
		var newText = '';
		var currLink = '';
		var confirm= '';
		var confirmChan = '';
		if (settings.get('displayLinkWarning')) {
			confirm = " onclick=\"return confirm('" + language.linkCanBeUnsafe + "')\"";
			confirmChan = " onclick=\"return confirm('" + language.confirmJoin + "')\"";
		}
		var stateText = 0;
		var stateChannel = 1;
		var stateUrl = 2;
		var state = stateText;

		for(var i=0; i < text.length; i++){
			switch(state){
				case stateText:
					var stub = text.substring(i);
					var found = $$.checkLinkStart(stub, ['ftp://', 'http://', 'https://', 'www.']);
					if(found.found){
						currLink = found.linkBegin;
						i += found.beginLength-1;
						state = stateUrl;
					} else if(text.charAt(i) == '#' && text.charAt(i-1) != '[') {
						state = stateChannel;
						currLink = '#';
					} else {
						newText += text.charAt(i);
					}
					break;
				case stateChannel:
					var c = text.charAt(i);
					var code = c.charCodeAt();
					if(c != ' ' && c != ',' && code > 10){
						currLink += c;
					} else {
						var append = '';
						var link = $$.correctLink(currLink);
						// Emit domain event instead of direct ircCommand
						newText += '<a href="javascript:ircEvents.emit(\'domain:requestJoinChannel\', { channelName: \''+bsEscape(link.link)+'\', time: new Date() })" ' + confirmChan + '>'+link.text+'</a>' + c + link.append;
						state = stateText;
					}
					break;
				case stateUrl:
					var c = text.charAt(i);
					var code = c.charCodeAt();
					if(c != ' ' && code > 10 && c != '<'){
						currLink += c;
					} else {
						var link = $$.correctLink(currLink);
						newText += '<a href="'+link.link+'" target="_blank"' + confirm + '>'+link.text+'</a>' + c + link.append;
						state = stateText;
					}
					break;
			}
		}
		if(state == stateUrl){
			var link = $$.correctLink(currLink);
			newText += '<a href="'+link.link+'" target="_blank"' + confirm + '>'+link.text+'</a>' + link.append;
		}
		if(state == stateChannel){
			var link = $$.correctLink(currLink);
			// Emit domain event instead of direct ircCommand
			newText += '<a href="javascript:ircEvents.emit(\'domain:requestJoinChannel\', { channelName: \''+bsEscape(link.link)+'\', time: new Date() })" ' + confirmChan + '>'+link.text+'</a>' + link.append;
		}
		return newText;
	},
	'displayReconnect': function(){
		var button = [ {
			text: language.reconnect,
			click: function(){
				ircEvents.emit('domain:requestReconnect'); // Emit domain event
			}
		} ];
		$$.displayDialog('connect', 'reconnect', language.disconnected, language.lostNetworkConnection, button);
	},
	'getDialogSelector': function(type, sender) {
		return $('#'+type+'Dialog-'+md5(sender.toLowerCase()));
	},
	'displayDialog': function(type, sender, title, message, button, attrs){
		if(!attrs)
			attrs = '';
		switch(type){ //specyficzne dla typu okna
			case 'whois':
				if(ircEvents.emit('domain:getConnectStatus') != 'connected'){ // Check domain connect status
					return;
				}
				if(sender.toLowerCase() == guser.me.nick.toLowerCase() && !gateway.displayOwnWhois){
					return;
				}
			case 'warning': case 'error': case 'confirm': case 'connect': case 'admin': case 'services': case 'ignore': case 'list': case 'alert': case 'emoticons': // nie wyświetlamy czasu
				var html = '<span ' + attrs + '>' + message + '</span>';
				break;
			default:
				var html = '<p '+attrs+'><span class="time">'+$$.niceTime()+'</span> '+message+'</p>';
				break;
		}
		var id = type+'Dialog-'+md5(sender.toLowerCase());
		var $dialog = $('#'+id);
		if($dialog.length == 0){
			if(!title){
				title = type;
			}
			title = he(title);
			var additionalClasses = '';
			if(type == 'notice' && sender.toLowerCase() == 'memoserv'){ // specjalny styl dla MemoServ
				additionalClasses += 'notice-dialog-memoserv';
			}
			$dialog = $('<div id="'+id+'" class="dialog '+type+'-dialog '+additionalClasses+'" title="'+title+'" />');
			$dialog.appendTo('html');
		}

		$dialog.append(html);
		$dialog.scrollTop($dialog.prop("scrollHeight"));
		if(type == 'connect'){
			$dialog.dialog({/* modal: true,*/ dialogClass: 'no-close' });
		} else if(sender == 'noaccess') {
			$dialog.dialog({ /*modal: true, */dialogClass: 'no-access' });
		} else {
			$dialog.dialog({ dialogClass: type+'-dialog-spec' });
		}
		var dWidth = 600;
		if(type == 'alert'){
			dWidth = 400;
		}
		$dialog.dialog({
			resizable: false,
			draggable: true,
			close: function(){
				$('#'+id).dialog('destroy');
				$('#'+id).remove();
			},
			width: dWidth
		});
		if(button == 'OK'){
			var button = [{
				text: 'OK',
				click: function(){
					$(this).dialog('close');
				}
			}];
		}
		if(button){
			$dialog.dialog('option', 'buttons', button);
		}
		if($dialog.find('input').length == 0){
			gateway.inputFocus();
		}
		if(type != 'error' && type != 'alert'){
			$('.connect-dialog').dialog('moveToTop');
		}
	},
	'closeDialog': function(type, nick){
		var id = type+'Dialog-'+md5(nick.toLowerCase());
		var $dialog = $('#'+id);
		$dialog.dialog('close');
		gateway.inputFocus();
	},
	'sescape': function(val) {
		return val.replace('\\', '\\\\');
	},
	'alert': function(text) {
		var button = [ {
			text: 'OK',
			click: function(){
				$(this).dialog('close');
			}
		} ];
		if($$.getDialogSelector('alert', 'alert').length > 0){
			text = '<br>' + text;
		}
		$$.displayDialog('alert', 'alert', language.msgNotice, text, button);
	},
	'wildcardToRegex': function(regex){
		regex = regex.replace(/[-[\]{}()+,.\\^$|#\s]/g, "\\$&\\");
		regex = regex.replace(/[*?]/g, ".$&");
		return '^'+regex+'$';
	},
	'regexToWildcard': function(regex){
		regex = regex.replace(/\.\*/g, "*");
		regex = regex.replace(/\.\?/g, "?");
		regex = regex.replace(/\\\./g, ".");
		regex = regex.replace(/\\/g, "");
		return regex.slice(1, -1);
	},
	'textToEmoji': function(text){
		for(i in emojiRegex){
			var regexp = emojiRegex[i][0];
			text = text.replace(regexp, emojiRegex[i][1]+'$1');
		}
		return text;
	},
	'niceTime': function(date) {
		if(date){
			dateobj = date;
		} else {
			dateobj = new Date();
		}
		hours = dateobj.getHours();
		if(hours < 10) {
			hours = '0'+hours;
		}
		minutes = dateobj.getMinutes();
		if(minutes < 10) {
			minutes = '0'+minutes;
		}
		return hours+':'+minutes;
	}
};

function escapeRegExp(string) { // my editor syntax colouring fails at this, so moved to the end
	return string.replace(/[.*+?^${}()|[\\]/g, '\\$&'); // $& means the whole matched string
}
