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

const ignoreData = {
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

const ignore = {
	'loadList': function() {
		try {
			const ignoreList = localStorage.getItem('ignore');
			if (ignoreList) {
				newIgnoreData = JSON.parse(ignoreList);
				for (const [key, subObj] of Object.entries(newIgnoreData)) {
					for (const key2 of Object.keys(subObj)) {
						ignoreData[key][key2] = ignoreData[key][key2].concat(newIgnoreData[key][key2]);
					}
				}
				localStorage.setItem('ignore', JSON.stringify(ignoreData));
			}
		} catch (e) {
			console.error(e);
		}
	},
	'wildcardChecker': function(array, input) {
		if (!input)
			return false;
		for (const regex of array) {
			if (input.match(new RegExp(regex))) {
				return true;
			}
		}
		return false;
	},
	'ignoring': function(user, type) {
		if (!user)
			return false;
		let nick;
		if (typeof user === 'string' || user instanceof String) {
			nick = user;
			user = connection.chat.users.getExistingUser(nick);
		} else {
			nick = user.nick;
		}
		if (nick.isInList(servicesNicks))
			return false;

		if (!user) {
			// Nick not in users list - can only match nick-based patterns
			return ignore.wildcardChecker(ignoreData.userhost[type], `${nick  }!*@*`);
		}

		if (user.realname && ignore.wildcardChecker(ignoreData.realname[type], user.realname.replace(/ /g, '_')))
			return true;
		if (user.account && ignore.wildcardChecker(ignoreData.account[type], user.account))
			return true;
		if (user.host && user.ident) {
			if (ignore.wildcardChecker(ignoreData.userhost[type], `${nick  }!${  user.ident  }@${  user.host}`))
				return true;
		} else {
			if (ignore.wildcardChecker(ignoreData.userhost[type], `${nick  }!*@*`))
				return true;
		}
		return false;
	},
	'getIgnoreList': function() {
		const data = [];
		for (const entry of ignoreData.realname.channel) {
			data.push(['channel', `~r:${  $$.regexToWildcard(entry)}`]);
		}
		for (const entry of ignoreData.realname.query) {
			data.push(['query', `~r:${  $$.regexToWildcard(entry)}`]);
		}
		for (const entry of ignoreData.account.channel) {
			data.push(['channel', `~a:${  $$.regexToWildcard(entry)}`]);
		}
		for (const entry of ignoreData.account.query) {
			data.push(['query', `~a:${  $$.regexToWildcard(entry)}`]);
		}
		for (const entry of ignoreData.userhost.channel) {
			data.push(['channel', $$.regexToWildcard(entry)]);
		}
		for (const entry of ignoreData.userhost.query) {
			data.push(['query', $$.regexToWildcard(entry)]);
		}
		return data;
	},
	'addIgnore': function(type, maskType, regex) {
		if (ignore.isInList(type, maskType, regex)) {
			return false;
		}
		switch (maskType) {
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
		localStorage.setItem('ignore', JSON.stringify(ignoreData));
		return true;
	},
	'removeIgnore': function(type, maskType, regex) {
		if (!ignore.isInList(type, maskType, regex)) {
			return false;
		}
		switch (maskType) {
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
		localStorage.setItem('ignore', JSON.stringify(ignoreData));
		return true;
	},
	'isInList': function(type, maskType, regex) {
		if (ignoreData[maskType][type].indexOf(regex) >= 0)
			return true;
		return false;
	},
};

