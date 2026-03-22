/* Copyright (c) 2020-2026 k4be and the PIRC.pl Team
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
function setEnvironment() {
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



		// banData should be managed by the ChatIntegrator Layer, but its structure is defined here
		window.banData = {
			'nick': '',
			'channel': '',
			'noIdent': false,
			'ident': '',
			'hostElements': [],
			'hostElementSeparators': [],
			'clear': function() {
				banData.nick = '';
				banData.channel = '';
				banData.noIdent = false;
				banData.ident = '';
				banData.hostElements = [];
				banData.hostElementSeparators = [];
			}
		};

		// modes now lives in chat (chat_integrator.js ChatIntegrator constructor).
		// Set language-dependent fields here, after language is loaded.
		if (connection.chat.modes) {
			connection.chat.modes.changeableSingle = language.modes.changeableSingle;
			connection.chat.modes.changeableArg    = language.modes.changeableArg;
		}

		window.servicesNicks = ['NickServ', 'ChanServ', 'HostServ', 'OperServ', 'Global', 'BotServ'];

		window.newMessage = language.newMessage;

		const emoji = {
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
			':((': '😓',
			':/':	'😕',
			':c':	'😕',
			':o':	'😕',
			':O':	'😱',
			'xo':	'😵',
			':*':	'😘',
			';*':	'😙',
			':P':	'😛',
			';p':	'😜',
			':(': '🙁',
			':)':	'🙂',
			'(:':	'🙃',
			'<3':	'💗',
			'-_-':	'😑',
			';(': '😢',
			';)':	'😉'
		};

		window.emojiRegex = [];

		let out1 = '';
		let out2 = '';
		for (const [i, emojiChar] of Object.entries(emoji)) {
			const expr = `${rxEscape(i)  }(($)|(\s))`;
			const regex = new RegExp(expr, 'g');
			emojiRegex.push([regex, emojiChar]);
			out1 += `${emojiChar  } `;
			out2 += `${i  } `;
		}

		// New event listeners for settings changes
		ircEvents.on('settings:changed:tabsListBottom', (data) => {
			if (data.newValue) {
				$('#top_menu').detach().insertAfter('#inputbox');
			} else {
				$('#top_menu').detach().insertAfter('#about-dialog');
			}
		});

		ircEvents.on('settings:changed:blackTheme', (data) => {
			if (data.newValue) {
				if ($('#blackCss').length == 0) {
					$('head').append('<link rel="stylesheet" type="text/css" href="/styles/gateway_black.css" id="blackCss">');
				}
			} else {
				$('#blackCss').remove();
			}
		});

		ircEvents.on('settings:changed:monoSpaceFont', (data) => {
			if (data.newValue) {
				if ($('#monospace_font').length == 0) {
					const style = $('<style id="monospace_font">#chat-wrapper { font-family: DejaVu Sans Mono, Consolas, monospace, Symbola; } </style>');
					$('html > head').append(style);
				}
			} else {
				$('#monospace_font').remove();
			}
		});

		ircEvents.on('settings:changed:noAvatars', (data) => {
			let style;
			if (data.newValue) {
				$('#avatars-style').remove();
				if ($('#no_avatars').length == 0) {
					style = $('<style id="no_avatars">.msgRepeat { display: block; } .msgRepeatBlock { display: none; } .messageDiv { padding-bottom: unset; } .messageMeta { display: none; } .messageHeader { display: inline; } .messageHeader::after { content: " "; } .messageHeader .time { display: inline; } .evenMessage { background: none !important; } .oddMessage { background: none !important; }</style>');
					$('html > head').append(style);
				}
			} else {
				$('#no_avatars').remove();
				if ($('#avatars-style').length == 0) {
					style = $('<style id="avatars-style">span.repeat-hilight, span.repeat-hilight span { color: #1F29D3 !important; font-weight: bold; }</style>');
					$('html > head').append(style);
				}
			}
		});

		ircEvents.on('settings:changed:showUserHostnames', (data) => {
			if (data.newValue) {
				$('#userhost_hidden').remove();
			} else {
				if ($('#userhost_hidden').length == 0) {
					const style = $('<style id="userhost_hidden">.userhost { display:none; }</style>');
					$('html > head').append(style);
				}
			}
		});

		ircEvents.on('settings:changed:automLogIn', (data) => {
			if (data.newValue) {
				$('#automLogIn').parent().parent().css('display', '');
			} else {
				$('#automLogIn').parent().parent().css('display', 'none');
			}
		});

		ircEvents.on('settings:changed:enableautomLogIn', (data) => {
			if (data.newValue) { // If enableautomLogIn is checked
				$('#save_password').prop('checked', true); // Check save_password
				// Note: save_password needs to be added to settings definition for its value to persist
			}
		});

		ircEvents.on('settings:changed:biggerEmoji', (data) => {
			if (data.newValue) {
				document.documentElement.style.setProperty('--emoji-scale', '3');
			} else {
				document.documentElement.style.setProperty('--emoji-scale', '1.8');
			}
		});

		ircEvents.on('settings:changed:dispEmoji', (data) => {
			if (!data.newValue) { // If dispEmoji is turned off
				settings.set('sendEmoji', false); // Update related setting in UI and localStorage
			}
		});

		ircEvents.on('settings:changed:sendEmoji', (data) => {
			if (data.newValue) { // If sendEmoji is turned on
				settings.set('dispEmoji', true); // Update related setting in UI and localStorage
			}
		});

		ircEvents.on('settings:changed:setUmodeD', (data) => {
			if (data.newValue) { // If setUmodeD is turned on
				settings.set('setUmodeR', true); // Update related setting in UI and localStorage
				commandBus.emit('chat:requestUmodeChange', { mode: '+D' }); // Request chat action
				commandBus.emit('chat:requestUmodeChange', { mode: '+R' }); // Request chat action
			} else { // If setUmodeD is turned off
				commandBus.emit('chat:requestUmodeChange', { mode: '-D' }); // Request chat action
			}
		});

		ircEvents.on('settings:changed:setUmodeR', (data) => {
			if (!data.newValue) { // If setUmodeR is turned off
				settings.set('setUmodeD', false); // Update related setting in UI and localStorage
				commandBus.emit('chat:requestUmodeChange', { mode: '-R' }); // Request chat action
			} else { // If setUmodeR is turned on
				commandBus.emit('chat:requestUmodeChange', { mode: '+R' }); // Request chat action
			}
		});

		ircEvents.on('settings:changed:setLanguage', (data) => {
			setLanguage(data.newValue);
		});

		ircEvents.on('settings:changed:showPartQuit', (data) => {
			disp.updateEventVisibility();
			if (!data.newValue) { // If showPartQuit is turned off (meaning events are shown)
				disp.regroupAllEvents();
			}
		});

		ircEvents.on('settings:changed:groupEvents', (data) => {
			if (data.newValue) {
				disp.regroupAllEvents();
			} else {
				disp.ungroupAllEvents();
			}
		});

		ircEvents.on('settings:changed:sortChannelsByJoinOrder', (data) => {
			uiTabs.sortChannelTabs();
		});

		ircEvents.on('settings:changed', () => { // General listener for other UI updates
			$('#nicklist').removeAttr('style');
			$('#chlist').removeAttr('style');
			$('#right-col').removeAttr('style');
			if ($('#chlist-body').is(':visible')) {
				uiTabs.toggleChanList();
			}
		});

	} catch (e) {
		console.error('Failed to set up environment:', e);
	}
}


window.addons = [];
let loaded = false;

/**
 * Event emitter with priority support for IRC handlers
 * Must be defined here (before irc_protocol.js loads)
 * @constructor
 */
class IRCEventEmitter {
	constructor() {
		this._handlers = {};
	}

	/**
	 * Register event handler with optional priority
	 * @param {string} event - Event name (e.g., 'cmd:PRIVMSG', 'batch:chathistory')
	 * @param {function} handler - Handler function
	 * @param {object} options - { priority: 0-100 (default 50), once: false }
	 * @returns {function} Unsubscribe function
	 */
	on(event, handler, options) {
		options = options || {};
		const priority = options.priority !== undefined ? options.priority : 50;
		const once = options.once || false;

		if (!this._handlers[event]) {
			this._handlers[event] = [];
		}

		const entry = {
			handler: handler,
			priority: priority,
			once: once
		};

		this._handlers[event].push(entry);
		// Sort by priority (higher first)
		this._handlers[event].sort((a, b) => {
			return b.priority - a.priority;
		});

		// Return unsubscribe function
		return () => {
			this.off(event, handler);
		};
	}

	/**
	 * Register one-time event handler
	 */
	once(event, handler, options) {
		options = options || {};
		options.once = true;
		return this.on(event, handler, options);
	}

	/**
	 * Unregister event handler
	 */
	off(event, handler) {
		if (!this._handlers[event]) return;
		this._handlers[event] = this._handlers[event].filter((entry) => {
			return entry.handler !== handler;
		});
	}

	/**
	 * Emit event to all registered handlers
	 * @param {string} event - Event name
	 * @param {*} data - Data to pass to handlers
	 * @returns {boolean} false if propagation was stopped, true otherwise
	 */
	emit(event, data) {
		if (!this._handlers[event]) return true;

		const toRemove = [];
		let stopped = false;

		for (const entry of this._handlers[event]) {
			try {
				const result = entry.handler(data);
				if (result === false) {
					stopped = true;
				}
			} catch (e) {
				console.error(`Event handler error [${  event  }]:`, e);
			}

			if (entry.once) {
				toRemove.push(entry);
			}

			if (stopped) break;
		}

		// Remove once handlers
		for (const entry of toRemove) {
			this.off(event, entry.handler);
		}

		return !stopped;
	}

	/**
	 * Check if any handlers exist for event
	 */
	hasListeners(event) {
		return this._handlers[event] && this._handlers[event].length > 0;
	}
}

// Global IRC event emitter instance
const ircEvents = new IRCEventEmitter();
window.ircEvents = ircEvents;

let commandBus = ircEvents; // initialized to connection.events by initCommandBus() in gateway_main.js

function initCommandBus(bus) {
	commandBus = bus;
}

// Formal hook registration API for addons
const hooks = {
	/**
	 * Register command handler
	 * @param {string} command - IRC command (e.g., 'PRIVMSG')
	 * @param {function} handler - Handler function(msg)
	 * @param {object} options - { priority: 0-100, once: boolean }
	 * @returns {function} Unsubscribe function
	 */
	onCommand: function(command, handler, options) {
		return ircEvents.on(`cmd:${  command}`, handler, options);
	},
	/**
	 * Register metadata change handler
	 * @param {string} key - Metadata key (e.g., 'avatar')
	 * @param {function} handler - Handler function(data) where data = {user, key, value}
	 * @param {object} options - { priority: 0-100, once: boolean }
	 * @returns {function} Unsubscribe function
	 */
	onMetadata: function(key, handler, options) {
		const wrappedHandler = function(data) {
			if (data.key === key) handler(data);
		};
		return ircEvents.on('metadata:updated', wrappedHandler, options);
	},
	/**
	 * Add message text processor
	 * @param {function} processor - Function(senderNick, dest, message) returns modified message
	 */
	addMessageProcessor: function(processor, options) {
		// Wrapper to adapt old processor signature to new event data object
		const handler = function(data) {
			data.message = processor(data.sender, data.dest, data.message);
		};
		return ircEvents.on('message:process', handler, options);
	},
	/**
	 * Register CTCP handler
	 * @param {string} ctcp - CTCP type (e.g., 'VERSION')
	 * @param {function} handler - Handler function(msg)
	 * @param {object} options - { priority: 0-100, once: boolean }
	 * @returns {function} Unsubscribe function
	 */
	onCtcp: function(ctcp, handler, options) {
		return ircEvents.on(`ctcp:${  ctcp}`, handler, options);
	},
	/**
	 * Register batch handler
	 * @param {string} type - Batch type (e.g., 'chathistory')
	 * @param {function} handler - Handler function(data) where data = {msg, batch}
	 * @param {object} options - { priority: 0-100, once: boolean }
	 * @returns {function} Unsubscribe function
	 */
	onBatch: function(type, handler, options) {
		return ircEvents.on(`batch:${  type}`, handler, options);
	},
	/**
	 * Direct event registration (for custom events)
	 */
	on: function(event, handler, options) {
		return ircEvents.on(event, handler, options);
	},
	once: function(event, handler, options) {
		return ircEvents.once(event, handler, options);
	},
	off: function(event, handler) {
		ircEvents.off(event, handler);
	},
	emit: function(event, data) {
		return ircEvents.emit(event, data);
	}
};
window.hooks = hooks;

const readyFunc = function() {
	if (loaded) return;
	if (!('mainSettings' in window)) {
		$('.not-connected-text > h3').html('Błąd / Error');
		$('.not-connected-text > p').html('Niepoprawna konfiguracja aplikacji. Proszę skontaktować się z administratorem.<br>Invalid application configuration. Please contact administrator.');
		return;
	}

	settings.load();
	ignore.loadList();
	let slang = settings.get('setLanguage');
	if (!slang) slang = mainSettings.language;
	setLanguage(slang);
	$('#setLanguage').val(slang);
	$('.gateway-version').html(mainSettings.version);
	$('.not-connected-text > h3').html(language.loading);
	$('.not-connected-text > p').html(language.loadingWait);
	if ($.browser.msie && parseInt($.browser.version, 10) < 9) {
		$('.not-connected-text > h3').html(language.outdatedBrowser);
		$('.not-connected-text > p').html(language.outdatedBrowserInfo);
		// cmd_binds = 0; // cmd_binds is now decoupled
		$('div#wrapper').html('');
	} else {
		loaded = true;
		// system:ready: all scripts have loaded; listeners must be registered before this point.
		// Handlers receive no data. After this event, chat/UI setup may begin.
		ircEvents.emit('system:ready');
	}
};

// readyFunc is now called from load.js after all scripts are loaded

function ChannelModes() {
	connection.chat.modes.single.forEach((mode) => {
		this[mode] =  false;
	});
	connection.chat.modes.argAdd.forEach((mode) => {
		this[mode] = false;
	});
	this['k'] = false;
	this['f'] = false;
}

function getModeInfo(letter, type) {
	if (!type) {
		type = 0;
	}
	if (settings.get('shortModeDisplay')) {
		return letter;
	}
	if (!(letter in language.modes.chModeInfo)) return `${language.mode  } ${  letter}`; // no text description for this mode char
	const data = language.modes.chModeInfo[letter];
	if (data.constructor === Array) {
		return data[type];
	} else {
		return data;
	}
}

// pomocnicze funkcje globalne
function str2bool(b) {
	return (b === 'true');
}

function he(text) { //HTML Escape
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML.replace(/"/g, '&quot;');
}

// Password encryption functions
// Generates or retrieves browser-specific encryption key
function getEncryptionKey() {
	const keyName = 'pirc_ek';
	let key = localStorage.getItem(keyName);
	if (!key) {
		// Generate new random key (256 bits / 64 hex chars)
		key = '';
		for (let i = 0; i < 64; i++) {
			key += '0123456789abcdef'.charAt(Math.floor(Math.random() * 16));
		}
		try {
			localStorage.setItem(keyName, key);
		} catch (e) {
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

	const key = getEncryptionKey();
	// Key stretching: hash key multiple times for better security
	let stretchedKey = key;
	for (let i = 0; i < 1000; i++) {
		stretchedKey = md5(stretchedKey + key);
	}

	// Convert password to array of char codes
	const encrypted = [];
	for (let i = 0; i < password.length; i++) {
		const keyChar = stretchedKey.charCodeAt(i % stretchedKey.length);
		const passChar = password.charCodeAt(i);
		// XOR encryption
		encrypted.push(passChar ^ keyChar);
	}

	// Convert to hex string
	let hexResult = '';
	for (const byte of encrypted) {
		const hex = byte.toString(16);
		hexResult += (hex.length === 1 ? '0' : '') + hex;
	}

	// Prefix with version identifier for future compatibility
	return `v1:${  hexResult}`;
}

// Decrypt password
function decryptPassword(encryptedPassword) {
	if (!encryptedPassword) return '';

	// Check if it's old base64 format (backward compatibility)
	if (encryptedPassword.indexOf('v1:') !== 0) {
		// Old format - decode with atob and migrate
		try {
			const decoded = atob(encryptedPassword);
			// Re-encrypt with new method
			const newEncrypted = encryptPassword(decoded);
			try {
				localStorage.setItem('password', newEncrypted);
			} catch (e) {}
			return decoded;
		} catch (e) {
			return '';
		}
	}

	// New format - decrypt
	const hexData = encryptedPassword.substring(3); // Remove 'v1:' prefix
	const key = getEncryptionKey();

	// Key stretching (same as encryption)
	let stretchedKey = key;
	for (let i = 0; i < 1000; i++) {
		stretchedKey = md5(stretchedKey + key);
	}

	// Convert hex to array
	const encrypted = [];
	for (let i = 0; i < hexData.length; i += 2) {
		encrypted.push(parseInt(hexData.substr(i, 2), 16));
	}

	// XOR decryption
	let decrypted = '';
	for (let i = 0; i < encrypted.length; i++) {
		const keyChar = stretchedKey.charCodeAt(i % stretchedKey.length);
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

	const r = parseInt(hex.substr(0, 2), 16);
	const g = parseInt(hex.substr(2, 2), 16);
	const b = parseInt(hex.substr(4, 2), 16);

	return { r, g, b };
}

// Convert RGB to hex
function rgbToHex(r, g, b) {
	const toHex = function(n) {
		n = Math.round(Math.max(0, Math.min(255, n)));
		const hex = n.toString(16);
		return hex.length === 1 ? `0${  hex}` : hex;
	};
	return `#${  toHex(r)  }${toHex(g)  }${toHex(b)}`;
}

// Calculate relative luminance (WCAG formula)
function getRelativeLuminance({ r: rVal, g: gVal, b: bVal }) {
	const rsRGB = rVal / 255;
	const gsRGB = gVal / 255;
	const bsRGB = bVal / 255;

	const r = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
	const g = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
	const b = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Calculate contrast ratio between two colors (WCAG formula)
function getContrastRatio(color1, color2) {
	const lum1 = getRelativeLuminance(hexToRgb(color1));
	const lum2 = getRelativeLuminance(hexToRgb(color2));

	const lighter = Math.max(lum1, lum2);
	const darker = Math.min(lum1, lum2);

	return (lighter + 0.05) / (darker + 0.05);
}

// Get current theme background color
function getThemeBackgroundColor() {
	// Check which stylesheet is active by looking at the chat-wrapper background
	const chatWrapper = document.getElementById('chat-wrapper');
	if (!chatWrapper) {
		return '#FFFFFF'; // Default to white
	}

	const bgColor = window.getComputedStyle(chatWrapper).backgroundColor;

	// Convert rgb/rgba to hex
	if (bgColor.indexOf('rgb') === 0) {
		const matches = bgColor.match(/rgba?(\d+),\s*(\d+),\s*(\d+)/);
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

	const currentRatio = getContrastRatio(color, backgroundColor);
	if (currentRatio >= minRatio) {
		return color; // Already has good contrast
	}

	const rgb = hexToRgb(color);
	const bgRgb = hexToRgb(backgroundColor);
	const bgLum = getRelativeLuminance(bgRgb);

	// Determine if we need to make the color lighter or darker
	// If background is light, we need to darken the text for contrast
	// If background is dark, we need to lighten the text for contrast
	const makeLighter = bgLum < 0.5;

	// Binary search for the right adjustment
	const step = makeLighter ? 10 : -10;
	const maxIterations = 30;
	let iterations = 0;

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
	return text.replace(/[.^$*+?()[\\\]|]/g, '\\$&');
}

if (!String.prototype.isInList) {
	String.prototype.isInList = function(list) {
	  const value = this.valueOf();
	  for (const item of list) {
		 if (item.toLowerCase() === value.toLowerCase()) return true;
	  }
	  return false;
	};
}

if (!String.prototype.apList) {
	String.prototype.apList = function(data) {
		if (this == '') {
			return data;
		} else {
			return `${this.valueOf()  }, ${  data}`;
		}
	};
}

if (!String.prototype.startsWith) {
	String.prototype.startsWith = function(searchString, position) {
		position = position || 0;
		return this.indexOf(searchString, position) === position;
	};
}

function fillColorSelector() {
	let html = '<tr>';
	let i;
	for (i = 0; i <= 98; i++) {
		if (i % 16 == 0) {
			html += '</tr><tr>';
		}
		html += `<td><button type="button" class="colorButton" value="" style="background-color: ${  $$.getColor(i)  };" onClick="uiHelpers.insertColor(${  i  })" /></td>`;
	}
	if (i % 8 != 0) {
		html += '</tr>';
	}
	$('#color-array').html(html);
}

function fillEmoticonSelector() {
	if (emoji.selectable.length == 0) {
		const read = localStorage.getItem('selectableEmojiStore');
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
	let html = '';
	for (const c of emoji.selectable) {
		html += makeEmojiSelector(c);
	}
	$('#emoticon-symbols').html(html);
	saveSelectableEmoji();
}

function makeEmojiSelector(c) {
	return `<span><a class="charSelect" onclick="uiHelpers.insertEmoji('${  c  }')">${  emoji.addTags(c).text  }</a> </span>`;
}

function saveSelectableEmoji() {
	localStorage.setItem('selectableEmojiStore', JSON.stringify(emoji.selectable));
}

const geoip = {
	'getName': function(code) {
		const name = language.countries[code];
		if (name == undefined) return false;
		return name;
	},
	'flag': function(code) {
		let out = '';
		code = code.toUpperCase();
		for (let i = 0; i < code.length; i++) {
			out += String.fromCodePoint(code.codePointAt(i) + 0x1F1A5);
		}
		return emoji.addTags(out).text;
	}
};

function onBlur() {
	disp.focused = false;
	const act = uiTabs.getActive();
	if (act) {
		act.setMark();
	} else {
		uiState.statusWindow.setMark();
	}
};
function onFocus() {
	clearInterval(disp.titleBlinkInterval);
	disp.titleBlinkInterval = false;
	if (document.title == window.newMessage) document.title = `${he(connection.chat.me.userRef.nick)  } @ PIRC.pl`;
	disp.focused = true;
	const act = uiTabs.getActive();
	if (act) {
		act.markRead();
	} else {
		uiState.statusWindow.markRead();
	}
};

if (/*@cc_on!@*/false) { // check for Internet Explorer
	document.onfocusin = onFocus;
	document.onfocusout = onBlur;
} else {
	window.onfocus = onFocus;
	window.onblur = onBlur;
}

function browserTooOld() {
	$('.not-connected-text > h3').html(language.outdatedBrowser);
	$('.not-connected-text > p').html(language.outdatedBrowserInfo);
	return;
}

function parseISOString(s) {
	const b = s.split(/\D+/);
	return new Date(Date.UTC(b[0], --b[1], b[2], b[3], b[4], b[5], b[6]));
}

function lengthInUtf8Bytes(str) {
	// Matches only the 10.. bytes that are non-initial characters in a multi-byte sequence.
	let add = 0;
	let success = false;
	let m;
	do {
		try {
			m = encodeURIComponent(str).match(/%[89ABab]/g);
			success = true;
		} catch (e) { // in case the last character is invalid
			str = str.slice(0, -1);
			add++;
		}
	} while (!success);
	return str.length + (m ? m.length : 0) + add;
}

function ImageExists(url) {
	const img = new Image();
	img.src = url;
	return img.height != 0;
}


//funkcje do obrabiania tekstów i podobne
const $$ = {
	'parseTime': function(timestamp) {
		const nd = new Date();
		nd.setTime(timestamp * 1000);
		if ((new Date()).getFullYear() != nd.getFullYear()) {
			return $.vsprintf('%s, %s %s %s, %02s:%02s:%02s', [ language.weekdays[nd.getDay()], nd.getDate(), language.months[nd.getMonth()], nd.getFullYear(), nd.getHours(), nd.getMinutes(), nd.getSeconds() ] );
		} else {
			return $.vsprintf('%s, %s %s, %02s:%02s:%02s', [ language.weekdays[nd.getDay()], nd.getDate(), language.months[nd.getMonth()], nd.getHours(), nd.getMinutes(), nd.getSeconds() ] );
		}
	},
	'nickColor': function(nick, codeOnly) {
		if (!settings.get('coloredNicks')) {
			return '';
		}
		let color;
		let colorid = nick.length;
		for (let i = 0; i < nick.length; i++) {
			colorid += nick.charCodeAt(i);
		}
		switch (colorid % 15) {
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
		const colorData = { nick, color };
		ircEvents.emit('nick:color', colorData);
		color = colorData.color;

		// Sanitize and adjust color for contrast with current theme background
		if (color) {
			color = sanitizeColor(color);
			if (color) {
				const backgroundColor = getThemeBackgroundColor();
				color = adjustColorContrast(color, backgroundColor, 4.5);
			}
		}

		if (codeOnly) {
			return color;
		} else {
			return `style="color:${  color  }"`;
		}
	},
	'colorize': function(message, strip) {
		if (strip == undefined) strip = false;
		let pageFront, pageBack;
		if (settings.get('blackTheme')) {
			pageFront = 'white';
			pageBack = 'black';
		} else {
			pageBack  = 'white';
			pageFront = 'black';
		}
		let currBack = pageBack;
		let currFront = pageFront;
		let newText = '';
		if (settings.get('dispEmoji')) {
			message = $$.textToEmoji(message);
		}
		if (!strip) {
			message = $$.parseLinks(message);
			if (settings.get('dispEmoji')) {
				// Check if message is emoji-only with ≤5 emoji for auto-enlargement
				const enlargeEmoji = emoji.isTextEmojiOnly(message);
				const emojiResult = emoji.addTags(message, enlargeEmoji);
				message = emojiResult.text;
				// Note: enlargeEmoji already applied during addTags if ≤5
			}
		}
		const length = message.length;
		let bold = false;
		let italic = false;
		let underline = false;
		let invert = false;
		let formatSet = false;
		let formatWaiting = false;
		let fgCode, bgCode;
		for (let i = 0 ; i < length ; i++) {
			let isText = false;
			let append = '';
			switch (message.charAt(i)) {
				case String.fromCharCode(3):
					fgCode = null;
					bgCode = null;
					{
						let nc = message.charCodeAt(i + 1);
						if (nc >= 48 && nc <= 57) {
							i++;
							fgCode = nc - 48;
							nc = message.charCodeAt(i + 1);
							if (nc >= 48 && nc <= 57) {
								i++;
								fgCode = fgCode * 10 + (nc - 48);
							}
							if (message.charAt(i + 1) === ',') {
								nc = message.charCodeAt(i + 2);
								if (nc >= 48 && nc <= 57) {
									i += 2;
									bgCode = nc - 48;
									nc = message.charCodeAt(i + 1);
									if (nc >= 48 && nc <= 57) {
										i++;
										bgCode = bgCode * 10 + (nc - 48);
									}
								}
							}
							if (fgCode != null) {
								currFront = $$.getColor(fgCode, 'foreground');
							}
							if (bgCode != null) {
								currBack = $$.getColor(bgCode, 'background');
							}
						} else {
							currFront = pageFront;
							currBack = pageBack;
						}
					}
					formatWaiting = true;
					break;

				case String.fromCharCode(4): // hex color
					currFront = `#${  message.substring(i + 1, i + 7)}`;
					i += 6;
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
			if (!strip && isText && formatWaiting) {
				formatWaiting = false;
				if (formatSet) {
					newText += '</span>';
					formatSet = false;
				}
				if (invert || italic || underline || bold || currFront != pageFront || currBack != pageBack) {
					formatSet = true;
					const styles = [];
					if (italic)    styles.push('font-style:italic');
					if (underline) styles.push('text-decoration:underline');
					if (bold)      styles.push('font-weight:bold');
					if (invert) {
						styles.push(`color:${currBack}`, `background-color:${currFront}`);
					} else {
						if (currFront != pageFront) styles.push(`color:${currFront}`);
						if (currBack  != pageBack)  styles.push(`background-color:${currBack}`);
					}
					newText += `<span style="${styles.join(';')}"><wbr>`;
				}
			}
			if (isText) {
				newText += append;
			}
		}
		if (!strip && formatSet) {
			newText += '</span><wbr>';
		}
		return newText;
	},
	'getColor': function(numeric, what) {
		const num = parseInt(numeric);
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
		/*}*/
	},
	'parseImages': function(text, attrs) {
		if (!attrs)
			attrs = '';
		const rmatch = text.match(/(https?:\/\/[^ ]+\.(png|jpeg|jpg|gif)(\?[^ ]+)?)/gi);
		let html = '';
		const callbacks = {};
		if (rmatch) {
			rmatch.forEach((arg) => {
				const rand = Math.floor(Math.random() * 10000).toString();
				const imgurl = arg;
				html += `<a id="a-img-${  rand  }"` +
					` class="image_link"${  attrs  }><span id="show-${  rand  }" style="display:inline;">${  language.show  }</span><span id="hide-${  rand  }" style="display:none;">${  language.hide  }</span>${  language.aPicture  }</a>` +
					`<div style="display:none;" id="img-${  rand  }"><img id="imgc-${  rand  }" style="max-width:100%;" /></div>`;
				callbacks[`a-img-${  rand}`] = function() {
					disp.toggleImageView(rand, imgurl);
				};
			});
		}
		const rexpr = /https?:\/\/(?:(?:www|m)\.youtube\.com\/watch\?[^ ]*v=|youtu\.be\/)([^ ]+)/i;
		const fmatch = text.match(/(https?:\/\/(?:(?:www|m)\.youtube\.com\/watch\?[^ ]*v=|youtu\.be\/)[^ ?&]+)/gi);
		if (fmatch) {
			fmatch.forEach((arg) => {
				const rmatch = rexpr.exec(arg);
				if (rmatch[1]) {
					const rand = Math.floor(Math.random() * 10000).toString();
					const videoId = rmatch[1]; // Corrected to videoId
					html += `<a id="a-video-${  rand  }"` +
						` class="image_link"${  attrs  }><span id="show-${  rand  }" style="display:inline;">${  language.show  }</span><span id="hide-${  rand  }" style="display:none;">${  language.hide  }</span>${  language.aVideo  }</a>` +
						`<div style="display:none;" id="img-${  rand  }"><iframe width="560" height="315" id="vid-${  rand  }" frameborder="0" allowfullscreen></iframe></div>`;
					callbacks[`a-video-${  rand}`] = function() {
						disp.toggleVideoView(rand, videoId);
					};
				}
			});
		}
		return { html, callbacks };
	},
	'applyCallbacks': function(callbacks) {
		for (const [key, handler] of Object.entries(callbacks)) {
			$(`#${  key}`).click(handler);
		}
	},
	'checkLinkStart': function(text, stubs) {
		const ret = { found: false, linkBegin: '', beginLength: 0 };
		stubs.forEach((stub) => {
			if (text.substring(0, stub.length) == stub) {
				ret.found = true;
				ret.linkBegin = stub;
				ret.beginLength = stub.length;
			}
		});
		return ret;
	},
	'correctLink': function(link) {
		let append = '';
		const text = link;
		let stripLink = $$.colorize(link, true);
		if (stripLink.slice(-1) == '.') {
			stripLink = stripLink.slice(0, -1);
			append = '.';
		}
		if (stripLink.startsWith('www.')) {
			stripLink = `http://${  stripLink}`;
		}
		return { link: stripLink, append, text };
	},
	'parseLinks': function(text) {
		let newText = '';
		let currLink = '';
		const linkWarning = settings.get('displayLinkWarning');
		const stateText = 0;
		const stateChannel = 1;
		const stateUrl = 2;
		let state = stateText;
		let stub, found, c, code, link;

		const makeChannelAnchor = function(link, suffix) {
			const a = document.createElement('a');
			a.href = '#';
			a.dataset.channel = link.link;
			a.textContent = link.text;
			return a.outerHTML + suffix;
		};
		const makeUrlAnchor = function(link, suffix) {
			const a = document.createElement('a');
			a.href = link.link;
			a.target = '_blank';
			a.textContent = link.text;
			if (linkWarning) {
				a.dataset.linkWarn = '1';
			}
			return a.outerHTML + suffix;
		};

		for (let i = 0; i < text.length; i++) {
			switch (state) {
				case stateText:
					stub = text.substring(i);
					found = $$.checkLinkStart(stub, ['ftp://', 'http://', 'https://', 'www.']);
					if (found.found) {
						currLink = found.linkBegin;
						i += found.beginLength - 1;
						state = stateUrl;
					} else if (text.charAt(i) == '#' && text.charAt(i - 1) != '[') {
						state = stateChannel;
						currLink = '#';
					} else {
						newText += he(text.charAt(i));
					}
					break;
				case stateChannel:
					c = text.charAt(i);
					code = c.charCodeAt();
					if (c != ' ' && c != ',' && code > 10) {
						currLink += c;
					} else {
						link = $$.correctLink(currLink);
						newText += makeChannelAnchor(link, he(c) + he(link.append));
						state = stateText;
					}
					break;
				case stateUrl:
					c = text.charAt(i);
					code = c.charCodeAt();
					if (c != ' ' && code > 10 && c != '<') {
						currLink += c;
					} else {
						link = $$.correctLink(currLink);
						newText += makeUrlAnchor(link, he(c) + he(link.append));
						state = stateText;
					}
					break;
			}
		}
		if (state == stateUrl) {
			link = $$.correctLink(currLink);
			newText += makeUrlAnchor(link, he(link.append));
		}
		if (state == stateChannel) {
			link = $$.correctLink(currLink);
			newText += makeChannelAnchor(link, he(link.append));
		}
		return newText;
	},
	'sescape': function(val) {
		return val.replace('\\', '\\\\');
	},
	'wildcardToRegex': function(regex) {
		regex = regex.replace(/[-[\]{}()+,.\\^$|#\s]/g, '\\$&\\');
		regex = regex.replace(/[*?]/g, '.$&');
		return `^${  regex  }$`;
	},
	'regexToWildcard': function(regex) {
		regex = regex.replace(/\.\*/g, '*');
		regex = regex.replace(/\.\?/g, '?');
		regex = regex.replace(/\\\./g, '.');
		regex = regex.replace(/\\/g, '');
		return regex.slice(1, -1);
	},
	'textToEmoji': function(text) {
		for (const [regexp, emojiChar] of emojiRegex) {
			text = text.replace(regexp, `${emojiChar  }$1`);
		}
		return text;
	},
	'niceTime': function(date) {
		if (date) {
			dateobj = date;
		} else {
			dateobj = new Date();
		}
		hours = dateobj.getHours();
		if (hours < 10) {
			hours = `0${  hours}`;
		}
		minutes = dateobj.getMinutes();
		if (minutes < 10) {
			minutes = `0${  minutes}`;
		}
		return `${hours  }:${  minutes}`;
	}
};

function escapeRegExp(string) { // my editor syntax colouring fails at this, so moved to the end
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function joinChannel(name) { commandBus.emit('chat:joinChannel', { channels: name }); }
