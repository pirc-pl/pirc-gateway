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

/**
 * Represents a single user's presence within a specific channel in the chat layer.
 * This object holds all relevant chat-level information about the user's state in the channel,
 * without any UI-specific concerns.
 */
class ChannelMember {
	constructor(user, channelName, events) {
		this.id = user.id; // Stable ID from the global user object
		this.user = user;  // Live reference — always reflects current user state
		this.channelName = channelName; // The channel this member belongs to
		this._events = events;

		// Channel-specific properties, derived from user object as provided by protocol
		this.level = user.level || 0; // A numeric representation of rank/privileges
		// Deep copy channelModes to ensure each ChannelMember has its own independent object
		this.channelModes = user.channelModes ? JSON.parse(JSON.stringify(user.channelModes)) : {};
	}

	/**
     * Updates the ChannelMember's properties based on a new user object.
     * Emits a chat event if relevant properties have changed.
     * @param {object} newUser - The updated chat user object.
     */
	update(newUser) {
		let changed = false;
		const oldLevel = this.level;
		const oldModes = JSON.stringify(this.channelModes);

		// User properties (ident, host, realname, away, etc.) are not copied here —
		// access via this.user.* which always reflects current state via the live reference.

		// Channel-specific properties (only update if explicitly provided)
		if ('level' in newUser && newUser.level !== undefined) {
			if (this.level !== newUser.level) { this.level = newUser.level; changed = true; }
		}
		if ('channelModes' in newUser && newUser.channelModes !== undefined) {
			if (JSON.stringify(this.channelModes) !== JSON.stringify(newUser.channelModes)) {
				this.channelModes = newUser.channelModes;
				changed = true;
			}
		}

		if (changed) {
			this._events.emit('chat:channelMemberUpdated', {
				channelName: this.channelName,
				memberId: this.id,
				newMember: this,
				oldNick: this.user.nick,
				oldLevel: oldLevel,
				oldModes: JSON.parse(oldModes)
			});
		}
	}
}

/**
 * Manages the list of ChannelMember objects for a specific channel in the chat layer.
 * This class handles adding, removing, and updating members, and emits chat events
 * when the list or its members change.
 */
class ChannelMemberList {
	constructor(channelName, chat, events) {
		this.channelName = channelName;
		this.members = []; // Array of ChannelMember objects, indexed by user.id for quick lookup
		this._domain = chat;
		this._events = events;

		// Event listeners for user-related chat events that might affect channel members
		// Using per-connection events bus so only events from this connection are received.
		this._events.on('chat:userNickChanged', ({ user, oldNick, newNick }) => {
			// Note: user.nick has already been updated to newNick
			// Find member by user ID (which doesn't change on nick change)
			const member = this.findMemberById(user.id);
			if (member) {
				// Delegate update to ChannelMember, which will emit its own event
				member.update(user);
				this.members.sort(this._sortFunc);
				this._events.emit('chat:channelMemberListChanged', {
					channelName: this.channelName,
					type: 'nickChange',
					member: member,
					oldNick: oldNick,
					newNick: newNick
				});
			}
		});

		this._events.on('chat:userModeChanged', ({ user }) => {
			const member = this.findMemberById(user.id);
			if (member) {
				member.update(user); // Update member properties, will emit event
				this.members.sort(this._sortFunc);
				this._events.emit('chat:channelMemberListChanged', {
					channelName: this.channelName,
					type: 'modeChange',
					member: member
				});
			}
		});

		this._events.on('chat:userLevelChanged', ({ user }) => {
			const member = this.findMemberById(user.id);
			if (member) {
				member.update(user); // Update member properties, will emit event
				this.members.sort(this._sortFunc);
				this._events.emit('chat:channelMemberListChanged', {
					channelName: this.channelName,
					type: 'levelChange',
					member: member
				});
			}
		});

		this._events.on('chat:userAwayStatusChanged', ({ user }) => {
			const member = this.findMemberById(user.id);
			if (member) {
				member.update(user); // Update member properties, will emit event
				this._events.emit('chat:channelMemberListChanged', {
					channelName: this.channelName,
					type: 'awayStatusChange',
					member: member
				});
			}
		});

		this._events.on('chat:userAccountChanged', ({ user }) => {
			const member = this.findMemberById(user.id);
			if (member) {
				member.update(user); // Update member properties, will emit event
				this._events.emit('chat:channelMemberListChanged', {
					channelName: this.channelName,
					type: 'accountChange',
					member: member
				});
			}
		});

		// Generic listener for user updates (registration status, account, avatar, etc.)
		// Supports both single field (updatedField) and multiple fields (updatedFields array)
		this._events.on('chat:userUpdated', ({ user, updatedFields, updatedField }) => {
			const member = this.findMemberById(user.id);
			if (member) {
				// Update the member - this will trigger a chat:channelMemberUpdated event
				member.update(user);

				// Normalize to array for easier processing
				const fields = updatedFields || (updatedField ? [updatedField] : []);

				// Determine the type of change for the list-level event
				let changeType = 'update';
				if (fields.indexOf('registered') !== -1) {
					changeType = 'registeredChange';
				} else if (fields.indexOf('account') !== -1) {
					changeType = 'accountChange';
				} else if (fields.indexOf('avatar') !== -1) {
					changeType = 'avatarChange';
				} else if (fields.indexOf('away') !== -1) {
					changeType = 'awayChange';
				}

				this._events.emit('chat:channelMemberListChanged', {
					channelName: this.channelName,
					type: changeType,
					member: member,
					updatedFields: fields
				});
			}
		});

		// Listen for channel-specific mode changes that might affect member levels/modes
		// Data format: { channelName, user, modeChange: { mode, isAdding, nick } }
		this._events.on('chat:channelModeForUserChanged', ({ channelName, user, modeChange }) => {
			if (channelName === this.channelName) {
				const member = this.findMemberById(user.id);
				if (member && modeChange) {
					// Apply the mode change to the member's channelModes
					// Use language.modes.chStatusNames to map mode chars to mode names
					const modeName = language.modes.chStatusNames[modeChange.mode] || modeChange.mode;
					if (modeName) {
						const oldModes = JSON.stringify(member.channelModes);
						const oldLevel = member.level;

						// Add or remove the mode
						if (modeChange.isAdding) {
							member.channelModes[modeName] = true;
						} else {
							delete member.channelModes[modeName];
						}

						// Recalculate level based on current modes
						if (member.channelModes.owner) member.level = 5;
						else if (member.channelModes.admin) member.level = 4;
						else if (member.channelModes.op) member.level = 3;
						else if (member.channelModes.halfop) member.level = 2;
						else if (member.channelModes.voice) member.level = 1;
						else member.level = 0;

						// Emit update event if anything changed
						if (oldModes !== JSON.stringify(member.channelModes) || oldLevel !== member.level) {
							this._events.emit('chat:channelMemberUpdated', {
								channelName: this.channelName,
								memberId: member.id,
								newMember: member,
								oldNick: member.user.nick,
								oldLevel: oldLevel,
								oldModes: JSON.parse(oldModes)
							});
							this.members.sort(this._sortFunc);
						}
					}
				}
			}
		});
	}

	/**
     * Adds a new ChannelMember to the list.
     * @param {object} user - The chat user object to add.
     */
	addMember(user) {
		if (!this.findMemberById(user.id)) {
			const member = new ChannelMember(user, this.channelName, this._events);
			this.members.push(member);
			// Sort to maintain order if needed, or sort on retrieval for UI
			this.members.sort(this._sortFunc);

			// Only emit event if channel is not initializing
			const isInitializing = typeof this._domain.channelsInitializing !== 'undefined' &&
                                 this._domain.channelsInitializing[this.channelName.toLowerCase()];
			if (!isInitializing) {
				this._events.emit('chat:channelMemberListChanged', {
					channelName: this.channelName,
					type: 'add',
					member: member
				});
			}
			return member;
		}
		return this.findMemberById(user.id);
	}

	/**
     * Removes a ChannelMember from the list by their stable user ID.
     * @param {string} memberId - The stable ID of the user to remove.
     * @returns {boolean} True if member was removed, false otherwise.
     */
	removeMemberById(memberId) {
		const initialLength = this.members.length;
		this.members = this.members.filter((member) => {
			return member.id !== memberId;
		});
		if (this.members.length < initialLength) {
			this._events.emit('chat:channelMemberListChanged', {
				channelName: this.channelName,
				type: 'remove',
				memberId: memberId
			});
			return true;
		}
		return false;
	}

	/**
     * Finds a ChannelMember by their stable user ID.
     * @param {string} memberId - The stable ID of the user.
     * @returns {ChannelMember|null} The ChannelMember object if found, otherwise null.
     */
	findMemberById(memberId) {
		for (const member of this.members) {
			if (member.id === memberId) {
				return member;
			}
		}
		return null;
	}

	/**
     * Finds a ChannelMember by their current nick.
     * This is a less stable lookup and should be used with caution, primarily for initial event processing.
     * @param {string} nick - The current nick of the user.
     * @returns {ChannelMember|null} The ChannelMember object if found, otherwise null.
     */
	findMemberByNick(nick) {
		for (const member of this.members) {
			if (member.user.nick.toLowerCase() === nick.toLowerCase()) {
				return member;
			}
		}
		return null;
	}

	/**
     * Updates an existing ChannelMember or adds a new one if not found.
     * @param {object} user - The updated chat user object.
     */
	updateMember(user) {
		const member = this.findMemberById(user.id);
		if (member) {
			member.update(user); // ChannelMember itself emits specific update event
			this.members.sort(this._sortFunc); // Re-sort if properties affecting order changed
			this._events.emit('chat:channelMemberListChanged', {
				channelName: this.channelName,
				type: 'update',
				member: member
			});
		} else {
			this.addMember(user);
		}
	}

	/**
     * Retrieves all members of the list.
     * @returns {Array<ChannelMember>} A copy of the array of ChannelMember objects.
     */
	getAllMembers() {
		return this.members.slice(); // Return a shallow copy to prevent external modification
	}

	/**
     * Internal sorting function for ChannelMember objects.
     * Sorts by level (descending), then by nick (alphabetical, case-insensitive).
     * @private
     */
	_sortFunc(a, b) {
		if (a.level < b.level) {
			return 1;
		} else if (a.level > b.level) {
			return -1;
		} else {
			if (a.user.nick.toLowerCase() < b.user.nick.toLowerCase()) {
				return -1;
			} else if (a.user.nick.toLowerCase() > b.user.nick.toLowerCase()) {
				return 1;
			} else {
				return 0;
			}
		}
	}
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = { ChannelMember, ChannelMemberList };
}
