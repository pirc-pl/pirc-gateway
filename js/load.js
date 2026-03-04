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

// Update loading message as soon as DOM is ready (before scripts load)
// This will be replaced with proper translation once language files are loaded
document.addEventListener('DOMContentLoaded', () => {
	if (!window.WebSocket) {
		document.querySelector('.not-connected-text > h3').textContent = 'WebSocket not supported';
		document.querySelector('.not-connected-text > p').textContent = 'Twoja przeglądarka nie obsługuje WebSocket. Użyj nowszej przeglądarki. / Your browser does not support WebSocket. Please use a modern browser.';
		return;
	}
	document.querySelector('.not-connected-text > h3').textContent = 'Ładowanie / Loading';
	document.querySelector('.not-connected-text > p').textContent = 'Ładowanie, proszę czekać... / Loading, please wait...';
});

/**
 * Script files to load in order.
 * IMPORTANT: Order matters for dependencies!
 * - language.js must load before addons (provides lang object)
 * - Language files must load before addons (provides lang.pl and lang.en objects that addons extend)
 * - gateway_functions.js must load before gateway_conn.js (provides decryptPassword/encryptPassword)
 * - gateway_conn.js must load before chat_integrator.js (defines conn object)
 *
 * Load order:
 * 1. Main scripts (scriptFiles array) - loaded sequentially
 * 2. Language files (languageFiles array) - loaded after main scripts, provides base translations
 * 3. Addons (mainSettings.modules) - loaded after language files, can extend translations
 * 4. Ready functions executed (readyFunctions array)
 */
const scriptFiles = [
	'/js/revision.js',
	'/js/gateway_global_settings.js',
	'/js/language.js',
	'/js/settings.js',
	'/js/gateway_functions.js',  // Provides: decryptPassword, encryptPassword, readyFunc, IRCEventEmitter; Pushes: setEnvironment, fillEmoticonSelector, fillColorSelector
	'/js/irc_events.js',          // Provides: IrcEventEmitter (connection-scoped event bus, extends IRCEventEmitter)
	'/js/gateway_conn.js',        // Uses: decryptPassword; Provides: conn object; Pushes: conn.gatewayInit
	'/js/integrator/ignore.js',
	'/js/integrator/services.js',
	'/js/protocol/irc_transport.js',
	'/js/protocol/irc_protocol.js',
	'/js/ui/gateway_tabs.js',
	'/js/integrator/chat_integrator.js',
	'/js/ui/gateway_display.js',
	'/js/ui/user_commands.js',
	'/js/ui/ignore.js',
	'/js/integrator/channel_state.js',
	'/js/integrator/users.js',
	'/js/gateway_main.js',
	'/js/ui/emoji.js',
	'/js/ui/g-emoji-element.js'
];
const styleFiles = [
	'/styles/gateway_def.css'
];
const languageFiles = [
	'en',
	'pl'
];

// Cache-busting random ID (same for all files in this session)
const ranid = Math.floor(Math.random() * 10000);

/**
 * Helper function to load a script file sequentially with proper error tracking
 * @param {string} src - The script source URL
 * @param {string} description - Human-readable description for error messages
 * @param {Function} onLoadCallback - Callback when script loads successfully
 * @param {Function} onErrorCallback - Callback when script fails to load
 */
function loadScript(src, description, onLoadCallback, onErrorCallback) {
	const script = document.createElement('script');
	script.type = 'text/javascript';
	script.src = `${src  }?${  ranid}`;

	// Track load failures for better debugging
	script.onerror = function() {
		console.error(`[load.js] Failed to load: ${  description  } (${  src  })`);
		if (onErrorCallback) {
			onErrorCallback();
		}
	};

	script.onload = function() {
		console.log(`[load.js] Loaded: ${  description}`);
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
	const link = document.createElement('link');
	link.rel = 'stylesheet';
	link.href = `${href  }?${  ranid}`;

	link.onerror = function() {
		console.error(`[load.js] Failed to load: ${  description  } (${  href  })`);
	};

	link.onload = function() {
		console.log(`[load.js] Loaded: ${  description}`);
	};

	$('head').append(link);
}

/**
 * Load addon modules after language files are loaded.
 * Addons can extend language objects (lang.pl, lang.en) with their own translations.
 */
function loadAddons() {
	try {
		if (typeof mainSettings === 'undefined' || !mainSettings.modules) {
			console.warn('[load.js] mainSettings.modules not available, skipping addons');
			readyFunc(); // No addons, proceed to ready state
			return;
		}

		// Load addons sequentially
		let addonIndex = 0;
		function loadNextAddon() {
			if (addonIndex >= mainSettings.modules.length) {
				// All addons loaded, now execute ready function
				readyFunc();
				return;
			}
			const modname = mainSettings.modules[addonIndex];
			const src = `/js/addons/addon_${  modname  }.js`;
			addonIndex++;
			loadScript(src, `Addon: ${  modname}`, loadNextAddon);
		}
		loadNextAddon();
	} catch (e) {
		console.error('[load.js] Error loading addons:', e);
	}
}

/**
 * Load scripts sequentially to guarantee execution order
 */
function loadScriptsSequentially() {
	let scriptIndex = 0;

	function loadNextScript() {
		if (scriptIndex >= scriptFiles.length) {
			// All main scripts loaded, now load language files
			loadLanguageFiles();
			return;
		}

		const src = scriptFiles[scriptIndex];
		const description = `Main: ${  src}`;
		scriptIndex++;

		loadScript(src, description, loadNextScript);
	}

	loadNextScript();
}

/**
 * Load language files sequentially
 */
function loadLanguageFiles() {
	let langIndex = 0;

	function loadNextLang() {
		if (langIndex >= languageFiles.length) {
			// All language files loaded - now load addons
			loadAddons();
			return;
		}
		const lang = languageFiles[langIndex];
		const src = `/js/lang/${  lang  }.js`;
		langIndex++;
		loadScript(src, `Language: ${  lang}`, loadNextLang);
	}

	loadNextLang();
}

/**
 * Add preload hints for parallel script downloading
 * Browser will download scripts in parallel while maintaining
 * sequential execution order when script tags are created
 */
function addPreloadHints() {
	const allScripts = scriptFiles.concat(
		languageFiles.map((lang) => {
			return `/js/lang/${  lang  }.js`;
		})
	);

	allScripts.forEach((src) => {
		const link = document.createElement('link');
		link.rel = 'preload';
		link.as = 'script';
		link.href = `${src  }?${  ranid}`;  // Use same cache-busting param
		document.head.appendChild(link);
	});

	console.log(`[load.js] Added preload hints for ${  allScripts.length  } scripts`);
}

// Load stylesheets (these can load in parallel)
styleFiles.forEach((file) => {
	loadStylesheet(file, `Stylesheet: ${  file}`);
});

$('#defaultStyle').remove(); // we can remove the default style now

// Add preload hints for parallel downloading, then start loading scripts
addPreloadHints();
loadScriptsSequentially();
