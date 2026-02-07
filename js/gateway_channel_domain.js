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
 * Represents a single user's presence within a specific channel in the domain layer.
 * This object holds all relevant domain-level information about the user's state in the channel,
 * without any UI-specific concerns.
 */
function ChannelMember(user, channelName) {
    this.id = user.id; // Stable ID from the global user object
    this.nick = user.nick;
    this.ident = user.ident;
    this.host = user.host;
    this.realname = user.realname;
    this.ircOp = user.ircOp;
    this.bot = user.bot;
    this.account = user.account;
    this.registered = user.registered;
    this.away = user.away;
    this.channelName = channelName; // The channel this member belongs to

    // Channel-specific properties, derived from user object as provided by protocol
    this.level = user.level || 0; // A numeric representation of rank/privileges
    // Deep copy channelModes to ensure each ChannelMember has its own independent object
    this.channelModes = user.channelModes ? JSON.parse(JSON.stringify(user.channelModes)) : {};

    /**
     * Updates the ChannelMember's properties based on a new user object.
     * Emits a domain event if relevant properties have changed.
     * @param {object} newUser - The updated domain user object.
     */
    this.update = function(newUser) {
        var changed = false;
        var oldNick = this.nick;
        var oldLevel = this.level;
        var oldModes = JSON.stringify(this.channelModes); // Deep compare for modes

        // Update properties
        if (this.nick !== newUser.nick) { this.nick = newUser.nick; changed = true; }
        if (this.ident !== newUser.ident) { this.ident = newUser.ident; changed = true; }
        if (this.host !== newUser.host) { this.host = newUser.host; changed = true; }
        if (this.realname !== newUser.realname) { this.realname = newUser.realname; changed = true; }
        if (this.ircOp !== newUser.ircOp) { this.ircOp = newUser.ircOp; changed = true; }
        if (this.bot !== newUser.bot) { this.bot = newUser.bot; changed = true; }
        if (this.account !== newUser.account) { this.account = newUser.account; changed = true; }
        if (this.registered !== newUser.registered) { this.registered = newUser.registered; changed = true; }
        if (this.away !== newUser.away) { this.away = newUser.away; changed = true; }

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
            ircEvents.emit('domain:channelMemberUpdated', {
                channelName: this.channelName,
                memberId: this.id,
                newMember: this,
                oldNick: oldNick, // Useful for UI updates related to nick changes
                oldLevel: oldLevel,
                oldModes: JSON.parse(oldModes)
            });
        }
    };
}

/**
 * Manages the list of ChannelMember objects for a specific channel in the domain layer.
 * This class handles adding, removing, and updating members, and emits domain events
 * when the list or its members change.
 */
function ChannelMemberList(channelName) {
    this.channelName = channelName;
    this.members = []; // Array of ChannelMember objects, indexed by user.id for quick lookup

    /**
     * Adds a new ChannelMember to the list.
     * @param {object} user - The domain user object to add.
     */
    this.addMember = function(user) {
        if (!this.findMemberById(user.id)) {
            var member = new ChannelMember(user, this.channelName);
            this.members.push(member);
            // Sort to maintain order if needed, or sort on retrieval for UI
            this.members.sort(this._sortFunc);

            // Only emit event if channel is not initializing
            var isInitializing = typeof domainChannelsInitializing !== 'undefined' &&
                                 domainChannelsInitializing[this.channelName.toLowerCase()];
            if (!isInitializing) {
                ircEvents.emit('domain:channelMemberListChanged', {
                    channelName: this.channelName,
                    type: 'add',
                    member: member
                });
            }
            return member;
        }
        return this.findMemberById(user.id);
    };

    /**
     * Removes a ChannelMember from the list by their stable user ID.
     * @param {string} memberId - The stable ID of the user to remove.
     * @returns {boolean} True if member was removed, false otherwise.
     */
    this.removeMemberById = function(memberId) {
        var initialLength = this.members.length;
        this.members = this.members.filter(function(member) {
            return member.id !== memberId;
        });
        if (this.members.length < initialLength) {
            ircEvents.emit('domain:channelMemberListChanged', {
                channelName: this.channelName,
                type: 'remove',
                memberId: memberId
            });
            return true;
        }
        return false;
    };

    /**
     * Finds a ChannelMember by their stable user ID.
     * @param {string} memberId - The stable ID of the user.
     * @returns {ChannelMember|null} The ChannelMember object if found, otherwise null.
     */
    this.findMemberById = function(memberId) {
        for (var i = 0; i < this.members.length; i++) {
            if (this.members[i].id === memberId) {
                return this.members[i];
            }
        }
        return null;
    };

    /**
     * Finds a ChannelMember by their current nick.
     * This is a less stable lookup and should be used with caution, primarily for initial event processing.
     * @param {string} nick - The current nick of the user.
     * @returns {ChannelMember|null} The ChannelMember object if found, otherwise null.
     */
    this.findMemberByNick = function(nick) {
        for (var i = 0; i < this.members.length; i++) {
            if (this.members[i].nick.toLowerCase() === nick.toLowerCase()) {
                return this.members[i];
            }
        }
        return null;
    };

    /**
     * Updates an existing ChannelMember or adds a new one if not found.
     * @param {object} user - The updated domain user object.
     */
    this.updateMember = function(user) {
        var member = this.findMemberById(user.id);
        if (member) {
            member.update(user); // ChannelMember itself emits specific update event
            this.members.sort(this._sortFunc); // Re-sort if properties affecting order changed
            ircEvents.emit('domain:channelMemberListChanged', {
                channelName: this.channelName,
                type: 'update',
                member: member
            });
        } else {
            this.addMember(user);
        }
    };

    /**
     * Retrieves all members of the list.
     * @returns {Array<ChannelMember>} A copy of the array of ChannelMember objects.
     */
    this.getAllMembers = function() {
        return this.members.slice(); // Return a shallow copy to prevent external modification
    };

    /**
     * Internal sorting function for ChannelMember objects.
     * Sorts by level (descending), then by nick (alphabetical, case-insensitive).
     * @private
     */
    this._sortFunc = function(a, b) {
        if (a.level < b.level) {
            return 1;
        } else if (a.level > b.level) {
            return -1;
        } else {
            if (a.nick.toLowerCase() < b.nick.toLowerCase()) {
                return -1;
            } else if (a.nick.toLowerCase() > b.nick.toLowerCase()) {
                return 1;
            } else {
                return 0;
            }
        }
    };

    // Event listeners for user-related domain events that might affect channel members
    // This is where domain layer listens to global user changes
    ircEvents.on('domain:userNickChanged', function(data) {
        // Note: data.user.nick has already been updated to newNick
        // Find member by user ID (which doesn't change on nick change)
        var member = this.findMemberById(data.user.id);
        if (member) {
            // Delegate update to ChannelMember, which will emit its own event
            member.update(data.user);
            this.members.sort(this._sortFunc);
            ircEvents.emit('domain:channelMemberListChanged', {
                channelName: this.channelName,
                type: 'nickChange',
                member: member,
                oldNick: data.oldNick,
                newNick: data.newNick
            });
        }
    }.bind(this));

    ircEvents.on('domain:userModeChanged', function(data) {
        var member = this.findMemberById(data.user.id);
        if (member) {
            member.update(data.user); // Update member properties, will emit event
            this.members.sort(this._sortFunc);
            ircEvents.emit('domain:channelMemberListChanged', {
                channelName: this.channelName,
                type: 'modeChange',
                member: member
            });
        }
    }.bind(this));

    ircEvents.on('domain:userLevelChanged', function(data) {
        var member = this.findMemberById(data.user.id);
        if (member) {
            member.update(data.user); // Update member properties, will emit event
            this.members.sort(this._sortFunc);
            ircEvents.emit('domain:channelMemberListChanged', {
                channelName: this.channelName,
                type: 'levelChange',
                member: member
            });
        }
    }.bind(this));

    ircEvents.on('domain:userAwayStatusChanged', function(data) {
        var member = this.findMemberById(data.user.id);
        if (member) {
            member.update(data.user); // Update member properties, will emit event
            ircEvents.emit('domain:channelMemberListChanged', {
                channelName: this.channelName,
                type: 'awayStatusChange',
                member: member
            });
        }
    }.bind(this));

    ircEvents.on('domain:userAccountChanged', function(data) {
        var member = this.findMemberById(data.user.id);
        if (member) {
            member.update(data.user); // Update member properties, will emit event
            ircEvents.emit('domain:channelMemberListChanged', {
                channelName: this.channelName,
                type: 'accountChange',
                member: member
            });
        }
    }.bind(this));

    // Generic listener for user updates (registration status, account, avatar, etc.)
    // Supports both single field (updatedField) and multiple fields (updatedFields array)
    ircEvents.on('domain:userUpdated', function(data) {
        var member = this.findMemberById(data.user.id);
        if (member) {
            // Update the member - this will trigger a domain:channelMemberUpdated event
            member.update(data.user);

            // Normalize to array for easier processing
            var fields = data.updatedFields || (data.updatedField ? [data.updatedField] : []);

            // Determine the type of change for the list-level event
            var changeType = 'update';
            if (fields.indexOf('registered') !== -1) {
                changeType = 'registeredChange';
            } else if (fields.indexOf('account') !== -1) {
                changeType = 'accountChange';
            } else if (fields.indexOf('avatar') !== -1) {
                changeType = 'avatarChange';
            } else if (fields.indexOf('away') !== -1) {
                changeType = 'awayChange';
            }

            ircEvents.emit('domain:channelMemberListChanged', {
                channelName: this.channelName,
                type: changeType,
                member: member,
                updatedFields: fields
            });
        }
    }.bind(this));

    // Listen for channel-specific mode changes that might affect member levels/modes
    // Data format: { channelName, user, modeChange: { mode, isAdding, nick } }
    ircEvents.on('domain:channelModeForUserChanged', function(data) {
        if (data.channelName === this.channelName) {
            var member = this.findMemberById(data.user.id);
            if (member && data.modeChange) {
                // Apply the mode change to the member's channelModes
                // Use language.modes.chStatusNames to map mode chars to mode names
                var modeName = language.modes.chStatusNames[data.modeChange.mode] || data.modeChange.mode;
                if (modeName) {
                    var oldModes = JSON.stringify(member.channelModes);
                    var oldLevel = member.level;

                    // Add or remove the mode
                    if (data.modeChange.isAdding) {
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
                        ircEvents.emit('domain:channelMemberUpdated', {
                            channelName: this.channelName,
                            memberId: member.id,
                            newMember: member,
                            oldNick: member.nick,
                            oldLevel: oldLevel,
                            oldModes: JSON.parse(oldModes)
                        });
                        this.members.sort(this._sortFunc);
                    }
                }
            }
        }
    }.bind(this));
}
