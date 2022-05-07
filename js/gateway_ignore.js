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

var ignoreData = {
	'realname': {
		'channel': [],
		'query': []
	},
	'account': {
		'channel': [],
		'query': []
	},
	'userhost': {
		'channel': [],
		'query': []
	}
};

var ignore = {
	'loadList': function(){
		try {
			var ignoreList = localStorage.getItem('ignore');
			if(ignoreList){
				newIgnoreData = JSON.parse(ignoreList);
				/* convert old style ignore - remove this in 2023 :) */
				if('full' in newIgnoreData){
					for(var i=0; i<newIgnoreData.full.channel.length; i++){
						ignoreData.userhost.channel.push($$.wildcardToRegex(newIgnoreData.full.channel[i]+'!*@*'));
					}
					for(var i=0; i<newIgnoreData.full.query.length; i++){
						ignoreData.userhost.query.push($$.wildcardToRegex(newIgnoreData.full.query[i]+'!*@*'));
					}
					delete newIgnoreData.full;
				}
				if('wildcard' in newIgnoreData){
					for(var i=0; i<newIgnoreData.wildcard.channel.length; i++){
						ignoreData.userhost.channel.push($$.wildcardToRegex(newIgnoreData.wildcard.channel[i]+'!*@*'));
					}
					for(var i=0; i<newIgnoreData.wildcard.query.length; i++){
						ignoreData.userhost.query.push($$.wildcardToRegex(newIgnoreData.wildcard.query[i]+'!*@*'));
					}
					delete newIgnoreData.wildcard;
				}
				for(var key in newIgnoreData){
					for(var key2 in newIgnoreData[key]){
						ignoreData[key][key2] = ignoreData[key][key2].concat(newIgnoreData[key][key2]);
					}
				}
				localStorage.setItem('ignore', JSON.stringify(ignoreData));
			}
		} catch(e){
			console.error(e);
		}
	},
	'wildcardChecker': function(array, input){
		if(!input)
			return false;
		for(var i = 0; i < array.length; i++){
			var regex = array[i];
			if(input.match(new RegExp(regex))){
				return true;
			}
		}
		return false;
	},
	'ignoring': function(user, type) {
		if(!user)
			return false;
		if(typeof user === 'string' || user instanceof String){
			var nick = user;
			user = users.getExistingUser(nick);
		} else {
			var nick = user.nick;
		}
		if(nick.isInList(servicesNicks))
			return false;

		if(!user)
			return false;

		if(user.realname && ignore.wildcardChecker(ignoreData.realname[type], user.realname.replace(/ /g, '_')))
			return true;
		if(user.account && ignore.wildcardChecker(ignoreData.account[type], user.account))
			return true;
		if(user.host && user.ident){
			if(ignore.wildcardChecker(ignoreData.userhost[type], nick+'!'+user.ident+'@'+user.host))
				return true;
		} else {
			if(ignore.wildcardChecker(ignoreData.userhost[type], nick+'!*@*'))
				return true;
		}
		return false;
	},
	'getIgnoreList': function() {
		var data = [];
		for(var i=0; i < ignoreData.realname.channel.length; i++){
			data.push(['channel', '~r:' + $$.regexToWildcard(ignoreData.realname.channel[i])]);
		}
		for(var i=0; i < ignoreData.realname.query.length; i++){
			data.push(['query', '~r:' + $$.regexToWildcard(ignoreData.realname.query[i])]);
		}
		for(var i=0; i < ignoreData.account.channel.length; i++){
			data.push(['channel', '~a:' + $$.regexToWildcard(ignoreData.account.channel[i])]);
		}
		for(var i=0; i < ignoreData.account.query.length; i++){
			data.push(['query', '~a:' + $$.regexToWildcard(ignoreData.account.query[i])]);
		}
		for(var i=0; i < ignoreData.userhost.channel.length; i++){
			data.push(['channel', $$.regexToWildcard(ignoreData.userhost.channel[i])]);
		}
		for(var i=0; i < ignoreData.userhost.query.length; i++){
			data.push(['query', $$.regexToWildcard(ignoreData.userhost.query[i])]);
		}
		return data;
	},
	'showIgnoreManagement': function() {
		var data = ignore.getIgnoreList();
		if($$.getDialogSelector('ignore', 'ignorelist').length != 0){
			$$.closeDialog('ignore', 'ignorelist');
		}
		if(data.length == 0){
			var html = language.listIsEmpty;
		} else {
			var html = '<div class="beIListContents"><table><tr><th>' + language.appliesTo + '</th><th>' + language.mask + '</th></tr></table></div>';
		}
		$$.displayDialog('ignore', 'ignorelist', language.listOfIgnoredUsers, html);
		for(var i=0; i<data.length; i++){
			var ignoreT = data[i][0];
			if(ignoreT == 'channel'){
				var ignoreType = language.channelSmall;
			} else {
				var ignoreType = language.privateDiscussionSmall;
			}
			var ignoreMask = data[i][1];
			var html = '<tr><td>'+ignoreType+'</td><td>'+he(ignoreMask)+'</td>' +
				'<td><button id="unignore_'+ignoreT+'_'+md5(ignoreMask)+'">' + language.remove + '</button>' +
				'</td></tr>';
			$('table', $$.getDialogSelector('ignore', 'ignorelist')).append(html);
			$('#unignore_'+ignoreT+'_'+md5(ignoreMask)).click({type: ignoreT, mask: ignoreMask}, function(e){
				ignore.unIgnore(e.data.type, e.data.mask);
				ignore.showIgnoreManagement();
			});
		}
		var html = '<hr style="margin-top:5px;margin-bottom:5px;"><strong>' + language.addListEntry + '</strong><br>'+
			'<p><input type="text" id="new_ignore_mask"></p>' +
			'<p><input type="checkbox" id="new_ignore_query"> ' + language.privateMessages + '<br><input type="checkbox" id="new_ignore_channel"> ' + language.channelMessages + '</p>' +
			'<p><input type="button" id="ignore-add-button" value="' + language.add + '"></p>';
		$$.getDialogSelector('ignore', 'ignorelist').append(html);
		$('#ignore-add-button').click(ignore.ignoreClickInput);
	},
	'isInList': function(type, maskType, regex){
		if(ignoreData[maskType][type].indexOf(regex) >= 0)
			return true;
		return false;
	},
	'unIgnore': function(type, mask){
		ignore.changeIgnoreList(type, mask, false);
	},
	'changeIgnoreList': function(type, mask, add) {
		var maskType = 'userhost';
		var infoText = mask;
		if(mask.indexOf('~r:') == 0){
			maskType = 'realname';
			mask = mask.substring(3);
		} else if(mask.indexOf('~a:') == 0){
			maskType = 'account';
			mask = mask.substring(3);
		}
		if(maskType == 'userhost' && mask.indexOf('@') < 0){
			mask += '!*@*';
			infoText = mask;
		}
		if(maskType == 'userhost' && mask.indexOf('!') < 0){
			mask = '*!' + mask;
			infoText = mask;
		}
		
		var regex = $$.wildcardToRegex(mask);
		try {
			if(add){
				if(ignore.isInList(type, maskType, regex)){ // TODO handle new types
					return; //już jest
				}
				switch(maskType){
					case 'realname':
						ignoreData.realname[type].push(regex);
						break;
					case 'account':
						ignoreData.account[type].push(regex);
						break;
					case 'userhost':
						ignoreData.userhost[type].push(regex);
						break;
				}
				if(type == 'channel'){
					var pattern = language.messagePatterns.channelIgnoreAdded;
				} else {
					var pattern = language.messagePatterns.queryIgnoreAdded;
				}
			} else {
				if(!ignore.isInList(type, maskType, regex)){ // TODO handle new types
					return; //nie ma czego usuwać
				}
				switch(maskType){
					case 'realname':
						ignoreData.realname[type].splice(ignoreData.realname[type].indexOf(regex), 1);
						break;
					case 'account':
						ignoreData.account[type].splice(ignoreData.account[type].indexOf(regex), 1);
						break;
					case 'userhost':
						ignoreData.userhost[type].splice(ignoreData.userhost[type].indexOf(regex), 1);
						break;
				}
				if(type == 'channel'){
					var pattern = language.messagePatterns.channelIgnoreRemoved;
				} else {
					var pattern = language.messagePatterns.queryIgnoreRemoved;
				}
			}
			gateway.statusWindow.appendMessage(pattern, [$$.niceTime(), he(infoText)]);
			gateway.statusWindow.markBold();
			localStorage.setItem('ignore', JSON.stringify(ignoreData));
		} catch(e){
			$$.displayDialog('error', 'ignore', language.error, language.operationFailed);
		}
	},
	'ignoreClickInput': function() {
		var channel = $('#new_ignore_channel').prop('checked');
		var query = $('#new_ignore_query').prop('checked');
		var mask = $('#new_ignore_mask').val();
		if(mask.length == 0){
			$$.alert(language.noMaskGiven);
			return;
		}
		if(mask.indexOf(' ') > -1){
			$$.alert(language.maskCantContainSpaces);
			return;
		}
		if(!channel && !query){
			$$.alert(language.neitherChannelNorQuerySelected);
			return;
		}
		if(channel && (mask == '*' || mask == '*!*@*')){
			$$.alert(language.cantIgnoreAllInChannels);
			return;
		}
		if(channel){
			ignore.changeIgnoreList('channel', mask, true);
		}
		if(query){
			ignore.changeIgnoreList('query', mask, true);
		}
		ignore.showIgnoreManagement();
	},
	'ignoreClick': function(user, nick) {
		if(!$('#'+user.id+'_was_ignored').prop('checked') && !$('#'+user.id+'_ignore_query').prop('checked') && !$('#'+user.id+'_ignore_channel').prop('checked')){
			$$.alert(language.neitherChannelNorQuerySelected);
			return false;
		}
		var ignoreType = $('#'+user.id+'_ignore_type option:selected').val();
		switch(ignoreType){
			case 'nick':
				ignore.changeIgnoreList('query', nick+'!*@*', $('#'+user.id+'_ignore_query').prop('checked'));
				ignore.changeIgnoreList('channel', nick+'!*@*', $('#'+user.id+'_ignore_channel').prop('checked'));
				break;
			case 'host':
				ignore.changeIgnoreList('query', '*!*@'+user.host, $('#'+user.id+'_ignore_query').prop('checked'));
				ignore.changeIgnoreList('channel', '*!*@'+user.host, $('#'+user.id+'_ignore_channel').prop('checked'));
				break;
			case 'realname':
				ignore.changeIgnoreList('query', '~r:'+user.realname.replace(/ /g, '_'), $('#'+user.id+'_ignore_query').prop('checked'));
				ignore.changeIgnoreList('channel', '~r:'+user.realname.replace(/ /g, '_'), $('#'+user.id+'_ignore_channel').prop('checked'));
				break;
			case 'account':
				ignore.changeIgnoreList('query', '~a:'+user.account, $('#'+user.id+'_ignore_query').prop('checked'));
				ignore.changeIgnoreList('channel', '~a:'+user.account, $('#'+user.id+'_ignore_channel').prop('checked'));
				break;
		}
		return true;
	},
	'askIgnore': function(user) {
		if(!user){
			console.error('askIgnore called with invalid argument');
			return;
		}
		if(typeof user === 'string' || user instanceof String){
			var nick = user;
			user = users.getExistingUser(nick);
		} else {
			var nick = user.nick;
		}
		if(!user){
			console.error('askIgnore called with non-existing nick');
			return;
		}

		if(nick.isInList(servicesNicks)){
			$$.displayDialog('error', 'ignore', language.error, language.cantIgnoreNetworkService, 'OK');
			return;
		}
		var chanNickIgnored = ignore.isInList('channel', 'userhost', $$.wildcardToRegex(nick+'!*@*'));
		var queryNickIgnored = ignore.isInList('query', 'userhost', $$.wildcardToRegex(nick+'!*@*'));
		var chanIgnored = ignore.ignoring(nick, 'channel');
		var queryIgnored = ignore.ignoring(nick, 'query');
		var html =
			'<p><select id="'+user.id+'_ignore_type">' +
				'<option value="nick">(' + language.nicknameSmall + ') ' + he(user.nick) + '!*@*</option>' +
				'<option value="host">(' + language.hostnameSmall + ') *!*@' + he(user.host) + '</option>' +
				'<option value="realname">(' + language.realnameSmall + ') ~r:' + he(user.realname.replace(/ /g, '_')) + '</option>';
		if(user.account)
			html += '<option value="account">(' + language.accountNameSmall + ') ~a:' + he(user.account) + '</option>';
		html += '</select></p>' +
			'<p><input type="checkbox" id="'+user.id+'_ignore_query"> ' + language.ignorePMs + '</p>' +
			'<p><input type="checkbox" id="'+user.id+'_ignore_channel"> ' + language.ignoreChanMsgs + '</p>' +
			'<input type="checkbox" style="display:none;" id="'+user.id+'_was_ignored">';
		if(chanIgnored || queryIgnored){
			html += '<p>' + language.mayBeAlreadyIgnored + '</p>';
		}
		html += '<p><a href="javascript:ignore.showIgnoreManagement();">' + language.manageIgnored + '</a></p>';
		var button = [
			{
				text: language.cancel,
				click: function(){
					$(this).dialog('close');
				}
			},
			{
				text: language.applySetting,
				click: function(){
					if(ignore.ignoreClick(user, nick))
						$(this).dialog('close');
				}
			}
		];
		$$.displayDialog('ignore', 'ignore'+user.id, language.ignoreUserNick+nick, html, button);
		if(chanNickIgnored){
			$('#'+user.id+'_ignore_channel').prop('checked', true);
			$('#'+user.id+'_was_ignored').prop('checked', true);
		}
		if(queryNickIgnored){
			$('#'+user.id+'_ignore_query').prop('checked', true);
			$('#'+user.id+'_was_ignored').prop('checked', true);
		}
		if(!chanNickIgnored && !queryNickIgnored){ // checked by default
			$('#'+user.id+'_ignore_channel').prop('checked', true);
			$('#'+user.id+'_ignore_query').prop('checked', true);
		}
	}
}

