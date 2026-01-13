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

/**
 * Script files to load in order.
 * IMPORTANT: Order matters for dependencies!
 * - language.js must load before addons (provides lang object)
 * - gateway_functions.js must load before gateway_conn.js (provides decryptPassword/encryptPassword)
 * - gateway_conn.js must load before gateway_def.js (defines conn object)
 *
 * Load order:
 * 1. Main scripts (scriptFiles array) - loaded sequentially
 * 2. Addons (mainSettings.modules) - loaded after all main scripts
 * 3. Language files (languageFiles array) - loaded after addons
 * 4. Ready functions executed (readyFunctions array)
 */
var scriptFiles = [
	'/js/gateway_global_settings.js',
	'/js/language.js',
	'/js/gateway_functions.js',  // Provides: decryptPassword, encryptPassword, readyFunc; Pushes: setEnvironment, fillEmoticonSelector, fillColorSelector
	'/js/gateway_conn.js',        // Uses: decryptPassword (line 112); Provides: conn object; Pushes: conn.gatewayInit
	'/js/gateway_ignore.js',
	'/js/gateway_services.js',    // Uses: encryptPassword (line 253)
	'/js/gateway_cmd_binds.js',
	'/js/gateway_user_commands.js',
	'/js/gateway_tabs.js',
	'/js/gateway_cmds.js',
	'/js/gateway_def.js',          // Uses: encryptPassword (line 657)
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
 * readyFunctions: Array of functions to execute when all scripts are loaded.
 * Each script file pushes its initialization functions to this array.
 * All functions are executed by readyFunc() after all scripts load.
 * Example: readyFunctions.push(myInitFunction);
 */
var readyFunctions = [];

/**
 * Helper function to load a script file sequentially with proper error tracking
 * @param {string} src - The script source URL
 * @param {string} description - Human-readable description for error messages
 * @param {Function} onLoadCallback - Callback when script loads successfully
 * @param {Function} onErrorCallback - Callback when script fails to load
 */
function loadScript(src, description, onLoadCallback, onErrorCallback) {
	var script = document.createElement('script');
	script.type = 'text/javascript';
	script.src = src + '?' + ranid;

	// Track load failures for better debugging
	script.onerror = function() {
		console.error('[load.js] Failed to load: ' + description + ' (' + src + ')');
		if (onErrorCallback) {
			onErrorCallback();
		}
	};

	script.onload = function() {
		console.log('[load.js] Loaded: ' + description);
		if (onLoadCallback) {
			onLoadCallback();
		}
	};

	document.head.appendChild(script);
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
 * Load addon modules after mainSettings is available.
 * Addons can push their initialization functions to the readyFunctions array
 * (defined in load.js), which will be executed after all scripts load.
 */
function loadAddons() {
	try {
		if (typeof mainSettings === 'undefined' || !mainSettings.modules) {
			console.warn('[load.js] mainSettings.modules not available, skipping addons');
			loadLanguageFiles();
			return;
		}

		// Load addons sequentially
		var addonIndex = 0;
		function loadNextAddon() {
			if (addonIndex >= mainSettings.modules.length) {
				// All addons loaded, now load language files
				loadLanguageFiles();
				return;
			}
			var modname = mainSettings.modules[addonIndex];
			var src = '/js/addons/addon_' + modname + '.js';
			addonIndex++;
			loadScript(src, 'Addon: ' + modname, loadNextAddon);
		}
		loadNextAddon();
	} catch(e) {
		console.error('[load.js] Error loading addons:', e);
	}
}

/**
 * Load scripts sequentially to guarantee execution order
 */
function loadScriptsSequentially() {
	var scriptIndex = 0;

	function loadNextScript() {
		if (scriptIndex >= scriptFiles.length) {
			// All main scripts loaded, now load addons
			loadAddons();
			return;
		}

		var src = scriptFiles[scriptIndex];
		var description = 'Main: ' + src;
		scriptIndex++;

		loadScript(src, description, loadNextScript);
	}

	loadNextScript();
}

/**
 * Load language files sequentially
 */
function loadLanguageFiles() {
	var langIndex = 0;

	function loadNextLang() {
		if (langIndex >= languageFiles.length) {
			// All language files loaded - now execute ready functions
			executeReadyFunctions();
			return;
		}
		var lang = languageFiles[langIndex];
		var src = '/js/lang/' + lang + '.js';
		langIndex++;
		loadScript(src, 'Language: ' + lang, loadNextLang);
	}

	loadNextLang();
}

/**
 * Execute all ready functions after scripts are loaded
 * This replaces the jQuery $(document).ready() approach
 */
function executeReadyFunctions() {
	console.log('[load.js] All scripts loaded, executing ready functions');

	// Wait a short moment to ensure all script execution contexts are complete
	setTimeout(function() {
		if (typeof readyFunc === 'function') {
			readyFunc();
		} else {
			console.error('[load.js] readyFunc is not defined');
		}
	}, 50);
}

// Load stylesheets (these can load in parallel)
styleFiles.forEach(function(file) {
	loadStylesheet(file, 'Stylesheet: ' + file);
});

$('#defaultStyle').remove(); // we can remove the default style now

// Start loading scripts
loadScriptsSequentially();

