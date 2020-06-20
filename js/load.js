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
	'/js/gateway_conn.js',
	'/js/gateway_functions.js',
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
var ranid = Math.floor(Math.random() * 10000);
for(var lit=0; lit<scriptFiles.length; lit++){
	try {
		var s = document.createElement('script');
		s.type = 'text/javascript';
		s.src = scriptFiles[lit] + '?' + ranid;
		$('head').append(s);
	} catch(e){
		console.error('Error loading main JS '+scriptFiles[lit]);
		console.error(e);
	}
}
for(var lit=0; lit<languageFiles.length; lit++){
	try {
		var modname = languageFiles[lit];
		var s = document.createElement('script');
		s.type = 'text/javascript';
		s.src = '/js/lang/' + modname + '.js?' + ranid;
		$('head').append(s);
	} catch(e){
		console.error('Error loading language JS '+modname);
		console.error(e);
	}
}
for(var lit=0; lit<styleFiles.length; lit++){
	try {
		var s = document.createElement('link');
		s.rel = 'stylesheet';
		s.href = styleFiles[lit] + '?' + ranid;
		$('head').append(s);
	} catch(e){
		console.error('Error loading style '+styleFiles[lit]);
		console.error(e);
	}
}
try {
	for(var lit=0; lit<mainSettings.modules.length; lit++){
		try {
			var modname = mainSettings.modules[lit];
			var s = document.createElement('script');
			s.type = 'text/javascript';
			s.src = '/js/addons/addon_' + modname + '.js?' + ranid;
			$('head').append(s);
		} catch(e){
			console.error('Error loading addon JS '+modname);
			console.error(e);
		}
	}
} catch(e){
	console.error('Addons loading failed: ', e);
}
$('#defaultStyle').remove(); // we can remove the default style now

