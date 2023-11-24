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
		window.alt = [	'', '+', '%', '@', '&', '~', '' ];
		window.chStatusInfo = language.chStatusInfo;

		window.reqChannel = '';

		window.booleanSettings = [ 'showPartQuit', 'showNickChanges', 'tabsListBottom', 'showUserHostnames', 'autoReconnect', 'displayLinkWarning', 'blackTheme', 'newMsgSound', 'autoDisconnect', 'coloredNicks', 'showMode', 'dispEmoji', 'sendEmoji', 'monoSpaceFont', 'automLogIn', 'setUmodeD', 'setUmodeR', 'noAvatars', 'biggerEmoji' ];
		window.comboSettings = [ 'noticeDisplay', 'setLanguage' ];
		window.numberSettings = [ 'backlogCount' ];
		window.numberSettingsMinMax = {
			'backlogCount' : { 'min' : 0, 'max' : 500, 'deflt' : 15 }
		};
		window.textSettings = [ 'avatar' ];
		window.textSettingsValues = {};

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
			':((':	'😓',
			':/':	'😕',
			':c':	'😕',
			':o':	'😕',
			':O':	'😱',
			'xo':	'😵',
			':*':	'😘',
			';*':	'😙',
			':P':	'😛',
			';p':	'😜',
			':(':	'🙁',
			':)':	'🙂',
			'(:':	'🙃',
			'<3':	'💗',
			'-_-':	'😑',
			';(':	'😢',
			';)':	'😉'
		};

		window.emojiRegex = [];

		var out1 = '';
		var out2 = '';
		for(i in emoji){
			var expr = rxEscape(i)+'(($)|(\\s))';
			var regex = new RegExp(expr, 'g');
			emojiRegex.push([regex, emoji[i]]);
			out1 += emoji[i] + ' ';
			out2 += i + ' ';
		}

		window.settings = {
			'backlogLength': 15
		}
	} catch(e){
		console.error('Failed to set up environment:', e)
	}
}

window.messageProcessors = []; //function (src, dst, text) returns new_text
window.nickColorProcessors = []; //function (nick)
window.settingProcessors = []; //function ()
window.metadataBinds = {};
window.addons = [];
var loaded = false;

var readyFunctions = [ setEnvironment, conn.gatewayInit, fillEmoticonSelector, fillColorSelector ];

var readyFunc = function(){
	if(loaded) return;
	if(!('mainSettings' in window)){ // someone forgot to load settings
		$('.not-connected-text > h3').html('Błąd / Error');
		$('.not-connected-text > p').html('Niepoprawna konfiguracja aplikacji. Proszę skontaktować się z administratorem.<br>Invalid application configuration. Please contact administrator.');
		return;
	}
	setDefaultLanguage();
	$('.not-connected-text > h3').html(language.loading);
	$('.not-connected-text > p').html(language.loadingWait);
	if($.browser.msie && parseInt($.browser.version, 10) < 9) {
		$('.not-connected-text > h3').html(language.outdatedBrowser);
		$('.not-connected-text > p').html(language.outdatedBrowserInfo);
		gateway = 0;
		guser = 0;
		cmd_binds = 0;
		$('div#wrapper').html('');
	} else {
		loaded = true;
		for(f in readyFunctions){
			try {
				readyFunctions[f]();
			} catch(e) {}
		}
	}
}

$('document').ready(function(){setTimeout(readyFunc, 100);});

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
	return $('<div/>').text(text).html().replace(/"/g, '&quot;');
}

function bsEscape(text) { // escapowanie beksleszy i zakończeń stringa
	text = text.replace(/\\/g, '\\\\');
	text = text.replace(/'/g, '\\\'');
	text = text.replace(/"/g, '\\\"');
	return text;
}

function rxEscape(text) { //backupowanie regex
	return text.replace(/[.^$*+?()[{\\|]/g, '\\$&');
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
	return '<span><a class="charSelect" onclick="gateway.insertEmoji(\'' + c + '\')">' + emoji.addTags(c) + '</a> </span>';
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
		return emoji.addTags(out);
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
	if(document.title == newMessage) document.title = he(guser.nick)+' @ PIRC.pl';
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
		booleanSettings.forEach(function(sname){
			try {
				localStorage.setItem(sname, $('#'+sname).is(':checked'));
			} catch(e){}
		});
		textSettings.forEach(function(sname){
			try {
				if(textSettingsValues[sname]){
					localStorage.setItem(sname, textSettingsValues[sname]);
				} else {
					localStorage.removeItem(sname);
				}
			} catch(e){}
		});
		comboSettings.forEach(function(sname){
			try {
				localStorage.setItem(sname, $('#'+sname).val());
			} catch(e){}
		});

		numberSettings.forEach(function(sname){
			var value = $('#'+sname).val();
			if(value == '' || isNaN(parseFloat(value)) || value < numberSettingsMinMax[sname]['min'] || value > numberSettingsMinMax[sname]['max']){
				value = numberSettingsMinMax[sname]['deflt'];
				$('#'+sname).val(value);
			}
			try {
				localStorage.setItem(sname, value);
			} catch(e){}
		});
		gateway.showNickList(); //WORKAROUND: pokaż panel nawet w prywatnej i w statusie, inaczej poniższe dłubanie w CSS powoduje popsucie interfejsu graficznego
		settings.backlogLength = parseInt($('#backlogCount').val());
		if ($('#tabsListBottom').is(':checked')) {
			$('#top_menu').detach().insertAfter('#inputbox');
			if($('#tabsDownCss').length == 0) {
				$('head').append('<link rel="stylesheet" type="text/css" href="/styles/gateway_tabs_down.css" id="tabsDownCss">');
			}
		} else {
			$('#top_menu').detach().insertAfter('#options-box');
			$('#tabsDownCss').remove();
		}
		if ($('#blackTheme').is(':checked')) {
			if($('#blackCss').length == 0) {
				$('head').append('<link rel="stylesheet" type="text/css" href="/styles/gateway_black.css" id="blackCss">');
			}
		} else {
			$('#blackCss').remove();
		}
		if ($('#monoSpaceFont').is(':checked')) {
			if($('#monospace_font').length == 0){
				var style = $('<style id="monospace_font">#chat-wrapper { font-family: DejaVu Sans Mono, Consolas, monospace, Symbola; } </style>');
				$('html > head').append(style);
			}
		} else {
			$('#monospace_font').remove();
		}
		if ($('#noAvatars').is(':checked')) {
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
		if ($('#showUserHostnames').is(':checked')) {
			$('#userhost_hidden').remove();
		} else {
			if($('#userhost_hidden').length == 0){
				var style = $('<style id="userhost_hidden">.userhost { display:none; }</style>');
				$('html > head').append(style);
			}
		}
		if($('#automLogIn').is(':checked')){
			$('#automLogIn').parent().parent().css('display', '');
		} else {
			$('#automLogIn').parent().parent().css('display', 'none');
		}
		if($('#biggerEmoji').is(':checked')){
			document.documentElement.style.setProperty('--emoji-scale', '3');
		} else {
			document.documentElement.style.setProperty('--emoji-scale', '1.8');
		}
		for(i in settingProcessors){
			settingProcessors[i]();
		}
		if(!e){
			return;
		}
		if(e.currentTarget.id == 'dispEmoji') {
			if(!$('#dispEmoji').is(':checked')){
				$('#sendEmoji').prop('checked', false);
			}
		} else if(e.currentTarget.id == 'sendEmoji'){
			if($('#sendEmoji').is(':checked')){
				$('#dispEmoji').prop('checked', true);
			}
		}
		if(e.currentTarget.id == 'setUmodeD') {
			if($('#setUmodeD').is(':checked')){
				$('#setUmodeR').prop('checked', true);
				gateway.send('MODE '+guser.nick+' +R');
				if(!guser.umodes.D){
					gateway.send('MODE '+guser.nick+' +D');
				}
			} else {
				if(guser.umodes.D){
					gateway.send('MODE '+guser.nick+' -D');
				}
			}
		} else if(e.currentTarget.id == 'setUmodeR') {
			if(!$('#setUmodeR').is(':checked')){
				$('#setUmodeD').prop('checked', false);
				gateway.send('MODE '+guser.nick+' -D');
				if(guser.umodes.R){
					gateway.send('MODE '+guser.nick+' -R');
				}
			} else {
				if(!guser.umodes.R){
					gateway.send('MODE '+guser.nick+' +R');
				}
			}
		} else if(e.currentTarget.id == 'setLanguage') {
			var lang = $('#setLanguage').val();
			setLanguage(lang);
		}
		$('#nicklist').removeAttr('style');
		$('#chlist').removeAttr('style');
		if($('#chlist-body').is(':visible')){
			gateway.toggleChanList();
		}
	},
	'showAbout': function() {
		disp.displaySpecialDialog('about-dialog', 'OK');
	},
	'showAvatarSetting': function(){
		if(!mainSettings.supportAvatars) return;
		if(!guser.me.registered || window.FormData === undefined || !mainSettings.avatarUploadUrl){
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
					'<button type="button" value="" id="submit-avatar">' + language.applySetting + '</button><br>' +
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
			if(!textSettingsValues['avatar']){
				$('#letterAvatarExample').css('background-color',$$.nickColor(guser.nick, true));
				$('#letterAvatarExampleContent').text(guser.nick.charAt(0));
				$('#current-avatar-info').text(language.noAvatarSet);
				$('#current-avatar-image').attr('src', '/styles/img/noavatar.png');
				$('#current-avatar-image').attr('alt', language.noAvatarSet);
				$('#current-letter-avatar').show();
				$('#delete-avatar').hide();
			} else {
				$('#current-avatar-info').text(language.currentAvatar);
				$('#current-avatar-image').attr('src', textSettingsValues['avatar'].replace('{size}', '100'));
				$('#current-avatar-image').attr('alt', language.currentAvatar);
				$('#current-letter-avatar').hide();
				$('#avatar-url').val(textSettingsValues['avatar']);
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
					language.youAcceptToStoreTheData + mainSettings.networkName + '.' +
				'</div>';
			$('#avatar-dialog').html(html);
			$('#delete-avatar').click(disp.deleteAvatar);
			$('#submit-avatar').click(disp.submitAvatar);
			if(!textSettingsValues['avatar']){
				$('#letterAvatarExample').css('background-color',$$.nickColor(guser.nick, true));
				$('#letterAvatarExampleContent').text(guser.nick.charAt(0));
				$('#current-avatar-info').text(language.avatarNotSet);
				$('#current-avatar-image').attr('src', '/styles/img/noavatar.png');
				$('#current-avatar-image').attr('alt', language.avatarNotSet);
				$('#current-letter-avatar').show();
				$('#delete-avatar').hide();
			} else {
				$('#current-avatar-info').text(language.currentAvatar);
				$('#current-avatar-image').attr('src', textSettingsValues['avatar']);
				$('#current-avatar-image').attr('alt', language.currentAvatar);
				$('#current-letter-avatar').hide();
				$('#avatar-url').val(textSettingsValues['avatar']);
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
			textSettingsValues['avatar'] = url;
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
			var label = gateway.makeLabel();
			gateway.labelCallbacks[label] = function(label, msg, batch){
				if(!batch){
					var jwt = msg.args[2];
				} else {
					var jwt = batch.extjwtContent;
				}
				fd.append('jwt', jwt);
				console.log('jwt is: '+jwt);
				$.ajax({
					url: mainSettings.avatarUploadUrl,
					dataType: 'json',
					method: 'post',
					processData: false,
					contentType: false,
					data: fd,
					success: function(data){
						console.log(data);
						if(data['result'] == 'ok'){
							textSettingsValues['avatar'] = data['url'];
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
			};
			var args = ['*'];
			if(mainSettings.extjwtService){
				args.push(mainSettings.extjwtService);
			}
			ircCommand.perform('EXTJWT', args, false, {'label': label});
		}
	},
	'deleteAvatar': function() {
		if(!guser.me.registered){
			if(!confirm(language.areYouSureToDeleteAvatar + '"' +textSettingsValues['avatar']+ '"?')){
				return;
			}
			textSettingsValues['avatar'] = false;
			disp.showAvatarSetting();
			disp.avatarChanged();
		} else {
			if(!confirm(language.deleteAvatarQ)){
				return;
			}
			var label = gateway.makeLabel();
			gateway.labelCallbacks[label] = function(label, msg, batch){
				if(!batch){
					var jwt = msg.args[2];
				} else {
					var jwt = batch.extjwtContent;
				}
				console.log('jwt is: '+jwt);
				$.ajax({
					url: mainSettings.avatarDeleteUrl,
					dataType: 'json',
					method: 'post',
					data: {
						'image-type': 'avatar',
						'jwt': jwt
					},
					success: function(data){
						console.log(data);
						if(data['result'] == 'ok'){
							textSettingsValues['avatar'] = false;
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
			};
			var args = ['*'];
			if(mainSettings.extjwtService){
				args.push(mainSettings.extjwtService);
			}
			ircCommand.perform('EXTJWT', args, false, {'label': label});
		}
	},
	'avatarChanged': function() {
		disp.changeSettings();
		if(textSettingsValues['avatar']){
			ircCommand.metadata('SET', '*', ['avatar', textSettingsValues['avatar']]);
		} else {
			ircCommand.metadata('SET', '*', ['avatar']);
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
				'<b>' + language.changeChannelTopic + '</b><textarea name="topicEdit" id="topicEdit">'+channel.topic+'</textarea>' +
				'<button id="topic-change-button-' + channel.id + '">' + language.changeTopicSubmit + '</button><br>' +
				language.youCanCopyCodesToTopic +
			'</p>';
		$$.closeDialog('confirm', 'topic');
		$$.displayDialog('confirm', 'topic', language.topicOfChannel + channel.name, html);
		$('#topic-change-button-' + channel.id).click(function(){
			gateway.changeTopic(channel.name);
		});
	},
	'playSound': function() {
		if ( ! $('#newMsgSound').is(':checked')) {
			return;
		}
		var filename = '/styles/audio/served';
		$('#sound').html('<audio autoplay="autoplay"><source src="' + filename + '.mp3" type="audio/mpeg" /><source src="' + filename + '.ogg" type="audio/ogg" /><embed hidden="true" autostart="true" loop="false" src="' + filename +'.mp3" /></audio>');
	},
	'insertLinebeI': function(mode, args){
		var chanId = gateway.findChannel(args[1]).id;
		var listName = disp.getNamebeI(mode);
		if($$.getDialogSelector('list', 'list-'+mode+'-'+args[1]).length == 0){
			var html = '<div class="beIListContents"><table><tr><th>' + language.mask + '</th><th>' + language.setBy + '</th><th>' + language.date + '</th>';
			if(mode == 'b'){
				html += '<th>' + language.appliesTo + '</th>';
			}
			html += '</tr></table></div>';
			$$.displayDialog('list', 'list-'+mode+'-'+args[1], language.listOf+listName+language.onChannel+he(args[1]), html);
		}
		var html = '<tr><td>'+he(args[2])+'</td><td>'+he(args[3])+'</td><td>'+$$.parseTime(args[4])+'</td>';
			if(mode == 'b'){
				html += '<td>';
				try {
					var affected = localStorage.getItem('banmask-'+md5(args[2]));
					if(affected){
						html += he(affected);
					}
				} catch(e){}
				html += '</td>';
			}
			html += '<td class="'+chanId+'-operActions button" style="display:none">' +
			'<button id="un'+mode+'-'+chanId+'-'+md5(args[2])+'">' + language.remove + '</button>' +
			'</td></tr>';
		$('table', $$.getDialogSelector('list', 'list-'+mode+'-'+args[1])).append(html);
		$('#un'+mode+'-'+chanId+'-'+md5(args[2])).click(function(){
			gateway.send('MODE '+args[1]+' -'+mode+' '+args[2]+'\r\nMODE '+args[1]+' '+mode);
			$$.closeDialog('list', 'list-'+mode+'-'+args[1]);
		});
	},
	'endListbeI': function(mode, chan){
		if($$.getDialogSelector('list', 'list-'+mode+'-'+chan).length == 0){
			$$.displayDialog('list', 'list-'+mode+'-'+chan, language.listOf+disp.getNamebeI(mode)+language.onChannel+he(chan), language.listIsEmpty);
		}
	},
	'getNamebeI': function(mode){
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
			html += '<a class="charSelect" onclick="gateway.insertEmoji(\'' + data[i].text + '\')"><g-emoji fallback-src="/styles/emoji/' + data[i].code + '.png" class="emoji-wrapper">' + data[i].text + '</g-emoji></a> ';
		}
		html += '</div>';
		$$.displayDialog('emoticons', 'allEmoticons', language.allEmoticons, html);
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
		if (!$('#coloredNicks').is(':checked')){
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
		for(a in nickColorProcessors){
			var ret = nickColorProcessors[a](nick);
			if(ret){
				color = ret;
			}
		}
		if(codeOnly){
			return color;
		} else {
			return 'style="color:' + color +'"';
		}
	},
	'colorize': function(message, strip) {
		if(strip == undefined) var strip = false;
		if ($('#blackTheme').is(':checked')) {
			var pageFront = 'white';
			var pageBack = 'black';
		} else {
			var pageBack  = 'white';
			var pageFront = 'black';
		}
		var currBack = pageBack;
		var currFront = pageFront;
		var newText = '';
		if($('#dispEmoji').is(':checked')){
			message = $$.textToEmoji(message);
		}
		if(!strip){
			message = he(message);
			message = $$.parseLinks(message);
			if($('#dispEmoji').is(':checked')){
				message = emoji.addTags(message);
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
					console.log(code);
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
				case 7:  return '#838900';
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
		//}
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
				var imgurl = encodeURI(arg);
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
					var imgurl = encodeURI(rmatch[1]);
					html += '<a id="a-video-' + rand + '"'+
						' class="image_link"'+attrs+'><span id="show-'+rand+'" style="display:inline;">' + language.show + '</span><span id="hide-'+rand+'" style="display:none;">' + language.hide + '</span>' + language.aVideo + '</a>'+
						'<div style="display:none;" id="img-'+rand+'"><iframe width="560" height="315" id="vid-'+rand+'" frameborder="0" allowfullscreen></iframe></div>';
					callbacks['a-video-' + rand] = function() {
						disp.toggleVideoView(rand, imgurl);
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
		if ($('#displayLinkWarning').is(':checked')) {
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
						newText += '<a href="javascript:gateway.send(\'JOIN '+bsEscape(link.link)+'\')"' + confirmChan + '>'+link.text+'</a>' + c + link.append;
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
			newText += '<a href="javascript:gateway.send(\'JOIN '+bsEscape(link.link)+'\')"' + confirmChan + '>'+link.text+'</a>' + link.append;
		}
		return newText;
	},
	'displayReconnect': function(){
		var button = [ {
			text: language.reconnect,
			click: function(){
				gateway.reconnect();
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
				if(gateway.connectStatus != 'connected'){
					return;
				}
				if(sender.toLowerCase() == guser.nick.toLowerCase() && !gateway.displayOwnWhois){
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
		regex = regex.replace(/[-[\]{}()+,.\\^$|#\s]/g, "\\$&");
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
}

function escapeRegExp(string) { // my editor syntax colouring fails at this, so moved to the end
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

