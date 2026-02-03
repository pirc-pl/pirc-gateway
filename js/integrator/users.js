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

class User {
	constructor(nick, chat, events) {
		this._domain = chat;
		this._events = events;
		this.nick = nick;
		this.id = nick.replace(/^#/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase() + Math.round(Math.random() * 10000);
		this.ident = false;
		this.host = false;
		this.realname = false;
		this.account = false;
		this.registered = false;
		this.ircOp = false;
		this.bot = false;
		this.away = false;
		this.server = false; // this user is a server
		this.metadata = {};
	}

	setIdent(ident) {
		this.ident = ident;
		this._events.emit('chat:userUpdated', { user: this, updatedField: 'ident' });
	}

	setHost(host) {
		this.host = host;
		this._events.emit('chat:userUpdated', { user: this, updatedField: 'host' });
	}

	setServer(server) {
		// server=true marks this entity as a server (not a regular user); used to suppress user-specific UI
		this.server = server;
	}

	setAccount(account) {
		this.account = account;
		if (!account && this.registered) {
			this.setRegistered(false);
		} else if (account) {
			this.setRegistered(true);
		}
		this._events.emit('chat:userUpdated', { user: this, updatedField: 'account' });
	}

	setNick(nick) {
		this.nick = nick;
	}

	setRealname(realname) {
		this.realname = realname;
		this._events.emit('chat:userUpdated', { user: this, updatedField: 'realname' });
	}

	setMetadata(key, value) {
		if (value) {
			this.metadata[key] = value;
		} else {
			if (key in this.metadata) delete this.metadata[key];
		}
		if (key == 'avatar') {
			this._events.emit('chat:userUpdated', { user: this, updatedField: 'avatar' });
			if (value && this.nick == this._domain.me.nick) { // this is our own avatar
				settings._textSettingsValues.avatar = value;
				this._events.emit('chat:meAvatarMetadataUpdated', { user: this, avatarValue: value });
			}
		} else { // General metadata change
			this._events.emit('chat:userUpdated', { user: this, updatedField: 'metadata', metadataKey: key });
		}
	}

	setIrcOp(ircOp) {
		this.ircOp = ircOp;
		this._events.emit('chat:userUpdated', { user: this, updatedField: 'ircOp' });
	}

	setBot(bot) {
		this.bot = bot;
		this._events.emit('chat:userUpdated', { user: this, updatedField: 'bot' });
	}

	setAway(text) {
		this.away = text;
		this._events.emit('chat:userUpdated', { user: this, updatedField: 'away' });
	}

	notAway() {
		this.away = false;
		this._events.emit('chat:userUpdated', { user: this, updatedField: 'away' });
	}

	setRegistered(registered) {
		this.registered = registered;
		if (!registered) {
			this.setAccount(false);
		}
		if (this.nick == this._domain.me.nick) {
			this._events.emit('chat:meRegisteredStatusUpdated', { user: this, registered: registered });
		}
		this._events.emit('chat:userUpdated', { user: this, updatedField: 'registered' });
	}
}

class Users {
	constructor(chat, events) {
		this.chat = chat;
		this.events = events;
		this.list = {};
		this.channelMemberLists = new Map();
	}

	addUser(nick) {
		if (nick == '*') {
			if ('*' in this.list) {
				return this.list['*'];
			} else if (this.chat.me.nick in this.list) {
				return this.addUser(this.chat.me.nick);
			} else {
				this.list['*'] = new User('*', this.chat, this.events);
				this.chat.me.userRef = this.list['*'];
				return this.list['*'];
			}
		}
		if (nick in this.list) return this.list[nick];
		this.list[nick] = new User(nick, this.chat, this.events);
		if (nick == this.chat.me.nick) this.chat.me.userRef = this.list[nick];
		return this.list[nick];
	}

	delUser(nick) {
		if (nick in this.list) {
			delete this.list[nick];
		}
	}

	getUser(nick) {
		return this.addUser(nick);
	}

	getExistingUser(nick) {
		if (nick in this.list) return this.list[nick];
		return null;
	}

	clear() {
		this.list = {};
		this.channelMemberLists = new Map();
		this.addUser('*');
	}

	changeNick(oldNick, newNick, time) {
		if (!time)
			time = new Date();

		const user = this.getExistingUser(oldNick);
		if (!user) return;

		delete this.list[oldNick];
		user.setNick(newNick);
		this.list[newNick] = user;

		if (oldNick == this.chat.me.nick) { // changing own nick
			this.chat.me.changeNick(newNick);
			this.events.emit('chat:meNickChanged', { oldNick: oldNick, newNick: newNick });
		}

		// Emit a general user update event for any nicklist displays
		// The `updatedField: 'nick'` would indicate the primary change
		this.events.emit('chat:userUpdated', { user: user, updatedField: 'nick' });
		// Emit a specific event for the nick change to trigger query/channel UI updates
		// Note: user.nick has already been updated to newNick at this point
		// oldNick/newNick strings provided for listeners that need to know what changed
		this.events.emit('chat:userNickChanged', { user: user, oldNick: oldNick, newNick: newNick, time: time });
	}

	knowOwnNick() { // called once on connect (001)
		const user = this.getUser('*');
		this.list[this.chat.me.nick] = user;
		delete this.list['*'];
		user.setNick(this.chat.me.nick);
	}

	getChannelMemberList(channelName) {
		return this.channelMemberLists.get(channelName);
	}

	addChannelMemberList(channelName) {
		if (!this.channelMemberLists.has(channelName)) {
			this.channelMemberLists.set(channelName, new ChannelMemberList(channelName, this.chat, this.events));
		}
		return this.channelMemberLists.get(channelName);
	}

	removeChannelMemberList(channelName) {
		if (this.channelMemberLists.has(channelName)) {
			this.events.emit('chat:channelMemberListRemoved', { channelName: channelName });
			this.channelMemberLists.delete(channelName);
			return true;
		}
		return false;
	}
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = { User, Users };
}
