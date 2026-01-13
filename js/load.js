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

var scriptFiles = [
	'/js/gateway_global_settings.js',
	'/js/language.js',
	'/js/gateway_functions.js',
	'/js/gateway_conn.js',
	'/js/gateway_ignore.js',
	'/js/gateway_services.js',
	'/js/gateway_cmd_binds.js',
	'/js/gateway_user_commands.js',
	'/js/gateway_tabs.js',
	'/js/gateway_cmds.js',
	'/js/gateway_def.js',
	'/js/gateway_users.js',
	'/js/emoji.js',
	'/js/g-emoji-element.js'
];
var styleFiles = [
	'/styles/gateway_def.css'
];
var languageFiles = [
	'en',
	'pl'
];

// Cache-busting random ID (same for all files in this session)
var ranid = Math.floor(Math.random() * 10000);

/**
 * Helper function to load a script file with proper error tracking
 * @param {string} src - The script source URL
 * @param {string} description - Human-readable description for error messages
 * @param {Function} onLoadCallback - Optional callback when script loads successfully
 * @returns {HTMLScriptElement} The created script element
 */
function loadScript(src, description, onLoadCallback) {
	var script = document.createElement('script');
	script.type = 'text/javascript';
	script.src = src + '?' + ranid;

	// Track load failures for better debugging
	script.onerror = function() {
		console.error('[load.js] Failed to load: ' + description + ' (' + src + ')');
	};

	script.onload = function() {
		console.log('[load.js] Loaded: ' + description);
		if (onLoadCallback) {
			onLoadCallback();
		}
	};

	$('head').append(script);
	return script;
}

/**
 * Helper function to load a stylesheet with proper error tracking
 * @param {string} href - The stylesheet URL
 * @param {string} description - Human-readable description for error messages
 */
function loadStylesheet(href, description) {
	var link = document.createElement('link');
	link.rel = 'stylesheet';
	link.href = href + '?' + ranid;

	link.onerror = function() {
		console.error('[load.js] Failed to load: ' + description + ' (' + href + ')');
	};

	link.onload = function() {
		console.log('[load.js] Loaded: ' + description);
	};

	$('head').append(link);
}

/**
 * Load addon modules after mainSettings is available
 */
function loadAddons() {
	try {
		if (typeof mainSettings === 'undefined' || !mainSettings.modules) {
			console.warn('[load.js] mainSettings.modules not available, skipping addons');
			return;
		}

		mainSettings.modules.forEach(function(modname) {
			var src = '/js/addons/addon_' + modname + '.js';
			loadScript(src, 'Addon: ' + modname);
		});
	} catch(e) {
		console.error('[load.js] Error loading addons:', e);
	}
}

// Load gateway_global_settings.js first, then load addons when it's ready
loadScript(scriptFiles[0], 'Main: ' + scriptFiles[0], loadAddons);

// Load remaining main scripts
for (var i = 1; i < scriptFiles.length; i++) {
	loadScript(scriptFiles[i], 'Main: ' + scriptFiles[i]);
}

// Load language files
languageFiles.forEach(function(lang) {
	var src = '/js/lang/' + lang + '.js';
	loadScript(src, 'Language: ' + lang);
});

// Load stylesheets
styleFiles.forEach(function(file) {
	loadStylesheet(file, 'Stylesheet: ' + file);
});

$('#defaultStyle').remove(); // we can remove the default style now

