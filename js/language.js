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

/* To add a new language, you need to:
 * - create new translation file in /js/lang/
 * - insert new `select` item in #setLanguage in index.html
 * - add new item to `languageFiles` in /js/load.js
 */

var lang = {};

function setLanguage(slang){
	window.language = lang[slang];
	// fill static HTML with translations
	$('.language-privateMsgBlockingTitle').attr('title', language.privateMsgBlocking);
	$('.language-settingsTitle').attr('title', language.settings);
	$('.language-showUserHostTitle').attr('title', language.showUserHostTitle);
	$('.language-linkInfoTitle').attr('title', language.linkInfoTitle);
	$('.language-noticeDisplayTitle').attr('title', language.noticeDisplayTitle);
	$('.language-avatarTitle').attr('title', language.avatar);
	$('.language-informationsTitle').attr('title', language.informations);
	$('.language-changeSizeTitle').attr('title', language.changeSizeTitle);
	$('.language-gatewayInfoTitle').attr('title', language.gatewayInfoTitle);
	$('.language-disconnectWithIrcTitle').attr('title', language.disconnectWithIrc);
	$('.language-tabTitle').attr('title', language.tabTitle);
	$('.language-emoticonsSymbolsTitle').attr('title', language.emoticonsSymbolsTitle);
	$('.language-colorsFormattingTitle').attr('title', language.colorsFormattingTitle);
	$('.language-enterTitle').attr('title', language.enterTitle);
	$('.language-textFormattingTitle').attr('title', language.textFormattingTitle);
	$('.language-symbolsTitle').attr('title', language.symbolsTitle);
	$('.language-selectTextSizeTitle').attr('title', language.selectTextSizeTitle);
	$('.language-noticeDisplay').html(language.noticeDisplay);
	$('.language-version').html(language.version);
	$('.language-statusWindow').html(language.statusWindow);
	$('.language-underscoreText').html(language.underscoreText);
	$('.language-clearFormats').html(language.clearFormats);
	$('.language-emoticons').html(language.emoticons);
	$('.language-showAllAvailable').html(language.showAllAvailable);
	$('.language-thisCanTakeTime').html(language.thisCanTakeTime);
	$('.language-engineeringSymbols').html(language.engineeringSymbols);
	$('.language-dontWantPrivateMessages').html(language.dontWantPrivateMessages);
	$('.language-dontWantAnyMessages').html(language.dontWantAnyMessages);
	$('.language-dontWantFromUnregistered').html(language.dontWantFromUnregistered);
	$('.language-dontShowAvatars').html(language.dontShowAvatars);
	$('.language-setOwnAvatar').html(language.setOwnAvatar);
	$('.language-dontShowJoinsQuits').html(language.dontShowJoinsQuits);
	$('.language-dontShowNickChanges').html(language.dontShowNickChanges);
	$('.language-dontShowModes').html(language.dontShowModes);
	$('.language-tabListOnBottom').html(language.tabListOnBottom);
	$('.language-showHostnames').html(language.showHostnames);
	$('.language-autoReconnect').html(language.autoReconnect);
	$('.language-unsafeLinkWarnings').html(language.unsafeLinkWarnings);
	$('.language-darkTheme').html(language.darkTheme);
	$('.language-colorNicks').html(language.colorNicks);
	$('.language-newMsgSound').html(language.newMsgSound);
	$('.language-showEmoji').html(language.showEmoji);
	$('.language-sendEmoji').html(language.sendEmoji);
	$('.language-monospaceFont').html(language.monospaceFont);
	$('.language-autoDisconnect').html(language.autoDisconnect);
	$('.language-autoConnect').html(language.autoConnect);
	$('.language-biggerEmoji').html(language.biggerEmoji);
	$('.language-backlogCount').html(language.backlogCount);
	$('.language-popupWindow').html(language.popupWindow);
	$('.language-query').html(language.query);
	$('.language-statusTab').html(language.statusTab);
	$('.language-manageIgnored').html(language.manageIgnored);
	$('.language-allRightsReserved').html(language.allRightsReserved);
	$('.language-statusTabName').html(language.statusTabName);
	$('.language-loadingWait').html(language.loadingWait);
	$('.language-extendChannelList').html(language.extendChannelList);
	$('.language-nickOptions').html(language.nickOptions);
	$('.language-registerNick').html(language.registerNick);
	$('.language-changeNick').html(language.changeNick);
	$('.language-privateMessagesBlocking').html(language.privateMessagesBlocking);
	$('.language-requestAVhost').html(language.requestAVhost);
	$('.language-showChannelsWithAccess').html(language.showChannelsWithAccess);
	$('.language-showAutojoinChannels').html(language.showAutojoinChannels);
	$('.language-insertFormatCodes').html(language.insertFormatCodes);
	$('.language-insertColorCode').html(language.insertColorCode);
	$('.language-insertSpecialCode').html(language.insertSpecialCode);
	$('.language-turnOffColor').html(language.turnOffColor);
	$('.language-boldText').html(language.boldText);
	$('.language-reverseColors').html(language.reverseColors);
	$('.language-italicText').html(language.italicText);
};

function setDefaultLanguage(){
	try {
		if(localStorage.getItem('setLanguage') == null){
			$('#setLanguage').val(mainSettings.language);
		} else {
			$('#setLanguage').val(localStorage.getItem('setLanguage'));
		}
	} catch(e){
		console.error('Error setting language!');
		$('#setLanguage').val(mainSettings.language);
	}
	conn.setLanguage();
}

