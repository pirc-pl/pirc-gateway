const disp = {
	'size': 1,
	'focused': true,
	'titleBlinkInterval': false,
	'setSize': function(s) {
		if (!s) return;
		$('body').css('font-size', `${s  }em`);
		$('input[type="checkbox"]').css('transform', `scale(${  s  })`);
		disp.size = s;
		localStorage.setItem('tsize', s);
	},
	'displaySpecialDialog': function(name, button) {
		$(`#${  name}`).dialog({
			resizable: false,
			draggable: true,
			close: function() {
				$(this).dialog('destroy');
			},
			width: 600,
			maxHeight: window.innerHeight * 0.8
		});
		if (button) {
			$(`#${  name}`).dialog('option', 'buttons', [ {
				text: button,
				click: function() {
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
		$(`#img-${  id}`).fadeToggle(200);
		setTimeout(() => {
			if ($(`#img-${  id}`).css('display') == 'none') {
				$(`#show-${  id}`).css('display', 'inline');
				$(`#hide-${  id}`).css('display', 'none');
			} else {
				if ($(`#imgc-${  id}`).prop('src') == '') {
					$(`#imgc-${  id}`).prop('src', url);
				}
				$(`#show-${  id}`).css('display', 'none');
				$(`#hide-${  id}`).css('display', 'inline');
			}
		}, 250);
	},
	'toggleVideoView': function(id, video) {
		$(`#img-${  id}`).fadeToggle(200);
		setTimeout(() => {
			if ($(`#img-${  id}`).css('display') == 'none') {
				$(`#show-${  id}`).css('display', 'inline');
				$(`#hide-${  id}`).css('display', 'none');
			} else {
				if ($(`#vid-${  id}`).prop('src') == '') {
					$(`#vid-${  id}`).prop('src', `https://www.youtube.com/embed/${  video}`);
				}
				$(`#show-${  id}`).css('display', 'none');
				$(`#hide-${  id}`).css('display', 'inline');
			}
		}, 250);
	},
	'changeSettings': function(e) {
		if (!e || !e.currentTarget || !e.currentTarget.id) {
			// If called without event, assume a general save or initialization.
			// For now, we'll ensure saveAllFromDom is called if e is missing.
			// This branch needs careful re-evaluation once all setters are event-driven.
			settings.saveAllFromDom();
		} else {
			const settingName = e.currentTarget.id;
			let newValue = settings.get(settingName); // Get the new value after DOM update
			const oldValue = settings.get(settingName); // Needs to be obtained before saveFromDom if it affects comparison

			settings.saveFromDom(settingName); // Save the specific setting that changed

			// Retrieve new value after saving
			newValue = settings.get(settingName);

			// Emit granular event for the specific setting that changed
			ircEvents.emit(`settings:changed:${  settingName}`, { key: settingName, newValue: newValue, oldValue: oldValue, event: e });
		}

		// Update global settings.backlogLength if backlogCount changed
		if (e && e.currentTarget.id === 'backlogCount') {
			settings.backlogLength = settings.get('backlogCount');
		} else if (!e) { // If called generally, ensure backlogLength is updated
			settings.backlogLength = settings.get('backlogCount');
		}

		// Emit a general event that settings have changed (for listeners that need to react to any change)
		ircEvents.emit('settings:changed');
	},
	'showAbout': function() {
		disp.displaySpecialDialog('about-dialog', 'OK');
	},
	'showAvatarSetting': function() {
		if (!mainSettings.supportAvatars) return;
		const $currentAvatar = $('<div>', { id: 'current-avatar' })
			.append($('<div>', { id: 'current-letter-avatar' })
				.append($('<span>', { class: 'avatar letterAvatar', id: 'letterAvatarExample' })
					.append($('<span>', { role: 'presentation', id: 'letterAvatarExampleContent' }))
				)
			)
			.append($('<img>', { id: 'current-avatar-image', src: '/styles/img/noavatar.png', alt: language.noAvatarSet }))
			.append($('<br>'))
			.append($('<span>', { id: 'current-avatar-info' }).text(language.noAvatarSet))
			.append(document.createTextNode(' '))
			.append($('<button>', { type: 'button', id: 'delete-avatar' }).text(language.remove));
		let $setAvatar;
		if (!connection.chat.me.userRef.registered || window.FormData === undefined || !mainSettings.avatarUploadUrl) {
			$setAvatar = $('<div>', { id: 'set-avatar' })
				.append(document.createTextNode(`${language.enterUrl} `))
				.append($('<input>', { type: 'text', id: 'avatar-url', name: 'avatar-url' }).attr('autocomplete', 'photo'))
				.append(document.createTextNode(' '))
				.append($('<button>', { type: 'button', id: 'check-avatar-button' }).text(language.check))
				.append($('<br>'))
				.append($('<button>', { type: 'button', id: 'submit-avatar' }).text(language.applySetting))
				.append($('<br>'))
				.append(document.createTextNode(language.avatarFileInfo))
				.append($('<br>'));
			if (window.FormData === undefined) {
				$setAvatar.append(document.createTextNode(language.browserTooOldForAvatars));
			} else if (mainSettings.avatarUploadUrl) {
				$setAvatar.append(document.createTextNode(language.registerNickForAvatars));
			}
			$('#avatar-dialog').empty().append($currentAvatar, $setAvatar);
			$('#delete-avatar').click(disp.deleteAvatar);
			$('#submit-avatar').click(disp.submitAvatar);
			$('#check-avatar-button').click(disp.checkAvatarUrl);
			if (!settings.get('avatar')) {
				$('#letterAvatarExample').css('background-color', $$.nickColor(connection.chat.me.userRef.nick, true));
				$('#letterAvatarExampleContent').text(connection.chat.me.userRef.nick.charAt(0));
				$('#current-avatar-info').text(language.noAvatarSet);
				$('#current-avatar-image').attr('src', '/styles/img/noavatar.png');
				$('#current-letter-avatar').show();
				$('#delete-avatar').hide();
			} else {
				$('#current-avatar-info').text(language.currentAvatar);
				$('#current-avatar-image').attr('src', settings.get('avatar').replace('{size}', '100'));
				$('#current-avatar-image').attr('alt', language.currentAvatar);
				$('#current-letter-avatar').hide();
				$('#avatar-url').val(settings.get('avatar'));
				$('#delete-avatar').show();
			}
			$('#submit-avatar').hide();
		} else {
			$setAvatar = $('<div>', { id: 'set-avatar' })
				.append(document.createTextNode(`${language.selectAnImage} `))
				.append($('<input>', { type: 'file', name: 'avatarFileToUpload', id: 'avatarFileToUpload' }))
				.append($('<br>'))
				.append($('<button>', { type: 'submit', id: 'submit-avatar', name: 'submit' }).text(language.applySetting))
				.append($('<br>'))
				.append(document.createTextNode(`${language.youAcceptToStoreTheData}${mainSettings.networkName}.`));
			$('#avatar-dialog').empty().append($currentAvatar, $setAvatar);
			$('#delete-avatar').click(disp.deleteAvatar);
			$('#submit-avatar').click(disp.submitAvatar);
			if (!settings.get('avatar')) {
				$('#letterAvatarExample').css('background-color', $$.nickColor(connection.chat.me.userRef.nick, true));
				$('#letterAvatarExampleContent').text(connection.chat.me.userRef.nick.charAt(0));
				$('#current-avatar-info').text(language.avatarNotSet);
				$('#current-avatar-image').attr('src', '/styles/img/noavatar.png');
				$('#current-letter-avatar').show();
				$('#delete-avatar').hide();
			} else {
				$('#current-avatar-info').text(language.currentAvatar);
				$('#current-avatar-image').attr('src', settings.get('avatar'));
				$('#current-avatar-image').attr('alt', language.currentAvatar);
				$('#current-letter-avatar').hide();
				$('#avatar-url').val(settings.get('avatar'));
				$('#delete-avatar').show();
			}
			$('#submit-avatar').show();
		}
		disp.displaySpecialDialog('avatar-dialog', 'OK');
	},
	'checkAvatarUrl': function() {
		const url = $('#avatar-url').val();
		if (!url.startsWith('https://')) {
			uiDialogs.alert(language.addressMustStartWithHttps);
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
		if (!connection.chat.me.userRef.registered) {
			const url = $('#avatar-url').val();
			if (!url.startsWith('https://')) {
				uiDialogs.alert(language.addressMustStartWithHttps);
				return;
			}
			settings.set('avatar', url);
			disp.showAvatarSetting();
			disp.avatarChanged();
		} else {
			const fd = new FormData();
			const file = $('#avatarFileToUpload')[0].files[0];
			if (!file) {
				uiDialogs.alert(language.noFileSelected);
				return;
			}
			fd.append('fileToUpload', file);
			fd.append('image-type', 'avatar');
			$('#set-avatar').append(`<br>${  language.processing}`);
			commandBus.emit('chat:requestExtJwt', { service: mainSettings.extjwtService || '*', callback: function(jwt) {
				fd.append('jwt', jwt);
				$.ajax({
					url: mainSettings.avatarUploadUrl,
					dataType: 'json',
					method: 'post',
					processData: false,
					contentType: false,
					data: fd,
					success: function(data) {
						if (data['result'] == 'ok') {
							settings.set('avatar', data['url']);
							disp.showAvatarSetting();
							disp.avatarChanged();
						} else {
							uiDialogs.alert(language.failedToSendImageWithResponse + data['result']); // TODO parse the result
						}
					},
					error: function() {
						uiDialogs.alert(language.failedToSendImage);
					}
				});
			}});
		}
	},
	'deleteAvatar': function() {
		if (!connection.chat.me.userRef.registered) {
			if (!confirm(`${language.areYouSureToDeleteAvatar  }"${  settings.get('avatar')  }"?`)) {
				return;
			}
			settings.set('avatar', null);
			disp.showAvatarSetting();
			disp.avatarChanged();
		} else {
			if (!confirm(language.deleteAvatarQ)) {
				return;
			}
			commandBus.emit('chat:requestExtJwt', { service: mainSettings.extjwtService || '*', callback: function(jwt) {
				$.ajax({
					url: mainSettings.avatarDeleteUrl,
					dataType: 'json',
					method: 'post',
					data: {
						'image-type': 'avatar',
						'jwt': jwt
					},
					success: function(data) {
						if (data['result'] == 'ok') {
							settings.set('avatar', null);
							disp.showAvatarSetting();
							disp.avatarChanged();
						} else {
							uiDialogs.alert(language.failedToDeleteImageWithResponse + data['result']); // TODO parse the result
						}
					},
					error: function() {
						uiDialogs.alert(language.failedToDeleteImage);
					}
				});
			}});
		}
	},
	'avatarChanged': function() {
		disp.changeSettings();
		if (settings.get('avatar')) {
			commandBus.emit('chat:requestMetadataUpdate', { key: 'avatar', value: settings.get('avatar') }); // Emit chat event
		} else {
			commandBus.emit('chat:requestMetadataUpdate', { key: 'avatar', value: null }); // Emit chat event to clear
		}
	},
	'getAvatarIcon': function(nick, isRegistered) {
		const avatar = uiHelpers.getAvatarUrl(nick, 50);
		if (avatar) return avatar;
		if (isRegistered) return icons[6];
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
		const channel = uiTabs.findChannel(uiState.active);
		if (!channel) {
			return;
		}
		let topic = $(`#${  channel.id  }-topic > h2`).html();
		if (topic == '') {
			topic = language.topicIsNotSet;
		}
		const html = `${topic
		}<p class="${  channel.id  }-operActions" style="display:none;">` +
				`<b>${  language.changeChannelTopic  }</b><textarea name="topicEdit" id="topicEdit">${  he(channel.topic)  }</textarea>` + // escaped channel.topic
				`<button id="topic-change-button-${  channel.id  }">${  language.changeTopicSubmit  }</button><br>${
					language.youCanCopyCodesToTopic
				}</p>`;
		uiDialogs.closeDialog('confirm', 'topic');
		uiDialogs.displayDialog('confirm', 'topic', language.topicOfChannel + channel.name, html);
		$(`#topic-change-button-${  channel.id}`).click(() => {
			commandBus.emit('chat:setTopic', { channel: channel.name, newTopic: $('#topicEdit').val() });
		});
	},
	'playSound': function() {
		if ( ! settings.get('newMsgSound')) {
			return;
		}
		const filename = '/styles/audio/served';
		$('#sound').html(`<audio autoplay="autoplay"><source src="${  filename  }.mp3" type="audio/mpeg" /><source src="${  filename  }.ogg" type="audio/ogg" /><embed hidden="true" autostart="true" loop="false" src="${  filename  }.mp3" /></audio>`);
	},

	'showAllEmoticons': function() {
		uiDialogs.closeDialog('emoticons', 'allEmoticons');
		const $container = $('<div class="emojiSelector">');
		uiDialogs.displayDialog('emoticons', 'allEmoticons', language.allEmoticons, $container);
		setTimeout(() => {
			const data = emoji.getAll();
			let html = '';
			for (const item of data) {
				if (canRenderEmojiInColor(item.text)) {
					html += `<a class="charSelect" onclick="uiHelpers.insertEmoji('${item.text}')"><span class="emoji-wrapper">${item.text}</span></a> `;
				} else {
					html += `<a class="charSelect" onclick="uiHelpers.insertEmoji('${item.text}')"><img src="/styles/emoji/${item.code}.png" class="emoji emoji-wrapper" loading="lazy" alt="${item.text}"></a> `;
				}
			}
			$container.html(html);
		}, 0);
	},
	'updateEventVisibility': function() {
		// Hide or show event messages based on showPartQuit setting
		const hideEvents = settings.get('showPartQuit');
		const groupEnabled = settings.get('groupEvents');

		$('.event-message').each((i, el) => {
			const $el = $(el);
			const isInGroup = $el.hasClass('grouped-event');

			if (hideEvents) {
				$el.hide();
			} else if (isInGroup) {
				// Keep grouped events hidden, they're shown via expand
				$el.hide();
			} else {
				$el.show();
			}
		});

		// Also hide/show group summaries
		$('.event-group-summary').each((i, el) => {
			if (hideEvents) {
				$(el).hide();
			} else {
				$(el).show();
			}
		});
	},
	'extendEventGroup': function($summary, newEvents) {
		const groupId = $summary.data('group-id');
		if (!groupId) return;

		const isExpanded = $(`#hide-${  groupId}`).is(':visible');

		const oldEvents = [];
		$(`.grouped-event[data-group-id="${  groupId  }"]`).each((i, el) => {
			oldEvents.push($(el));
		});

		const allEvents = oldEvents.concat(newEvents);

		// Clean up old group
		$summary.remove();
		oldEvents.forEach(($el) => {
			$el.removeClass('grouped-event').removeAttr('data-group-id');
		});

		// Create a new group with all events
		disp.createEventGroup(allEvents);

		// Restore expanded state if needed
		const newGroupId = allEvents[0].attr('data-group-id');
		if (isExpanded && newGroupId) {
			disp.expandEventGroup(newGroupId);
		}
	},
	'groupEvents': function(container) {
		// Group consecutive event messages (>2) into a collapsible summary
		if (settings.get('showPartQuit')) return; // Don't group when hiding all events
		if (!settings.get('groupEvents')) return; // Grouping disabled

		const $container = $(container);
		const $messages = $container.children('.messageDiv:not(.msgRepeat)');
		let consecutiveEvents = [];

		function flushEvents() {
			if (consecutiveEvents.length > 0) {
				let prevEl = consecutiveEvents[0].prev();
				// Skip channel-join-info elements (joinOwn, topic, mode, etc.) when looking for existing group
				while (prevEl.length && prevEl.hasClass('channel-join-info')) {
					prevEl = prevEl.prev();
				}
				if (prevEl.hasClass('grouped-event')) {
					const groupId = prevEl.attr('data-group-id');
					if (groupId) {
						const summary = $(`.event-group-summary[data-group-id="${  groupId  }"]`);
						if (summary.length > 0) {
							disp.extendEventGroup(summary, consecutiveEvents);
						}
					}
				} else if (prevEl.hasClass('event-group-summary')) {
					disp.extendEventGroup(prevEl, consecutiveEvents);
				} else if (consecutiveEvents.length > 2) {
					disp.createEventGroup(consecutiveEvents);
				}
			}
			consecutiveEvents = [];
		}

		$messages.each((i, el) => {
			const $this = $(el);
			const isEvent = $this.hasClass('event-message');

			if (isEvent && !$this.hasClass('grouped-event')) {
				consecutiveEvents.push($this);
			} else if ($this.hasClass('channel-join-info')) {
				// Transparent: channel join info (joinOwn, topic, mode, etc.) doesn't break the event chain
			} else { // Not an event, or a summary, or already grouped
				flushEvents();
			}
		});

		// After the loop, handle any trailing events
		flushEvents();

		// Merge adjacent event groups (no non-event content between them)
		let mergedAny = true;
		while (mergedAny) {
			mergedAny = false;
			$container.children('.event-group-summary').each((i, el) => {
				const $summary = $(el);
				const groupId = $summary.data('group-id');
				if (!groupId) return;
				const $lastEvent = $container.children(`.grouped-event[data-group-id="${  groupId  }"]`).last();
				if (!$lastEvent.length) return;
				// Find next non-transparent sibling
				let $next = $lastEvent.next();
				while ($next.length && ($next.hasClass('channel-join-info') || $next.hasClass('msgRepeat'))) {
					$next = $next.next();
				}
				if ($next.length && $next.hasClass('event-group-summary')) {
					const nextGroupId = $next.data('group-id');
					if (!nextGroupId) return;
					const isNextExpanded = $(`#hide-${  nextGroupId}`).is(':visible');
					const $nextEvents = [];
					$container.children(`.grouped-event[data-group-id="${  nextGroupId  }"]`).each((i, el) => {
						$nextEvents.push($(el));
					});
					$next.remove();
					$nextEvents.forEach(($el) => {
						$el.removeClass('grouped-event').removeAttr('data-group-id');
					});
					disp.extendEventGroup($summary, $nextEvents);
					if (isNextExpanded) {
						const newGroupId = $nextEvents.length ? $nextEvents[0].attr('data-group-id') : null;
						if (newGroupId) disp.expandEventGroup(newGroupId);
					}
					mergedAny = true;
					return false; // restart scan after each merge
				}
			});
		}
	},
	'createEventGroup': function(events) {
		if (events.length <= 2) return;

		// Count event types
		const counts = { join: 0, part: 0, quit: 0, kick: 0, mode: 0, nick: 0 };
		events.forEach(($el) => {
			const type = $el.attr('data-event-type');
			if (type in counts) counts[type]++;
		});

		// Combine part and quit for "left" count
		const leftCount = counts.part + counts.quit;

		// Build summary text
		const summaryParts = [];
		if (counts.join > 0) {
			const label = counts.join === 1 ? language.usersJoined[0] : language.usersJoined[1];
			summaryParts.push(label.replace('%d', counts.join));
		}
		if (leftCount > 0) {
			const label = leftCount === 1 ? language.usersLeft[0] : language.usersLeft[1];
			summaryParts.push(label.replace('%d', leftCount));
		}
		if (counts.kick > 0) {
			const label = counts.kick === 1 ? language.usersKicked[0] : language.usersKicked[1];
			summaryParts.push(label.replace('%d', counts.kick));
		}
		if (counts.mode > 0) {
			const label = counts.mode === 1 ? language.modeChanges[0] : language.modeChanges[1];
			summaryParts.push(label.replace('%d', counts.mode));
		}
		if (counts.nick > 0) {
			const label = counts.nick === 1 ? language.nickChanges[0] : language.nickChanges[1];
			summaryParts.push(label.replace('%d', counts.nick));
		}

		const summaryText = summaryParts.join(', ');
		const groupId = `evtgrp-${  Math.random().toString(36).substr(2, 9)}`;

		// Create summary element
		const $summary = $(`<div class="messageDiv event-group-summary" data-group-id="${  groupId  }">` +
			`<span class="time">${  $$.niceTime()  }</span> &nbsp; ` +
			`<span class="mode"><span class="symbolFont">⋯</span> ${  summaryText  } ` +
			`<a href="javascript:void(0)" class="event-group-toggle" id="show-${  groupId  }" style="display:inline">[${  language.expand  }]</a>` +
			`<a href="javascript:void(0)" class="event-group-toggle" id="hide-${  groupId  }" style="display:none">[${  language.collapse  }]</a>` +
			'</span></div>');

		// Insert summary before first event in group
		events[0].before($summary);

		// Mark events as grouped and hide them
		events.forEach(($el) => {
			$el.addClass('grouped-event').attr('data-group-id', groupId).hide();
		});

		// Set up toggle handlers
		$(`#show-${  groupId}`).click(() => {
			disp.expandEventGroup(groupId);
		});
		$(`#hide-${  groupId}`).click(() => {
			disp.collapseEventGroup(groupId);
		});
	},
	'expandEventGroup': function(groupId) {
		const $groupedEvents = $(`.grouped-event[data-group-id="${  groupId  }"]`);
		$groupedEvents.show();
		$(`#show-${  groupId}`).hide();
		$(`#hide-${  groupId}`).show();

		// Auto-scroll if expanded events would be below the viewport
		const $chatWrapper = $('#chat-wrapper');
		const wrapperTop = $chatWrapper.offset().top;
		const wrapperVisibleBottom = wrapperTop + $chatWrapper.innerHeight();
		const eventBottom = $groupedEvents.last().offset().top + $groupedEvents.last().outerHeight();
		if (eventBottom > wrapperVisibleBottom) {
			// Scroll to make the last event visible
			$chatWrapper.scrollTop($chatWrapper.scrollTop() + (eventBottom - wrapperVisibleBottom));
		}
	},
	'collapseEventGroup': function(groupId) {
		$(`.grouped-event[data-group-id="${  groupId  }"]`).hide();
		$(`#show-${  groupId}`).show();
		$(`#hide-${  groupId}`).hide();
	},
	'ungroupAllEvents': function() {
		// Expand and remove all event groups
		$('.event-group-summary').each((i, el) => {
			const groupId = $(el).attr('data-group-id');
			$(`.grouped-event[data-group-id="${  groupId  }"]`).removeClass('grouped-event').removeAttr('data-group-id').show();
			$(el).remove();
		});
	},
	'regroupAllEvents': function() {
		// First ungroup, then regroup all windows
		disp.ungroupAllEvents();
		$('#main-window > span').each((i, el) => {
			disp.groupEvents(el);
		});
	}
};

/**
     * Formats channel modes for display when joining a channel.
     * @param {string} modeString - The mode string (e.g., "+nt")
     * @param {Array} modeParams - Optional parameters for modes that require them
     * @returns {string} Formatted mode description
     */
function formatChannelModes(modeString, modeParams) {
	if (!modeString) return '';

	let infoText = '';
	let plus = true;
	let paramIndex = 0;

	for (const ch of modeString) {

		if (ch === '+') {
			plus = true;
			continue;
		} else if (ch === '-') {
			plus = false;
			continue;
		}

		// Get mode description
		const modeInfo = getModeInfo(ch, 1); // 1 = joining channel display type
		let param = '';

		// Check if this mode takes a parameter (argBoth: always; argAdd: when setting)
		const paramModes = connection.chat.modes.argBoth.concat(connection.chat.modes.argAdd);
		if (paramModes.indexOf(ch) >= 0 && modeParams && paramIndex < modeParams.length) {
			param = ` ${  modeParams[paramIndex]}`;
			paramIndex++;
		}

		infoText = infoText.apList(modeInfo + param);
	}

	return infoText || language.none;
}

/**
     * Show/hide operator actions based on user's channel privileges
     * @param {Object} channel - The channel tab object
     * @param {number} ourMemberLevel - The privilege level of the current user (0-5)
     */
function updateOperActionsDisplay(channel, ourMemberLevel) {
	const chanId = channel.id;
	// Show operActions if user has halfop or higher (level >= 2)
	if (ourMemberLevel >= 2) {
		$(`#${  chanId  }-displayOperCss`).remove();
		const style = $(`<style id="${  chanId  }-displayOperCss">.${  chanId  }-operActions { display:block !important; }</style>`);
		$('html > head').append(style);
	} else {
		$(`#${  chanId  }-displayOperCss`).remove();
	}
}

// ==========================================
// UI STATE (moved from gateway object)
// ==========================================
const uiState = {
	statusWindow: new Status(),
	channels: [],
	queries: [],
	active: '--status',
	listWindow: null,
	disabledAvatarIds: {},
	completion: {
		string: '',
		rawStr: '',
		repeat: 0,
		array: [],
		lastPos: -1,
		find: function(string, rawStr, comPos) {
			const complarr = [];
			let ccount = 0;
			if (string.length > 0 && string.indexOf('/') == 0 && comPos == 0) {
				for (const i of Object.keys(commands)) {
					if (i.indexOf(string.slice(1).toLowerCase()) == 0) {
						complarr[ccount] = `/${  i}`;
						ccount++;
					}
				}
			} else {
				if (string.indexOf('#') == 0) {
					for (const channel of uiState.channels) {
						if (channel.name.toLowerCase().replace(/^[^a-z0-9]/ig, '').indexOf(string.toLowerCase().replace(/^[^a-z0-9]/ig, '')) == 0) {
							complarr[ccount] = channel.name;
							ccount++;
						}
					}
				} else {
					const chan = uiTabs.findChannel(uiState.active);
					if (chan) {
						const cml = connection.chat.users.getChannelMemberList(chan.name);
						const members = cml ? cml.getAllMembers() : [];
						for (const member of members) {
							if (member.user.nick.toLowerCase().replace(/^[^a-z0-9]/ig, '').indexOf(string.toLowerCase().replace(/^[^a-z0-9]/ig, '')) == 0) {
								complarr[ccount] = member.user.nick;
								if (comPos == 0) {
									complarr[ccount] += ':';
								}
								ccount++;
							}
						}
					}
				}
			}
			return complarr;
		}
	},
	commandHistory: [],
	commandHistoryPos: -1,
	nickListVisibility: true,
	lastKeypressWindow: '',
	keypressSuppress: '',
	displayOwnWhois: false,
	tabHistory: ['--status']
};

// ==========================================
// PUBLIC UI HELPER FUNCTIONS
// ==========================================

const uiHelpers = {
	// Insert text into the input field
	insert: function(text) {
		const input = $('#input');
		const oldText = input.val();
		input.focus();
		input.val(oldText + text);
	},

	// Insert emoji and update recent emoji list
	insertEmoji: function(e) {
		uiHelpers.insert(e);
		const index = emoji.selectable.indexOf(e);
		if (index >= 0) {
			emoji.selectable.splice(index, 1);
			$(`#emoticon-symbols span:nth-child(${  index + 1  })`).remove();
		}
		emoji.selectable.unshift(e);
		if (emoji.selectable.length > 80) {
			emoji.selectable.splice(-1);
			$('#emoticon-symbols span:last').remove();
		}
		$('#emoticon-symbols').prepend(makeEmojiSelector(e));
		saveSelectableEmoji();
	},

	// Insert IRC color code
	insertColor: function(color) {
		uiHelpers.insert(String.fromCharCode(3) + (color < 10 ? '0' : '') + color.toString());
	},

	// Insert IRC formatting code
	insertCode: function(code) {
		let text = false;
		switch (code) {
			case 2: text = String.fromCharCode(2); break; // Bold
			case 3: text = String.fromCharCode(3); break; // Color
			case 15: text = String.fromCharCode(15); break; // Reset
			case 22: text = String.fromCharCode(22); break; // Reverse
			case 29: text = String.fromCharCode(29); break; // Italic
			case 31: text = String.fromCharCode(31); break; // Underline
		}
		if (text) uiHelpers.insert(text);
	},

	// Toggle formatting panel visibility
	toggleFormatting: function() {
		if ($('#formatting').is(':visible')) {
			$('#formatting').hide();
			$('#formatting-button').text(language.insertFormatCodes);
		} else {
			$('#formatting').show();
			$('#formatting-button').text(`⮙ ${  language.hideFormatting  } ⮙`);
		}
	},

	// Focus the input field if no text is selected
	inputFocus: function() {
		if (window.getSelection().toString() == '') {
			$('#input').focus();
		}
	},

	// Perform tab completion
	doComplete: function() {
		let str;
		if (uiState.completion.repeat == 0 || uiState.completion.array.length == 0) {
			const rawstr = $('#input').val().replace(/^\s+/g, '').replace(/\s+$/g, '');
			str = $('#input').val().replace(/^\s+/g, '').replace(/\s+$/g, '').split(/\s+/);
			if (str && str.length > 0 && str[str.length - 1].length > 0) {
				uiState.completion.array = uiState.completion.find(str[str.length - 1], rawstr, str.length - 1);
				if (uiState.completion.array.length > 0) {
					str[str.length - 1] = `${uiState.completion.array[0]  } `;
					uiState.completion.repeat = 1;
					$('#input').val(str.join(' '));
					uiState.completion.lastPos = 0;
				}
			}
		} else if (uiState.completion.array.length > 0) {
			str = $('#input').val().replace(/^\s+/g, '').replace(/\s+$/g, '').split(/\s+/);
			if (uiState.completion.lastPos + 1 < uiState.completion.array.length) {
				str[str.length - 1] = `${uiState.completion.array[uiState.completion.lastPos + 1]  } `;
				uiState.completion.lastPos++;
				$('#input').val(str.join(' '));
			} else {
				uiState.completion.lastPos = 0;
				str[str.length - 1] = `${uiState.completion.array[0]  } `;
				$('#input').val(str.join(' '));
			}
		}
	},

	// Get user avatar or letter avatar HTML
	getMeta: function(nick, size) {
		const avatar = uiHelpers.getAvatarUrl(nick, size);
		let meta;
		if (avatar) {
			meta = `<img src="${  he(avatar)  }" alt="${  he(nick)  }" onerror="this.src='/styles/img/noavatar.png';">`;
		} else {
			const user = connection.chat.users.getUser(nick);
			if (!user.metadata) user.metadata = {};
			let dispNick;
			if ('display-name' in user.metadata) {
				dispNick = he(user.metadata['display-name']);
			} else {
				dispNick = he(nick);
			}
			meta = `<span class="avatar letterAvatar" style="background-color:${  $$.nickColor(nick, true)  };"><span role="presentation">${  dispNick.charAt(0)  }</span></span>`;
		}
		return meta;
	},

	// Get avatar URL for a user (from metadata or IRCCloud)
	getAvatarUrl: function(nick, size) {
		if (!size) size = 200;
		const user = connection.chat.users.getUser(nick);
		if (uiState.disabledAvatarIds && uiState.disabledAvatarIds[user.id]) return false;
		let avatar = false;
		if ('avatar' in user.metadata) {
			avatar = user.metadata['avatar'].replace('{size}', size.toString());
		}
		if (!avatar) {
			const expr = /^~?[su]id([0-9]+)$/;
			const avmatch = expr.exec(user.ident);
			if (avmatch) {
				const irccloudUrl = `https://static.irccloud-cdn.com/avatar-redirect/s${  size.toString()  }/${  avmatch[1]}`;
				avatar = irccloudUrl;
			}
		}
		return avatar;
	},

	// Extract msgid from IRC tags
	getMsgid: function(tags) {
		return (tags && tags.msgid) ? tags.msgid : '';
	},

	// Calculate optimal history limit based on window height
	calculateHistoryLimit: function() {
		const chatWrapper = $('#chat-wrapper');
		if (!chatWrapper.length) {
			return 20; // Fallback to conservative default if wrapper not found
		}

		const availableHeight = chatWrapper.innerHeight();
		if (!availableHeight || availableHeight < 100) {
			return 20; // Fallback if height seems wrong
		}

		let activeWindow = null;
		if (uiState.active) {
			const activeTab = uiTabs.find(uiState.active);
			if (activeTab) {
				activeWindow = $(`#${  activeTab.id  }-window`);
			}
		}

		if (!activeWindow || !activeWindow.length) {
			activeWindow = chatWrapper.find('span[id$="-window"]').filter((i, el) => $(el).find('.messageDiv').length > 0).first();
		}

		let avgMessageHeight = 80; // Default estimate in pixels
		let measuredMessages = 0;

		// Try to measure from active/found window
		if (activeWindow && activeWindow.length) {
			const messages = activeWindow.find('.messageDiv').slice(0, 10);
			if (messages.length > 0) {
				const heights = [];
				messages.each((i, el) => {
					let h = $(el).outerHeight(true);
					// Non-chat messages (joins, parts, mode changes, topic, etc.) have no avatar
					// and are ~half the height of regular chat messages; double their height
					// to get a correct estimate of how many real messages fit in the viewport.
					if (!$(el).hasClass('msgNormal') && !$(el).hasClass('msgRepeat')) h *= 2;
					heights.push(h);
				});
				if (heights.length > 0) {
					const sum = heights.reduce((a, b) => { return a + b; }, 0);
					avgMessageHeight = sum / heights.length;
					measuredMessages = heights.length;
				}
			}
		}

		// If we couldn't get enough measurements, try Status window
		if (measuredMessages < 3 && uiState.statusWindow) {
			const statusWindow = $(`#${  uiState.statusWindow.id  }-window`);
			if (statusWindow && statusWindow.length) {
				const messages = statusWindow.find('.messageDiv').filter(':visible').slice(0, 10);
				if (messages.length >= 3) {
					const heights = [];
					messages.each((i, el) => {
						let h = $(el).outerHeight(true);
						if (h > 15) {
							if (!$(el).hasClass('msgNormal') && !$(el).hasClass('msgRepeat')) h *= 2;
							heights.push(h);
						}
					});
					if (heights.length >= 3) {
						const sum = heights.reduce((a, b) => { return a + b; }, 0);
						avgMessageHeight = sum / heights.length;
						measuredMessages = heights.length;
					}
				}
			}
		}

		const estimatedCount = Math.floor(availableHeight / avgMessageHeight);
		return Math.max(10, Math.min(estimatedCount, 200));
	},

	// Get formatted user mode string
	getUmodeString: function() {
		let modeString = '';
		if (connection.chat.me.umodes) {
			for (const [mode, active] of Object.entries(connection.chat.me.umodes)) {
				if (active) modeString += mode;
			}
		}
		if (!modeString) modeString = language.none;
		return modeString;
	}
};

// ==========================================
// PUBLIC UI TAB MANAGEMENT FUNCTIONS
// ==========================================

const uiTabs = {
	// Switch to the next tab
	nextTab: function() {
		const swtab = $('li.activeWindow').next().find('a.switchTab');
		if (swtab) {
			swtab.trigger('click');
		}
	},

	// Switch to the previous tab
	prevTab: function() {
		const swtab = $('li.activeWindow').prev().find('a.switchTab');
		if (swtab) {
			swtab.trigger('click');
		}
	},

	// Switch to a specific tab by name
	switchTab: function(chan) {
		const act = uiTabs.getActive();
		if (act) {
			act.saveScroll();
			act.setMark();
		} else if (uiState.listWindow && uiState.active == uiState.listWindow.name) {
			uiState.listWindow.saveScroll();
			uiState.listWindow.setMark();
		} else {
			uiState.statusWindow.saveScroll();
			uiState.statusWindow.setMark();
		}
		chan = chan.toLowerCase();
		let newActiveTabName = '';
		let id;

		if (chan != '--status' && uiTabs.findChannel(chan)) {
			id = uiTabs.findChannel(chan).id;
			$('#main-window > span').hide();
			$('#tab-info > span').hide();
			$('#nicklist-main > span').hide();
			$('#chstats > div').hide();
			$('#info > span').hide();
			$(`#${  id  }-nicklist`).show();
			$('#tabs > li').removeClass('activeWindow');
			$(`#${  id  }-tab`).addClass('activeWindow');
			$(`#${  id  }-window`).show();
			$(`#${  id  }-chstats`).show();
			$(`#${  id  }-topic`).show();
			$(`#${  id  }-tab-info`).show();
			$(`#${  id  }-topic`).prop('title', language.clickForWholeTopic);

			uiTabs.findChannel(chan).markRead();
			newActiveTabName = chan;
			$('#input').focus();
			$('#right-col').show();
			uiTabs.findChannel(chan).restoreScroll();
			setTimeout(() => {
				uiTabs.findChannel(chan).restoreScroll();
			}, 200);
			disp.groupEvents(`#${  id  }-window`);
		} else if (chan != '--status' && uiTabs.findQuery(chan)) {
			id = uiTabs.findQuery(chan).id;
			$('#main-window > span').hide();
			$('#tab-info > span').hide();
			$('#nicklist-main > span').hide();
			$('#info > span').hide();
			$('#chstats > div').hide();
			$('#--status-nicklist').show();
			$('#tabs > li').removeClass('activeWindow');
			$(`#${  id  }-tab`).addClass('activeWindow');
			$(`#${  id  }-window`).show();
			$(`#${  id  }-topic`).show();
			$(`#${  id  }-chstats`).show();
			$(`#${  id  }-tab-info`).show();
			$(`#${  id  }-topic`).prop('title', '');
			newActiveTabName = chan;
			$('#input').focus();
			$('#right-col').hide();
			uiTabs.findQuery(chan).restoreScroll();
			setTimeout(() => {
				uiTabs.findQuery(chan).restoreScroll();
			}, 200);
			uiTabs.findQuery(chan).markRead();
		} else if (uiState.listWindow && chan == uiState.listWindow.name) {
			id = uiState.listWindow.id;
			$('#main-window > span').hide();
			$('#tab-info > span').hide();
			$('#nicklist-main > span').hide();
			$('#info > span').hide();
			$('#chstats > div').hide();
			$('#--status-nicklist').show();
			$('#tabs > li').removeClass('activeWindow');
			$(`#${  id  }-tab`).addClass('activeWindow');
			$(`#${  id  }-window`).show();
			$(`#${  id  }-topic`).show();
			$(`#${  id  }-chstats`).show();
			$(`#${  id  }-tab-info`).show();
			uiState.listWindow.markRead();
			newActiveTabName = chan;
			$('#input').focus();
			$('#right-col').hide();
			uiState.listWindow.restoreScroll();
		} else if (chan == '--status') {
			$('#main-window > span').hide();
			$('#tab-info > span').hide();
			$('#nicklist-main > span').hide();
			$('#info > span').hide();
			$('#chstats > div').hide();
			$('#--status-nicklist').show();
			$('#tabs > li').removeClass('activeWindow');
			$('#--status-tab').addClass('activeWindow');
			$('#--status-window').show();
			$('#--status-topic').show();
			$('#--status-chstats').show();
			uiState.statusWindow.markRead();
			newActiveTabName = chan;
			$('#input').focus();
			$('#right-col').hide();
			uiState.statusWindow.restoreScroll();
			setTimeout(() => {
				uiState.statusWindow.restoreScroll();
			}, 200);
		}
		commandBus.emit('chat:tabSwitched', { oldTab: uiState.active, newTab: newActiveTabName });
		uiState.active = newActiveTabName; // Update active tab after chat event
		uiState.tabHistory.push(newActiveTabName); // Update UI tab history
		uiNicklist.checkNickListVisibility();

		// Scroll the active tab into view in the tab bar
		const $activeTab = $('li.activeWindow');
		if ($activeTab.length) {
			const wrapper = document.getElementById('tab-wrapper');
			const wrapperRect = wrapper.getBoundingClientRect();
			const tabRect = $activeTab[0].getBoundingClientRect();
			const tabLeft = tabRect.left - wrapperRect.left + wrapper.scrollLeft;
			const tabRight = tabRect.right - wrapperRect.left + wrapper.scrollLeft;
			if (tabLeft < wrapper.scrollLeft) {
				wrapper.scrollLeft = Math.max(0, tabLeft - 10);
			} else if (tabRight > wrapper.scrollLeft + wrapper.offsetWidth) {
				wrapper.scrollLeft = tabRight - wrapper.offsetWidth + 10;
			}
		}
	},

	// Get the active tab object (returns false for status window)
	getActive: function() {
		if (uiState.active == '--status') {
			return false;
		} else if (uiTabs.findChannel(uiState.active)) {
			return uiTabs.findChannel(uiState.active);
		} else if (uiTabs.findQuery(uiState.active)) {
			return uiTabs.findQuery(uiState.active);
		} else if (uiState.listWindow && uiState.active == uiState.listWindow.name) {
			return false;
		} else {
			return false;
		}
	},

	// Get the last tab from history, ignoring specified tab
	tabHistoryLast: function(ignore) {
		const ignorec = ignore.toLowerCase();
		for (let i = uiState.tabHistory.length; i > 0; i--) {
			const tabName = uiState.tabHistory[i];
			if (tabName && (!ignorec || ignorec != tabName)) {
				if (uiTabs.findChannel(tabName) || uiTabs.findQuery(tabName) || (uiState.listWindow && tabName == uiState.listWindow.name)) {
					return tabName;
				}
			}
		}
		return '--status';
	},

	// Lookup channel tab by name
	findChannel: function(name) {
		if (typeof(name) != 'string') return false;
		for (const chan of uiState.channels) {
			if (chan.name.toLowerCase() == name.toLowerCase()) {
				return chan;
			}
		}
		return false;
	},

	// Lookup query tab by name
	findQuery: function(name) {
		if (typeof(name) != 'string') return false;
		for (const query of uiState.queries) {
			if (query && query.name.toLowerCase() == name.toLowerCase()) {
				return query;
			}
		}
		return false;
	},

	// Combined lookup for channel or query by name
	find: function(name) {
		if (!name || name == '') {
			return false;
		}
		if (name.charAt(0) == '#') {
			return uiTabs.findChannel(name);
		} else {
			return uiTabs.findQuery(name);
		}
	},

	// UI-level channel removal
	removeChannel: function(name) {
		if (typeof(name) != 'string') return false;
		const channels2 = [];
		for (const chan of uiState.channels) {
			if (chan && chan.name.toLowerCase() == name.toLowerCase()) {
				uiTabs.findChannel(name).markRead();
				chan.close();
			} else if (chan) {
				channels2.push(chan);
			}
		}
		uiState.channels = channels2;
		$('#input').focus();
		return false;
	},

	// UI-level query removal
	removeQuery: function(name) {
		if (typeof(name) != 'string') return false;
		const queries2 = [];
		for (const query of uiState.queries) {
			if (query && query.name.toLowerCase() == name.toLowerCase()) {
				uiTabs.findQuery(name).markRead();
			} else if (query) {
				queries2.push(query);
			}
		}
		uiState.queries = queries2;
		$('#input').focus();
		return false;
	},

	// Sort channel tabs alphabetically
	sortChannelTabs: function() {
		if (settings.get('sortChannelsByJoinOrder')) {
			return;
		}
		uiState.channels.sort((a, b) => {
			return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
		});
		let lastTab = $('#--status-tab');
		for (const chan of uiState.channels) {
			const tab = $(`#${  chan.id  }-tab`);
			if (tab.length) {
				tab.detach().insertAfter(lastTab);
				lastTab = tab;
			}
		}
	}
};

// ==========================================
// PUBLIC UI NICKLIST FUNCTIONS
// ==========================================

const uiNicklist = {
	// Toggle nicklist visibility
	nickListToggle: function() {
		let active = uiTabs.getActive();
		if (!active) {
			active = uiState.statusWindow;
		}
		active.saveScroll();
		if ($('#right-col').width() > 40) {
			$('#nicklist').hide();
			$('#chstats').hide();
			$('#nickopts').css('display', 'none');
			$('#chlist').css('display', 'none');
			$('#right-col').removeClass('mobile-nicklist-open').css('overflow', 'hidden').animate({
				'width': '40px'
			}, 400, () => {
				$('#nicklist-closed').fadeIn(200);
				setTimeout(() => {
					uiTabs.getActive().restoreScroll();
				}, 250);
			});
			uiState.nickListVisibility = false;
		} else {
			uiNicklist.showNickList();
			uiState.nickListVisibility = true;
		}
		uiNicklist.checkNickListVisibility();
		$('#input').focus();
	},

	// Check if nicklist is visible and show it if needed
	checkNickListVisibility: function() {
		setTimeout(() => {
			if ($('#right-col').is(':visible') && !$('#nicklist-closed').is(':visible') && !$('#nicklist').is(':visible')) {
				if (uiState.nickListVisibility === false) {
					// Nicklist intentionally collapsed — just show the toggle button
					$('#nicklist-closed').show();
				} else {
					uiNicklist.showNickList();
				}
			}
		}, 1500);
	},

	// Show the nicklist panel
	showNickList: function() {
		const targetWidth = window.matchMedia('(max-width: 767px)').matches ? '70%' : '23%';
		$('#nicklist-closed').fadeOut(200, () => {
			$('#nicklist').show();
			$('#chstats').show();
			if (window.matchMedia('(max-width: 767px)').matches) {
				$('#right-col').addClass('mobile-nicklist-open');
			}
			$('#right-col').animate({
				'width': targetWidth
			}, 400, () => {
				$('#right-col').css('overflow', 'visible'); // explicit override of mobile CSS
			});
			setTimeout(() => {
				let tab = uiTabs.getActive();
				if (!tab) {
					tab = uiState.statusWindow;
				}
				tab.restoreScroll();
				$('#nickopts').css('display', '');
				$('#chlist').css('display', '');
			}, 450);
		});
	},

	// Toggle nick options menu
	toggleNickOpt: function(nicklistid) {
		if ($(`#${  nicklistid  }-opt`).is(':visible')) {
			if ($(`#${  nicklistid  }-opt-info`).is(':visible')) {
				$(`#${  nicklistid  }-opt-info`).hide('blind', {
					direction: 'vertical'
				}, 300);
				$(`#${  nicklistid  }-opt`).removeClass('activeInfo');
			}
			$(`#${  nicklistid  }-opt`).hide('blind', {
				direction: 'vertical'
			}, 300);
			$(`#${  nicklistid}`).removeClass('activeNick');
		} else {
			$(`#${  nicklistid  }-opt`).show('blind', {
				direction: 'vertical'
			}, 300);
			$(`#${  nicklistid}`).addClass('activeNick');
		}
	},

	// Toggle nick options info section
	toggleNickOptInfo: function(nicklistid) {
		if ($(`#${  nicklistid  }-opt-info`).is(':visible')) {
			$(`#${  nicklistid  }-opt-info`).hide('blind', {
				direction: 'vertical'
			}, 300);
			$(`#${  nicklistid  }-opt`).removeClass('activeInfo');
		} else {
			$(`#${  nicklistid  }-opt-info`).show('blind', {
				direction: 'vertical'
			}, 300);
			$(`#${  nicklistid  }-opt`).addClass('activeInfo');
		}
	},

	// Toggle nick options admin section
	toggleNickOptAdmin: function(nicklistid) {
		if ($(`#${  nicklistid  }-opt-admin`).is(':visible')) {
			$(`#${  nicklistid  }-opt-admin`).hide('blind', {
				direction: 'vertical'
			}, 300);
			$(`#${  nicklistid  }-opt`).removeClass('activeAdmin');
		} else {
			$(`#${  nicklistid  }-opt-admin`).show('blind', {
				direction: 'vertical'
			}, 300);
			$(`#${  nicklistid  }-opt`).addClass('activeAdmin');
		}
	},

	// Toggle channel operator actions menu
	toggleChannelOperOpts: function(channel) {
		const $element = $(`#${  uiTabs.findChannel(channel).id  }-operActions ul`);
		if ($element.is(':visible')) {
			$element.hide('blind', {
				direction: 'vertical'
			}, 300);
			$(`#${  uiTabs.findChannel(channel).id  }-operActions .chstats-button`).removeClass('channelAdminActive');
		} else {
			if (getConnectionStatus() !== 'connected') return;
			$element.show('blind', {
				direction: 'vertical'
			}, 300);
			$(`#${  uiTabs.findChannel(channel).id  }-operActions .chstats-button`).addClass('channelAdminActive');
		}
	},

	// Toggle channel options menu
	toggleChannelOpts: function(channel) {
		const $element = $(`#${  uiTabs.findChannel(channel).id  }-channelOptions ul`);
		if ($element.is(':visible')) {
			$element.hide('blind', {
				direction: 'vertical'
			}, 300);
			$(`#${  uiTabs.findChannel(channel).id  }-chstats .chstats-button`).removeClass('channelAdminActive');
		} else {
			if (getConnectionStatus() !== 'connected') return;
			$element.show('blind', {
				direction: 'vertical'
			}, 300);
			$(`#${  uiTabs.findChannel(channel).id  }-chstats .chstats-button`).addClass('channelAdminActive');
		}
	},

	// Toggle global nick options panel
	toggleNickOpts: function() {
		const $element = $('#nickOptions');
		if ($element.is(':visible')) {
			$element.hide('blind', {
				direction: 'down'
			}, 300);
			$('#nickopts .nickoptsButton').removeClass('channelAdminActive');
		} else {
			if (getConnectionStatus() !== 'connected') return;
			$element.show('blind', {
				direction: 'down'
			}, 300);
			$('#nickopts .nickoptsButton').addClass('channelAdminActive');
		}
	}
};

// ==========================================
// PUBLIC UI INPUT/COMMAND FUNCTIONS
// ==========================================

const uiInput = {
	// Display "not enough parameters" error message
	notEnoughParams: function(command, reason) {
		if (uiTabs.getActive()) {
			uiTabs.getActive().appendMessage(language.messagePatterns.notEnoughParams, [$$.niceTime(), he(command), reason]);
		} else {
			uiState.statusWindow.appendMessage(language.messagePatterns.notEnoughParams, [$$.niceTime(), he(command), reason]);
		}
	},

	// Parse and execute a user command (starts with /)
	parseUserCommand: function(input) {
		command = input.slice(1).split(' ');
		if (!uiInput.callCommand(command, input)) {
			if (uiTabs.getActive()) {
				uiTabs.getActive().appendMessage(language.messagePatterns.noSuchCommand, [$$.niceTime(), he(command[0])]);
			} else {
				uiState.statusWindow.appendMessage(language.messagePatterns.noSuchCommand, [$$.niceTime(), he(command[0])]);
			}
		}
	},

	// Parse and send a user message
	parseUserMessage: function(input) {
		const active = uiTabs.getActive();
		if (active) {
			let textToSend = input;
			if (lengthInUtf8Bytes(textToSend) >= 420) {
				const button = [ {
					text: language.yes,
					click: function() {
						do {
							let sendNow = '';
							while (lengthInUtf8Bytes(sendNow) < 420 && textToSend.length > 0) {
								sendNow += textToSend.charAt(0);
								textToSend = textToSend.substring(1);
							}
							commandBus.emit('chat:requestSendMessage', { target: active.name, message: sendNow, time: new Date() });
						} while (textToSend != '');
						$(this).dialog('close');
					}
				}, {
					text: language.no,
					click: function() {
						$(this).dialog('close');
					}
				} ];
				const html = `${language.textTooLongForSingleLine  }<br><br><strong>${  $$.sescape(input)  }</strong>`;
				uiDialogs.displayDialog('confirm', 'command', language.confirm, html, button);
			} else {
				commandBus.emit('chat:requestSendMessage', { target: active.name, message: input, time: new Date() });
			}
		}
	},

	// Parse user input (command or message)
	parseUserInput: function(input) {
		if (!input) {
			input = '';
		}
		if (settings.get('sendEmoji')) {
			input = $$.textToEmoji(input);
		}
		if (!input) {
			return;
		}
		// Connection status check should come from chat
		commandBus.emit('chat:checkConnectionStatus', { callback: function(connected) {
			if (!connected) {
				if (uiTabs.getActive()) {
					uiTabs.getActive().appendMessage(language.messagePatterns.notConnected, [$$.niceTime()]);
				} else {
					uiState.statusWindow.appendMessage(language.messagePatterns.notConnected, [$$.niceTime()]);
				}
				return;
			}

			let regexp = /^\s+(\/.*)$/;
			let match = regexp.exec(input);
			if (match) {
				const button = [ {
					text: language.sendMessage,
					click: function() {
						uiInput.parseUserMessage(input);
						$(this).dialog('close');
					}
				}, {
					text: language.runCommand,
					click: function() {
						uiInput.parseUserCommand(match[1]);
						$(this).dialog('close');
					}
				}, {
					text: language.cancel,
					click: function() {
						$(this).dialog('close');
					}
				} ];
				const html = `${language.textStartsWithSpaceAndSlash  }<br><br><strong>${  $$.sescape(input)  }</strong>`;
				uiDialogs.displayDialog('confirm', 'command', language.confirm, html, button);
			} else {
				regexp = /^(#[^ ,]{1,25})$/;
				match = regexp.exec(input);
				if (match) {
					const button = [ {
						text: language.sendMessage,
						click: function() {
							uiInput.parseUserMessage(input);
							$(this).dialog('close');
						}
					}, {
						text: language.joinTo + input,
						click: function() {
							commandBus.emit('chat:requestJoinChannel', { channelName: input, time: new Date() });
							$(this).dialog('close');
						}
					}, {
						text: language.cancel,
						click: function() {
							$(this).dialog('close');
						}
					} ];
					const html = `${language.messageStartsWithHash  }<br><br><strong>${  $$.sescape(input)  }</string>`;
					uiDialogs.displayDialog('confirm', 'command', language.confirm, html, button);
				} else if (input.charAt(0) == '/') {
					uiInput.parseUserCommand(input);
				} else {
					uiInput.parseUserMessage(input);
				}
			}
		}});
		$('#input').val('');
	},

	// Execute a command by name
	performCommand: function(input) {
		input = `/${  input}`;
		const command = input.slice(1).split(' ');
		if (!uiInput.callCommand(command, input)) {
			console.error(`Invalid performCommand: ${  command[0]}`);
		}
	},

	// Handle Enter key press
	enterPressed: function() {
		// Connection status check should come from chat
		commandBus.emit('chat:checkConnectionStatus', { callback: function(connected) {
			if (!connected) {
				uiDialogs.alert(language.cantSendNoConnection);
				return;
			}
			if (uiState.commandHistory.length == 0 || uiState.commandHistory[uiState.commandHistory.length - 1] != $('#input').val()) {
				if (uiState.commandHistoryPos != -1 && uiState.commandHistoryPos == uiState.commandHistory.length - 1) {
					uiState.commandHistory[uiState.commandHistoryPos] = $('#input').val();
				} else {
					uiState.commandHistory.push($('#input').val());
				}
			}
			uiInput.parseUserInput($('#input').val());
			uiState.commandHistoryPos = -1;
		}});
	},

	// Handle arrow key navigation in command history
	arrowPressed: function(dir) {
		if (dir == 'up') {
			if (uiState.commandHistoryPos == uiState.commandHistory.length - 1 && $('#input').val() != '') {
				uiState.commandHistory[uiState.commandHistoryPos] = $('#input').val();
			}
			if (uiState.commandHistoryPos == -1 && uiState.commandHistory.length > 0 && typeof(uiState.commandHistory[uiState.commandHistory.length - 1]) == 'string') {
				uiState.commandHistoryPos = uiState.commandHistory.length - 1;
				if ($('#input').val() != '' && uiState.commandHistory[uiState.commandHistory.length - 1] != $('#input').val()) {
					uiState.commandHistory.push($('#input').val());
				}
				$('#input').val(uiState.commandHistory[uiState.commandHistoryPos]);
			} else if (uiState.commandHistoryPos != -1 && uiState.commandHistoryPos != 0) {
				uiState.commandHistoryPos--;
				$('#input').val(uiState.commandHistory[uiState.commandHistoryPos]);
			}
		} else {
			if (uiState.commandHistoryPos == uiState.commandHistory.length - 1 && $('#input').val() != '') {
				uiState.commandHistory[uiState.commandHistoryPos] = $('#input').val();
			}
			if (uiState.commandHistoryPos == -1 && $('#input').val() != '' && uiState.commandHistory.length > 0 && uiState.commandHistory[uiState.commandHistory.length - 1] != $('#input').val()) {
				uiState.commandHistory.push($('#input').val());
				$('#input').val('');
			} else if (uiState.commandHistoryPos != -1) {
				if (typeof(uiState.commandHistory[uiState.commandHistoryPos + 1]) == 'string') {
					uiState.commandHistoryPos++;
					$('#input').val(uiState.commandHistory[uiState.commandHistoryPos]);
				} else {
					uiState.commandHistoryPos = -1;
					$('#input').val('');
				}
			}
		}
	},

	// Handle paste events
	inputPaste: function(e) {
		const items = (e.clipboardData || e.originalEvent.clipboardData).items;
		// TODO: Handle pasted content
	},

	// Handle keypress for typing indicators (refactored to use chat event)
	inputKeypress: function(e) {
		// Don't check connection.chat.activeCaps here - let chat handle capability check
		if ($('#input').val().length > 0 && $('#input').val().charAt(0) == '/') return; // typing a command
		if (!uiTabs.getActive()) return;

		const currentWindow = uiTabs.getActive();
		commandBus.emit('chat:processTypingActivity', { windowName: currentWindow.name, inputValue: $('#input').val(), time: new Date() });
	},

	// Delegate command execution to commands object
	callCommand: function(command, input, alias) {
		if (alias && alias in commands) {
			if (typeof(commands[alias].callback) == 'string') {
				return uiInput.callCommand(command, input, commands[alias].callback);
			} else if (typeof(commands[alias].callback) == 'function') {
				commands[alias].callback(command, input);
				return true;
			} else {
				return false;
			}
		} else if (command[0].toLowerCase() in commands) {
			if (typeof(commands[command[0].toLowerCase()].callback) == 'string') {
				return uiInput.callCommand(command, input, commands[command[0].toLowerCase()].callback);
			} else if (typeof(commands[command[0].toLowerCase()].callback) == 'function') {
				commands[command[0].toLowerCase()].callback(command, input);
				return true;
			} else {
				return false;
			}
		} else {
			return false;
		}
	}
};

// ==========================================
// PUBLIC UI WINDOW/QUERY MANAGEMENT FUNCTIONS
// ==========================================

Object.assign(uiTabs, {
	// Open a query window with a user
	openQuery: function(nick, id) {
		if (ignore.ignoring(nick, 'query')) {
			const button = [
				{
					text: language.changeSettings,
					click: function() {
						ignore.askIgnore(nick);
						$(this).dialog('close');
					}
				},
				{
					text: 'OK',
					click: function() {
						$(this).dialog('close');
					}
				}
			];
			const html = `<p>${  language.cantPMBecauseIgnoring  }</p>`;
			uiDialogs.displayDialog('error', 'ignore', language.error, html, button);
			return;
		}
		uiTabs.findOrCreate(nick, true); // Create and activate query tab
		if (id) {
			uiNicklist.toggleNickOpt(id); // UI action
		}
	},

	// Find or create a channel/query tab
	findOrCreate: function(name, setActive) {
		if (!name || name == '') {
			return null;
		}
		let tab;
		if (name.charAt(0) == '#') { // Channel
			tab = uiTabs.findChannel(name);
			if (!tab) {
				tab = new ChannelTab(name);
				uiState.channels.push(tab);
				uiTabs.sortChannelTabs();
			}
		} else { // Query
			tab = uiTabs.findQuery(name);
			if (!tab) {
				tab = new Query(name);
				uiState.queries.push(tab);
			}
		}
		if (setActive) {
			uiTabs.switchTab(name);
		}
		return tab;
	},

	// Get or create the channel list window
	getOrOpenListWindow: function() {
		if (!uiState.listWindow) {
			uiState.listWindow = new ListWindow();
		}
		uiState.listWindow.clearData();
		uiTabs.switchTab(uiState.listWindow.name);
		return uiState.listWindow;
	},

	// Toggle channel list panel visibility
	toggleChanList: function() {
		if ($('#chlist-body').is(':visible')) {
			// Collapse: restore default flex sizes
			$('#chlist-body').css('display', '');
			$('#chlist').css({'flex': '', 'max-height': ''});
			$('#nicklist').css('flex', '');
			$('#chlist-button').text(`⮙ ${  language.channelList  } ⮙`);
		} else {
			// Expand: chlist sizes to content (capped at 60%), nicklist gets remaining space
			$('#chlist-body').css('display', 'block');
			$('#chlist').css({'flex': '0 0 auto', 'max-height': '60%'});
			$('#nicklist').css('flex', '');
			$('#chlist-button').text(`⮛ ${  language.hideList  } ⮛`);
			$('#chlist-body').html(language.loadingWait);
			commandBus.emit('chat:requestListChannels', { minUsers: '>9', time: new Date() });
		}
	},

	// Refresh the channel list
	refreshChanList: function() {
		commandBus.emit('chat:requestListChannels', { minUsers: '>9', time: new Date() });
		$('#chlist-body').html(language.loadingWait);
	},

	// Insert a message into the appropriate tab
	insertMessage: function(cmd, dest, text, ownMsg, label, sender, time, options) {
		options = options || {};
		if (!time)
			time = new Date();
		const attrs = options.attrs || (`data-time="${  time.getTime()  }"`);
		const addClass = options.addClass || '';

		if (!sender) sender = connection.chat.me.userRef;

		if (sender == connection.chat.me.userRef && text.charAt(0) == '\001') return; // don't display own ctcp requests/replies

		const meta = uiHelpers.getMeta(sender.nick, 100);
		const images = $$.parseImages(text, attrs);
		let message = $$.colorize(text);
		let nickComments = '';
		let nick = sender.nick;
		const msgid = options.msgid || '';
		let tab = null;
		let channel = false;

		// Deduplication: if duplicate msgid exists, remove old message (new one takes precedence)
		if (msgid.length > 0) {
			const existingMsg = $(`[data-msgid="${  msgid  }"]`);
			if (existingMsg.length > 0) {
				console.log('[DEDUP] Removing duplicate message with msgid:', msgid);
				existingMsg.remove();
			}
		}

		if (dest.charAt(0) == '#') {
			tab = uiTabs.findOrCreate(dest);
			tab.typing.stop(sender);
			channel = true;
		}

		let nickInfo = '';
		if (sender.account) {
			nickInfo = language.loggedInAs + he(sender.account);
		} else if (sender.registered) {
			nickInfo = language.loggedIn;
		} else {
			nickInfo = language.notLoggedIn;
		}
		if (sender.bot) {
			if (nickInfo.length > 0) nickInfo += '\n';
			nickInfo += language.userIsBot;
		}
		if (channel) {
			if (options.isHistory) {
				if (nickInfo.length > 0) nickInfo += '\n';
				nickInfo += language.historyEntry;
			}
		}
		const user = connection.chat.users.getUser(sender.nick);
		if ('display-name' in user.metadata) {
			nick = he(user.metadata['display-name']);
			nickComments = ` <span class="realNick" title="${  language.realNickname  }">(${  he(sender.nick)  })</span>`;
		} else {
			nick = he(sender.nick);
		}
		if (nickInfo.length > 0)
			nick = `<span title="${  nickInfo  }">${  nick  }</span>`;

		// Process message through event handlers
		const messageData = { sender: sender.nick, dest: dest, message: message };
		ircEvents.emit('message:process', messageData);
		message = messageData.message;

		let hlmatch;
		if (channel && sender != connection.chat.me.userRef) {
			const pattern = `\\b${  escapeRegExp(connection.chat.me.userRef.nick)  }\\b`;
			const re = new RegExp(pattern);
			hlmatch = re.test(message);
		} else {
			hlmatch = false;
		}

		if (cmd == 'notice' && channel) { // channel notice
			const appendOptions = options.isHistory ? {isHistory: true} : {};
			tab.appendMessage(language.messagePatterns.notice, [addClass, attrs, $$.niceTime(time), he(sender.nick), he(sender.ident), he(sender.host), he(message)], time, appendOptions);
			if (hlmatch && uiState.active != tab.name) {
				tab.markBold();
			}
			return;
		}
		if (cmd == 'message' || cmd == 'action') { // channel or private message
			let qname;
			if (!channel) {
				if (sender.nick == connection.chat.me.userRef.nick) {
					qname = dest;
				} else {
					qname = sender.nick;
				}
				const foundTab = uiTabs.find(qname);
				if (
					((sender.nick == connection.chat.me.userRef.nick && dest.isInList(servicesNicks))
                            || (dest == connection.chat.me.userRef.nick && sender.nick.isInList(servicesNicks)))				&& !foundTab) {
					if ($('#noticeDisplay').val() == 0) { // pop-up
						const html = `<span class="notice">[<b>${  he(sender.nick)  } → ${  he(dest)  }</b>]</span> ${  message}`;
						uiDialogs.displayDialog('notice', 'service', language.networkServiceMessage, html, false, attrs);
						return;
					} else if ($('#noticeDisplay').val() == 2) { // status
						uiState.statusWindow.appendMessage(language.messagePatterns.yourServiceCommand, [addClass, attrs, $.niceTime(time), he(connection.chat.me.nick), he(dest), he(message)], time);
						return;
					} else { // query
						// default behavior
					}
				}
				tab = uiTabs.findOrCreate(qname);
				tab.typing.stop(sender);
			} else {
				qname = dest;
			}
			let messageClass = 'msgNormal';
			let messageDiv;
			if (cmd != 'action') {
				const isHistoryBatch = options.isHistory || false;
				console.log('[BATCH-DEBUG] insertMessage:', {dest: dest, text: text.substring(0, 30), isHistoryBatch: isHistoryBatch});
				if (isHistoryBatch) {
					const allMessages = $(`#${  tab.id  }-window div.messageDiv:not(".msgRepeat")`);
					let prevMessage = null;
					const currentTime = time.getTime();
					for (const msg of allMessages) {
						const msgTime = msg.getAttribute('data-time');
						if (msgTime && parseInt(msgTime) < currentTime) {
							prevMessage = msg;
						} else if (msgTime && parseInt(msgTime) >= currentTime) {
							break;
						}
					}
					messageDiv = prevMessage ? $(prevMessage) : $();
				} else {
					messageDiv = $(`#${  tab.id  }-window div.messageDiv:not(".msgRepeat"):last`);
				}
				const senderClass = `sender${  md5(sender.nick)}`;
				const hasHrMarker = $(`#${  tab.id  }-window`).children().last().is('hr');
				const shouldBundle = messageDiv.length && messageDiv.hasClass(senderClass) && messageDiv[0].getAttribute('data-time') <= time.getTime() && !hasHrMarker;
				console.log('[BUNDLE-DEBUG]', {
					hasPrevious: messageDiv.length > 0,
					senderClass: senderClass,
					hasSenderClass: messageDiv.hasClass(senderClass),
					prevTime: messageDiv[0] ? messageDiv[0].getAttribute('data-time') : 'N/A',
					currentTime: time.getTime(),
					shouldBundle: shouldBundle,
					sender: sender.nick
				});
				if (shouldBundle) {
					const isActive = tab.name.toLowerCase() == uiState.active.toLowerCase();
					const scrollToBottom = !isHistoryBatch && isActive && chatIsAtBottom();
					messageDiv.find('span.msgText').append(`<span class="msgRepeatBlock ${  addClass  }" ${  attrs  }><br><span class="time">${  $$.niceTime(time)  }</span> &nbsp;${  message  }</span>`);
					messageClass = 'msgRepeat';
					if (scrollToBottom) {
						const cw = document.getElementById('chat-wrapper');
						cw.scrollTop = cw.scrollHeight;
					}
					console.log('[BUNDLE-DEBUG] Bundling message with previous');
				} else {
					console.log('[BUNDLE-DEBUG] Creating new message div');
					if (!(ownMsg && label)) {
						tab.markingSwitch = !tab.markingSwitch;
					}
				}
				if (tab.markingSwitch) {
					messageClass += ' oddMessage';
				} else {
					messageClass += ' evenMessage';
				}
				message = `<span class="time msgRepeatBlock">${  $$.niceTime(time)  }</span> &nbsp;${  message}`;
			}
			messageClass += ` ${  addClass}`;
			const appendOptions = {};
			if (options.isHistory) {
				appendOptions.isHistory = true;
			}

			if (hlmatch) { // highlighted
				if (cmd != 'action') {
					tab.appendMessage(language.messagePatterns.channelMsgHilight, [`sender${  md5(sender.nick)  } ${  messageClass}`, attrs, meta, $$.niceTime(time), nick, nickComments, message], time, appendOptions);
				} else {
					tab.appendMessage(language.messagePatterns.channelActionHilight, [addClass, attrs, $$.niceTime(time), nick, message], time, appendOptions);
				}
				if (messageClass.indexOf('msgRepeat') > -1) {
					messageDiv.find('span.nick').addClass('repeat-hilight');
				}
				if (uiState.active != dest.toLowerCase() || !disp.focused) {
					tab.markNew();
				}
			} else { // not highlighted or query
				if (cmd != 'action') {
					tab.appendMessage((sender.nick == connection.chat.me.userRef.nick) ? language.messagePatterns.yourMsg : language.messagePatterns.channelMsg, [`sender${  md5(sender.nick)  } ${  messageClass}`, attrs, meta, $$.niceTime(time), $$.nickColor(sender.nick), nick, nickComments, message], time, appendOptions);
				} else {
					tab.appendMessage((sender.nick == connection.chat.me.userRef.nick) ? language.messagePatterns.yourAction : language.messagePatterns.channelAction, [addClass, attrs, $$.niceTime(time), $$.nickColor(sender.nick), nick, message], time, appendOptions);
				}
				if (uiState.active.toLowerCase() != qname.toLowerCase() || !disp.focused) {
					if (channel) {
						tab.markBold();
					} else {
						tab.markNew();
					}
				}
			}

			tab.appendMessage('%s', [images.html], time, options);
			$$.applyCallbacks(images.callbacks);
			return;
		}
		if (cmd == 'notice') { // private notice
			if (ownMsg) {
				if ($('#noticeDisplay').val() == 2) { // notice in status window
					uiState.statusWindow.appendMessage(language.messagePatterns.yourNotice, [addClass, attrs, $$.niceTime(), he(dest), he(message)], time);
				} else if ($('#noticeDisplay').val() == 1) { // notice in a query window
					const query = uiTabs.findOrCreate(dest);
					query.appendMessage(language.messagePatterns.yourNotice, [addClass, attrs, $$.niceTime(), he(dest), he(message)], time);
				} else if ($('#noticeDisplay').val() == 0) { // notice in pop-up
					const html = `<span class="notice">[<b>${  he(sender.nick)  } → ${  he(dest)  }</b>]</span> ${  message}`;
					uiDialogs.displayDialog('notice', dest, `${language.privateNoticeFrom  } ${  dest}`, html, false, attrs);
				}
				return;
			}
			if (!sender.server) { // sent by user or service
				let qname;
				if (sender.nick == connection.chat.me.userRef.nick) {
					qname = dest;
				} else {
					qname = sender.nick;
				}
				const foundTab = uiTabs.findQuery(qname);
				if (
					((sender.nick == connection.chat.me.userRef.nick && dest.isInList(servicesNicks))
                            || (dest == connection.chat.me.userRef.nick && sender.nick.isInList(servicesNicks)))				&& !foundTab) {
					if ($('#noticeDisplay').val() == 0) { // pop-up
						const html = `<span class="notice">[<b>${  he(sender.nick)  } → ${  he(dest)  }</b>]</span> ${  message}`;
						uiDialogs.displayDialog('notice', 'service', language.networkServiceMessage, html, false, attrs);
						return;
					} else if ($('#noticeDisplay').val() == 2) { // status
						uiState.statusWindow.appendMessage(language.messagePatterns.yourServiceCommand, [addClass, attrs, $.niceTime(time), he(connection.chat.me.nick), he(dest), he(message)], time);
						return;
					} else { // query
						// default behavior
					}
				}
				const noticeDisplay = $('#noticeDisplay').val();
				if (noticeDisplay == 0 && !foundTab) { // pop-up, no existing query tab
					const html = `<span class="notice">[<b>${  he(sender.nick)  } → ${  he(dest)  }</b>]</span> ${  message}`;
					uiDialogs.displayDialog('notice', sender.nick, language.privateNoticeFrom + he(sender.nick), html, false, attrs);
					return;
				} else if (noticeDisplay == 2 && !foundTab) { // status window, no existing query tab
					uiState.statusWindow.appendMessage(language.messagePatterns.notice, [addClass, attrs, $$.niceTime(time), he(sender.nick), he(sender.ident), he(sender.host), he(message)], time);
					return;
				}
				// query mode (or existing query tab): show in query
				tab = uiTabs.findOrCreate(qname);
				tab.typing.stop(sender);
				tab.appendMessage(language.messagePatterns.notice, [addClass, attrs, $$.niceTime(time), he(sender.nick), he(sender.ident), he(sender.host), he(message)], time);
				tab.markNew();
				tab.appendMessage('%s', [images.html], time, options);
				$$.applyCallbacks(images.callbacks);
			} else { // sent by server
				const expressions = [/^Your "real name" is now set to be/, / invited [^ ]+ into the channel.$/];
				for (const expr of expressions) {
					if (text.match(expr)) {
						return;
					}
				}

				let expr = /^\\\[Knock\\\\] by ([^ !]+)![^ ]+ \(([^)]+)\)$/;
				let match = expr.exec(text);
				if (match) {
					commandBus.emit('chat:requestKnock', { channel: dest.substring(dest.indexOf('#')), nick: match[1], reason: match[2], time: new Date() });
					return;
				}
				expr = /^Knocked on (.*)$/;
				match = expr.exec(text);
				if (match) {
					const chan = uiTabs.findChannel(match[1]);
					if (chan) {
						chan.appendMessage(language.messagePatterns.knocked, [$$.niceTime(time), he(match[1])], time);
					} else {
						uiState.statusWindow.appendMessage(language.messagePatterns.knocked, [$$.niceTime(time), he(match[1])], time);
					}
					return;
				}

				// we ignore these not to bug users with pop-ups
				if (sender.nick == 'AUTH' || sender.nick == '*' || dest == '*') { // connect notices
					return;
				}
				if (text.match(/^\*\*\* You are connected to .+ with .+$/)) {
					return;
				}
				uiDialogs.displayDialog('notice', sender.nick, language.privateNoticeFromServer + he(sender.nick) + language.to + he(dest), message, false, attrs);
			}
			return;
		}
		console.error(`Unhandled message from ${  sender.nick  } to ${  dest  }!`);
	},

	// Mark message as delivery failed
	msgNotDelivered: function(label, msg) {
		console.log('[LABEL-DEBUG] msgNotDelivered called with label:', label, 'echo-message cap:', ('echo-message' in connection.chat.activeCaps));
		if (!('echo-message' in connection.chat.activeCaps))
			return;
		const sel = $(`[data-label="${  label  }"]`);
		console.log('[LABEL-DEBUG] Found', sel.length, `element(s) with data-label="${  label  }"`);
		sel.addClass('msgDeliveryFailed');
		sel.prop('title', language.messageNotDelivered);
		console.log('[LABEL-DEBUG] Added msgDeliveryFailed class to', sel.length, 'element(s)');
	}
});

// ==========================================
// PUBLIC UI DIALOGS AND SYSTEM FUNCTIONS
// ==========================================

const uiDialogs = {
	// Initialize system - show connecting dialog
	initSys: function() {
		const html = language.connectingWaitHtml;
		uiDialogs.displayDialog('connect', '1', language.connecting, html);
	},

	// Initialize connection with user-provided or saved credentials
	initialize: function() {
		let nickInput, chanInput, passInput;

		if (settings.get('automLogIn')) {
			if (conn.my_nick == '' || conn.my_reqChannel == '') {
				uiDialogs.alert(language.errorLoadingData);
				return false;
			}
			nickInput = conn.my_nick;
			chanInput = conn.my_reqChannel;
			passInput = conn.my_pass;
		} else {
			nickInput = $('#nsnick').val();
			chanInput = $('#nschan').val();
			passInput = $('#nspass').val();
			// Validation checks
			if (nickInput == '') { uiDialogs.alert(language.mustGiveNick); return false; }
			if (chanInput == '') { uiDialogs.alert(language.mustGiveChannel); return false; }
			if (chanInput.charAt(0) != '#') { chanInput = `#${  chanInput}`; $('#nschan').val(chanInput); }
			if (!nickInput.match(/^[\[\^\|0-9a-z_`\{\}\[\]\-]+$/i)) { uiDialogs.alert(language.badCharsInNick); return false; }
			if (nickInput.match(/^[0-9-]/)) {
				uiDialogs.alert(language.badNickStart);
				return false;
			}
			if (!chanInput.match(/^[#,a-z0-9_\.\-\\]+$/i)) { uiDialogs.alert(language.badCharsInChan); return false; }
			if (passInput.match(/[ ]+/i)) { uiDialogs.alert(language.spaceInPassword); return false; }
		}

		if ($('#enableautomLogIn').is(':checked')) {
			settings.set('automLogIn', true);
			const button = [ {
				text: 'OK',
				click: function() { $(this).dialog('close'); }
			} ];
			uiDialogs.displayDialog('connect', '2', language.information, language.youCanDisableAutoconnect, button);
		}

		// Emit chat event to update user info before connecting
		commandBus.emit('chat:updateConnectionParams', {
			nick: nickInput,
			channels: [ chanInput ],
			nickservNick: nickInput,
			nickservPass: passInput,
			savePassword: $('#save_password').is(':checked')
		});

		try {
			if (chanInput) { localStorage.setItem('channel', chanInput); }
			if (nickInput) { localStorage.setItem('nick', nickInput); }
			if ($('#save_password').is(':checked')) {
				if (nickInput && passInput) {
					localStorage.setItem('password', encryptPassword(passInput));
				}
			}
		} catch (e) {}

		try {
			window.history.pushState('', `${connection.chat.me.nick  } @ ${  mainSettings.networkName}`, `/${  chanInput.substr(1)  }/${  nickInput  }/`);
		} catch (e) {}
		uiDialogs.initSys();
		commandBus.emit('chat:requestConnect', { force: false });

		return true;
	},

	// Handle channel password dialog submission
	chanPassword: function(chan) {
		if ($('#chpass').val() == '') {
			uiDialogs.alert(language.passwordNotGiven);
			return false;
		}
		commandBus.emit('chat:requestJoinChannel', { channelName: chan, password: $('#chpass').val(), time: new Date() });
		$('.errorwindow').fadeOut(250);
		return true;
	},

	// Change topic dialog
	changeTopic: function(channel) {
		if (!confirm(`${language.areYouSureToChangeTopicOf + channel  }? ${  language.itCantBeUndone}`)) {
			return false;
		}
		const newTopic = $('#topicEdit').val().replace(/\n/g, ' ');
		commandBus.emit('chat:setTopic', { channel: channel, newTopic: newTopic });
		uiDialogs.closeDialog('confirm', 'topic');
		return true;
	},

	// Show status dialog for adding privileges
	// TODO: privilege levels (+v, +h, +o, +a, +q) are hardcoded; should use PREFIX from connection.chat.isupport
	showStatus: function(channel, nick) {
		if (getConnectionStatus() !== 'connected') return;
		const html = `<p>${  language.giveForNick  }<strong>${  he(nick)  }</strong>${  language.temporaryPrivilegesOnChan  }<strong>${  he(channel)  }</strong>:</p>` +
                `<select id="admopts-add-${  md5(channel)  }">` +
                    `<option value="-">${  language.selectOption  }</option>` +
                    `<option value="+v">${  language.voicePrivilege  }</option>` +
                    `<option value="+h">${  language.halfopPrivilege  }</option>` +
                    `<option value="+o">${  language.opPrivilege  }</option>` +
                    `<option value="+a">${  language.sopPrivilege  }</option>` +
                    `<option value="+q">${  language.founderPrivilege  }</option>` +
                '</select>' +
                `<p>${  language.giveForNick  }<strong>${  he(nick)  }</strong>${  language.chanservPrivilegesOnChan  }<strong>${  he(channel)  }</strong><br>${  language.youNeedServicePrivileges  }:</p>` +
                `<select id="admopts-addsvs-${  md5(channel)  }">` +
                    `<option value="-">${  language.selectOption  }</option>` +
                    `<option value="VOP">VOP: ${  language.voicePrivilege  }</option>` +
                    `<option value="HOP">HOP: ${  language.halfopPrivilege  }</option>` +
                    `<option value="AOP">AOP: ${  language.opPrivilege  }</option>` +
                    `<option value="SOP">SOP: ${  language.sopPrivilege  }</option>` +
                    `<option value="QOP">QOP: ${  language.founderPrivilege  }</option>` +
                '</select>';
		const button = [
			{
				text: language.cancel,
				click: function() {
					$(this).dialog('close');
				}
			},
			{
				text: 'OK',
				click: function() {
					const mode = $(`#admopts-add-${  md5(channel)}`).val();
					const svsmode = $(`#admopts-addsvs-${  md5(channel)}`).val();
					if (mode == '-' && svsmode == '-') {
						uiDialogs.alert(language.selectAvalilableOption);
						return;
					}
					if (mode != '-') commandBus.emit('chat:requestModeChange', { channel: channel, modeString: `${mode  } ${  nick}`, time: new Date() });
					if (svsmode != '-') commandBus.emit('chat:requestServiceCommand', { service: 'ChanServ', command: svsmode, args: [channel, 'ADD', nick], time: new Date() });
					$(this).dialog('close');
				}
			}
		];
		uiDialogs.displayDialog('admin', channel, language.administrationOf + he(channel), html, button);
	},

	// Show anti-status dialog for removing privileges
	// TODO: privilege levels (-v, -h, -o, -a, -q) are hardcoded; should use PREFIX from connection.chat.isupport
	showStatusAnti: function(channel, nick) {
		if (getConnectionStatus() !== 'connected') return;
		const html = `<p>${  language.removeFromNick  }<strong>${  he(nick)  }</strong>${  language.temporaryPrivilegesOnChan  }<strong>${  he(channel)  }</strong>:</p>` +
                `<select id="admopts-del-${  md5(channel)  }">` +
                    `<option value="-">${  language.selectOption  }</option>` +
                    `<option value="-v">${  language.voicePrivilege  }</option>` +
                    `<option value="-h">${  language.voicePrivilege  }</option>` +
                    `<option value="-o">${  language.opPrivilege  }</option>` +
                    `<option value="-a">${  language.sopPrivilege  }</option>` +
                    `<option value="-q">${  language.founderPrivilege  }</option>` +
                '</select>' +
                `<p>${  language.completelyRemoveNick  }<strong>${  he(nick)  }</strong>${  language.fromChanservPrivilegesOnChan  }<strong>${  he(channel)  }</strong><br>${  language.youNeedServicePrivileges  }:</p>` +
                `<select id="admopts-delsvs-${  md5(channel)  }">` +
                    `<option value="-">${  language.dontRemove  }</option>` +
                    `<option value="+">${  language.yesRemove  }</option>` +
                '</select>';
		const button = [
			{
				text: language.cancel,
				click: function() {
					$(this).dialog('close');
				}
			},
			{
				text: 'OK',
				click: function() {
					const mode = $(`#admopts-del-${  md5(channel)}`).val();
					const svsmode = $(`#admopts-delsvs-${  md5(channel)}`).val();
					if (mode == '-' && svsmode == '-') {
						uiDialogs.alert(language.selectAvailableOption);
						return;
					}
					if (mode != '-') commandBus.emit('chat:requestModeChange', { channel: channel, modeString: `${mode  } ${  nick}`, time: new Date() });
					if (svsmode == '+') commandBus.emit('chat:requestServiceCommand', { service: 'ChanServ', command: 'ACCESS', args: [channel, 'DEL', nick], time: new Date() });
					$(this).dialog('close');
				}
			}
		];
		uiDialogs.displayDialog('admin', channel, language.administrationOf + he(channel), html, button);
	},

	// Show channel modes dialog
	showChannelModes: function(channel) {
		const channame = channel.substring(1);
		const ch = md5(channame);

		let html = `<p>${  language.changeChannelModesOf  }${he(channel)  }:</p>` +
                `<table><tr><th></th><th>${  language.character  }</th><th>${  language.description  }</th></tr>`;
		connection.chat.modes.changeableSingle.forEach((mode) => {
			if (modes['single'].indexOf(mode[0]) >= 0) html += `<tr><td><input type="checkbox" id="${  ch  }_mode_${  mode[0]  }"></td><td>${  mode[0]  }</td><td>${  mode[1]  }</td></tr>`;
		}, this);
		connection.chat.modes.changeableArg.forEach((mode) => {
			if (modes['argAdd'].indexOf(mode[0]) >= 0 || modes['argBoth'].indexOf(mode[0]) >= 0) html += `<tr><td><input type="checkbox" id="${  ch  }_mode_${  mode[0]  }"></td><td>${  mode[0]  }</td><td>${  mode[1]  }</td><td><input type="text" id="${  ch  }_mode_${  mode[0]  }_text"></td></tr>`;
		}, this);
		html += '</table>';

		const button = [ {
			text: language.applySetting,
			click: function() {
				uiDialogs.changeChannelModes(channel);
				$(this).dialog('close');
			}
		} ];

		uiDialogs.displayDialog('admin', channel, language.administrationOf + he(channel), html, button);

		const chanModes = uiTabs.findChannel(channel).modes;
		if (!chanModes) {
			return;
		}
		connection.chat.modes.changeableSingle.forEach((mode) => {
			if (chanModes[mode[0]]) {
				$(`#${  ch  }_mode_${  mode[0]}`).prop('checked', true);
			}
		}, this);
		connection.chat.modes.changeableArg.forEach((mode) => {
			if (chanModes[mode[0]]) {
				$(`#${  ch  }_mode_${  mode[0]}`).prop('checked', true);
				$(`#${  ch  }_mode_${  mode[0]  }_text`).val(chanModes[mode[0]]);
			}
		}, this);
	},

	// Apply channel mode changes
	changeChannelModes: function(channel) {
		let modesw = '';
		let modeop = '';
		let modearg = '';
		const chanModes = uiTabs.findChannel(channel).modes;
		const channame = channel.substring(1);
		const ch = md5(channame);

		connection.chat.modes.changeableSingle.forEach((mode) => {
			mode = mode[0];
			const set = chanModes[mode];
			const checked = $(`#${  ch  }_mode_${  mode}`).prop('checked');
			if (set != checked) {
				if (checked) {
					if (modeop != '+') {
						modeop = '+';
						modesw += '+';
					}
					modesw += mode;
				} else {
					if (modeop != '-') {
						modeop = '-';
						modesw += '-';
					}
					modesw += mode;
				}
			}
		}, this);

		connection.chat.modes.changeableArg.forEach((mode) => {
			mode = mode[0];
			const set = chanModes[mode];
			const checked = $(`#${  ch  }_mode_${  mode}`).prop('checked');
			const text = $(`#${  ch  }_mode_${  mode  }_text`).val();
			if (set != checked || (set && set != text)) {
				if (checked) {
					if (modeop != '+') {
						modeop = '+';
						modesw += '+';
					}
					modesw += mode;
					modearg += `${text  } `;
				} else {
					if (modeop != '-') {
						modeop = '-';
						modesw += '-';
					}
					modesw += mode;
					if (connection.chat.modes.argBoth.indexOf(mode) >= 0) {
						modearg += `${text  } `;
					}
				}
			}
		}, this);

		commandBus.emit('chat:requestModeChange', { target: channel, modeString: `${modesw  } ${  modearg}`, time: new Date() });
		setTimeout(() => { uiDialogs.showChannelModes(channel); }, 2000);
	},

	// Show invite prompt dialog
	showInvitePrompt: function(channel) {
		const html = '<p>Nick: <input id="inviteNick" type="text"></p>';
		const button = [ {
			text: language.cancel,
			click: function() {
				$(this).dialog('close');
			}
		}, {
			text: language.inviteSomeone,
			click: function() {
				const nick = $('#inviteNick').val();
				if (!nick || nick == '') {
					uiDialogs.alert(language.mustGiveNick);
					return;
				}
				commandBus.emit('chat:requestInvite', { channel: channel, nick: nick, time: new Date() });
				$(this).dialog('close');
			}
		} ];
		uiDialogs.displayDialog('admin', `invite-${  channel}`, language.inviteUserTo + he(channel), html, button);
	},

	// Show knocking notification dialog
	knocking: function(channel, nick, reason) {
		const html = `<b>${  nick  }</b>${  language.requestsInvitationTo  }<b>${  he(channel)  }</b> (${  $$.colorize(reason)  })`;
		const button = [ {
			text: 'Zaproś',
			click: function() {
				commandBus.emit('chat:requestInvite', { channel: channel, nick: nick, time: new Date() });
				$(this).dialog('close');
			}
		} ];
		uiDialogs.displayDialog('knock', nick, language.requestForInvitation, html, button);
	},

	// Show permission error dialog
	showPermError: function(text) {
		const html = `${language.noAccess
		}<br>${  language.notEnoughPrivileges  }<br>${  text}`;
		uiDialogs.displayDialog('error', 'error', language.error, html);
	},

	// Show kick dialog
	showKick: function(channel, nick) {
		if (getConnectionStatus() !== 'connected') return;
		const html = `<p>${  language.kickUser  }${he(nick)  }${language.fromChannel  }${he(channel)  }. ${  language.giveKickReason  }</p>` +
                '<input type=\'text\' id=\'kickinput\' maxlength=\'307\' />';
		const button = [ {
			text: language.cancel,
			click: function() {
				$(this).dialog('close');
			}
		}, {
			text: language.doKick,
			click: function() {
				const reason = $('#kickinput').val();
				commandBus.emit('chat:requestKick', { channel: channel, nick: nick, reason: reason, time: new Date() });
				$(this).dialog('close');
			}
		} ];
		uiDialogs.displayDialog('admin', `kick-${  channel}`, 'KICK', html, button);
	},

	// Show quit confirmation dialog
	clickQuit: function() {
		const html = `<form id="quit-form" onsubmit="commandBus.emit('chat:requestQuit', { message: $('#quit-msg').val(), time: new Date() }); uiDialogs.closeDialog('confirm', 'quit'); return false;" action="javascript:void(0);">${
			language.quitMessage  }<input type="text" id="quit-msg" value="${  language.defaultQuitMessage  }" />`;
		'</form>';
		const button = [ {
			text: language.disconnect,
			click: function() {
				$('#quit-form').submit();
			}
		}, {
			text: language.cancel,
			click: function() {
				$(this).dialog('close');
			}
		} ];
		uiDialogs.displayDialog('confirm', 'quit', language.ircQuit, html, button);
		$('#quit-msg').focus();
		$('#quit-msg').select();
	},

	// Display global ban information
	displayGlobalBanInfo: function(text) {
		const html = `${language.connectionNotAllowedHtml
		}</ul><br><p>${  language.serverMessageIs  }<br>${  he(text)  }</p>`;
		uiDialogs.closeDialog('connect', '1');
		uiDialogs.displayDialog('error', 'noaccess', language.noAccessToNetwork, html);
		commandBus.emit('chat:setConnectStatus', { status: 'banned' });
	},

	// Update history for all channels and queries
	updateHistory: function() {
		for (const chan of uiState.channels) {
			updateHistory(chan.name, chan.id);
		}
		for (const query of uiState.queries) {
			updateHistory(query.name, query.id);
		}
	},

	// Load older chat history (refactored to use chat event)
	loadOlderHistory: function(channel) {
		const chan = uiTabs.findChannel(channel);
		if (!chan) {
			console.log('Channel not found:', channel);
			return;
		}

		const loadOlderButton = $(`#${  chan.id  }-window .loadOlderButton`);
		const msgid = loadOlderButton.attr('data-msgid') || null;
		const timestamp = loadOlderButton.attr('data-timestamp') || null;

		// Save scroll state before any DOM changes so restoreScroll can anchor correctly
		chan.saveScroll();

		loadOlderButton.remove();

		// Calculate UI-appropriate limit based on screen size
		const limit = uiHelpers.calculateHistoryLimit();

		// Check if this is an initial LATEST query (timestamp='*')
		if (timestamp === '*') {
			commandBus.emit('chat:requestChatHistory', {
				channelName: channel,
				type: 'LATEST',
				msgid: null,
				timestamp: null,
				limit: limit,
				time: new Date()
			});
		} else if (msgid || timestamp) {
			// Request history BEFORE the oldest known message
			commandBus.emit('chat:requestChatHistory', {
				channelName: channel,
				type: 'BEFORE',
				msgid: msgid,
				timestamp: timestamp,
				limit: limit,
				time: new Date()
			});
		} else {
			console.log('No reference point found for loading older history');
		}
	},

	getDialogSelector: function(type, sender) {
		return $(`#${  type  }Dialog-${  md5(sender.toLowerCase())}`);
	},

	displayDialog: function(type, sender, title, message, button, attrs) {
		if (!attrs)
			attrs = '';
		let $content;
		if (message && message.jquery) {
			$content = $('<span>').append(message);
		} else {
			let html;
			switch (type) { //specyficzne dla typu okna
				case 'whois':
				case 'warning': case 'error': case 'confirm': case 'connect': case 'admin': case 'services': case 'ignore': case 'list': case 'alert': case 'emoticons': // nie wyświetlamy czasu
					html = `<span ${  attrs  }>${  message  }</span>`;
					break;
				default:
					html = `<p ${  attrs  }><span class="time">${  $$.niceTime()  }</span> ${  message  }</p>`;
					break;
			}
			$content = html;
		}
		const id = `${type  }Dialog-${  md5(sender.toLowerCase())}`;
		let $dialog = $(`#${  id}`);
		if ($dialog.length == 0) {
			if (!title) {
				title = type;
			}
			title = he(title);
			let additionalClasses = '';
			if (type == 'notice' && sender.toLowerCase() == 'memoserv') { // specjalny styl dla MemoServ
				additionalClasses += 'notice-dialog-memoserv';
			}
			$dialog = $(`<div id="${  id  }" class="dialog ${  type  }-dialog ${  additionalClasses  }" title="${  title  }" />`);
			$dialog.appendTo('html');
		}

		$dialog.append($content);
		$dialog.scrollTop($dialog.prop('scrollHeight'));
		if (type == 'connect') {
			$dialog.dialog({/* modal: true,*/ dialogClass: 'no-close' });
		} else if (sender == 'noaccess') {
			$dialog.dialog({ /*modal: true, */dialogClass: 'no-access' });
		} else {
			$dialog.dialog({ dialogClass: `${type  }-dialog-spec` });
		}
		let dWidth = 600;
		if (type == 'alert') {
			dWidth = 400;
		} else if (type == 'connect') {
			dWidth = 'auto';
		}
		if (typeof dWidth === 'number' && window.matchMedia('(max-width: 767px)').matches) {
			dWidth = Math.min(dWidth, window.innerWidth - 32);
		}
		$dialog.dialog({
			resizable: false,
			draggable: true,
			close: function() {
				$(`#${  id}`).dialog('destroy');
				$(`#${  id}`).remove();
			},
			width: dWidth,
			maxHeight: window.innerHeight * 0.8
		});
		if (button == 'OK') {
			button = [{
				text: 'OK',
				click: function() {
					$(this).dialog('close');
				}
			}];
		}
		if (button) {
			$dialog.dialog('option', 'buttons', button);
		}
		if ($dialog.find('input').length == 0) {
			uiHelpers.inputFocus();
		}
		if (type != 'error' && type != 'alert') {
			$('.connect-dialog').dialog('moveToTop');
		}
	},

	closeDialog: function(type, nick) {
		const id = `${type  }Dialog-${  md5(nick.toLowerCase())}`;
		const $dialog = $(`#${  id}`);
		$dialog.dialog('close');
		uiHelpers.inputFocus();
	},

	displayReconnect: function() {
		const button = [ {
			text: language.reconnect,
			click: function() {
				commandBus.emit('chat:requestReconnect'); // Emit chat event
			}
		} ];
		uiDialogs.displayDialog('connect', 'reconnect', language.disconnected, language.lostNetworkConnection, button);
	},

	alert: function(text) {
		const button = [ {
			text: 'OK',
			click: function() {
				$(this).dialog('close');
			}
		} ];
		if (uiDialogs.getDialogSelector('alert', 'alert').length > 0) {
			text = `<br>${  text}`;
		}
		uiDialogs.displayDialog('alert', 'alert', language.msgNotice, text, button);
	}
};

/**
     * Initializes UI-related event listeners.
     */
function initDisplayListeners() {
	// URL link warning — used by parseLinks() when displayLinkWarning is on
	$(document).on('click', 'a[data-link-warn]', (e) => {
		if (!confirm(language.linkCanBeUnsafe)) {
			e.preventDefault();
		}
	});

	// Channel link click handler — used by parseLinks() and channel list windows
	$(document).on('click', 'a[data-channel]', (e) => {
		e.preventDefault();
		if (!settings.get('displayLinkWarning') || confirm(language.confirmJoin)) {
			commandBus.emit('chat:requestJoinChannel', { channelName: e.currentTarget.dataset.channel, time: new Date() });
		}
	});

	// Channel sidebar list click handler
	$(document).on('click', 'td.chname[data-channel]', (e) => {
		commandBus.emit('chat:joinChannel', { channels: e.currentTarget.dataset.channel });
	});

	// Server acknowledged outgoing message (labeled-response ACK); mark as delivered
	commandBus.on('message:labelAcknowledged', ({ label }) => {
		const sel = $(`[data-label="${  label  }"]`);
		sel.removeClass('notDelivered').addClass('msgDelivered');
	});

	// Show ignore dialog for a given nick (triggered by /ignore command)
	commandBus.on('chat:requestIgnoreUser', ({ nick }) => {
		ignore.askIgnore(nick);
	});

	// Open ignore management dialog when link in ignore list messages is clicked
	$(document).on('click', '.action-openIgnoreManagement', () => {
		ignore.showIgnoreManagement();
	});

	// Message delivery failed (no echo-message confirmation received)
	commandBus.on('chat:messageDeliveryFailed', (data) => {
		uiTabs.msgNotDelivered(data.label, data.msg);
	});

	// Channel list fetch requested — open/focus the list window only for unlabeled (full) requests;
	// labeled requests are sidebar requests and must not open the list tab
	commandBus.on('chat:listChannels', (data) => {
		if (!data.labeled) {
			uiTabs.getOrOpenListWindow();
		}
	});

	// Request to redo NAMES: reset hasNames on the channel so the list re-populates
	commandBus.on('chat:requestRedoNames', (data) => {
		const channel = uiTabs.findChannel(data.channelName);
		if (channel) channel.hasNames = false;
	});

	// Listener for received messages with abstracted state
	commandBus.on('message:received', (state) => {
		// All message state is now provided by chat - no need to check caps/batches/tags

		// Special handling for NOTICE from services (NickServ, ChanServ)
		if (state.messageType === 'notice') {
			const senderNick = state.sender.nick;
			// Check if it's from NickServ - ALL NickServ messages should appear in dialogs
			if (senderNick && senderNick.toLowerCase() == 'nickserv') {
				const msgObj = { sender: state.sender, text: state.text };
				const handled = services.nickservMessage(msgObj);
				if (!handled) {
					uiDialogs.displayDialog('notice', 'nickserv', 'NickServ', $$.colorize(state.text));
				}
				return; // All NickServ messages handled via dialogs
			}
			// Check if it's from ChanServ - ALL ChanServ messages should appear in dialogs
			if (senderNick && senderNick.toLowerCase() == 'chanserv') {
				const msgObj = { sender: state.sender, text: state.text };
				const handled = services.chanservMessage(msgObj);
				if (!handled) {
					uiDialogs.displayDialog('notice', 'chanserv', 'ChanServ', $$.colorize(state.text));
				}
				return; // All ChanServ messages handled via dialogs
			}
		}

		// Echo-message confirmation: update the pending element in-place rather than
		// removing it and appending a new one, which would change message order.
		if (state.isEcho && state.labelToReplace) {
			const pending = $(`[data-label="${  state.labelToReplace  }"]`);
			if (pending.length) {
				pending.removeClass('notDelivered');
				pending.removeAttr('data-label');
				pending.attr('data-time', state.time.getTime());
				if (state.msgid) pending.attr('data-msgid', state.msgid);
				// Update text if server changed it (only for non-bundled regular messages)
				if (!pending.hasClass('msgRepeatBlock')) {
					const msgText = pending.find('span.msgText');
					if (msgText.length) {
						msgText.html(`<span class="time msgRepeatBlock">${  $$.niceTime(state.time)  }</span> &nbsp;${  $$.colorize(state.text)  }`);
					}
				}
				return;
			}
			// Pending element not found; fall through to insert at current position.
		}

		let attrs = `data-time="${  state.time.getTime()  }"`;
		let addClass = '';

		// Mark outgoing pending messages (waiting for confirmation)
		if (state.isPending && state.label) {
			attrs += ` data-label="${  state.label  }"`;
			addClass = 'notDelivered';
		}

		// Add msgid for deduplication
		if (state.msgid) {
			attrs += ` data-msgid="${  state.msgid  }"`;
		}

		// Call insertMessage with abstracted state (no raw tags)
		uiTabs.insertMessage(state.messageType || 'message', state.dest, state.text, state.isOutgoing, null, state.sender, state.time, {
			attrs: attrs,
			addClass: addClass,
			isHistory: state.isHistory,
			msgid: state.msgid // Pass msgid for deduplication
		});
	});

	// Listener for when the client successfully joins a channel.
	commandBus.on('channel:channelCreation', (data) => {
		const { channelName, members } = data; // members = Complete initial member list from chat
		const channame = channelName;

		let channel = uiTabs.findChannel(channame); // Find the UI representation of the channel
		if (!channel) {
			// Create the UI representation with complete initial data
			channel = new ChannelTab(channame); // Channel UI constructor handles DOM creation
			uiState.channels.push(channel);
			uiTabs.sortChannelTabs(); // Re-sort tabs after adding new one

			// Populate the nicklist with all initial members at once (efficiently)
			if (members && members.length > 0) {
				let ourMember = null;
				for (const member of members) {
					channel.nicklist._addMemberToUI(member, true); // Skip sort/stats during bulk add
					// Track our own member entry
					if (member.id === connection.chat.me.userRef.id) {
						ourMember = member;
					}
				}
				// Sort and update stats once after all members are added
				channel.nicklist.sort();
				channel.nicklist.showChstats();

				// Update operator actions display based on our privileges
				if (ourMember) {
					updateOperActionsDisplay(channel, ourMember.level);
				}
			}
		} else {
			// Channel already exists (rejoining after kick/part)
			// Clear the left flag and repopulate nicklist
			channel.left = false;
			channel.hasNames = false; // Will be set to true after NAMES completes

			// Repopulate the nicklist with all members
			if (members && members.length > 0) {
				let ourMember = null;
				for (const member of members) {
					channel.nicklist._addMemberToUI(member, true); // Skip sort/stats during bulk add
					// Track our own member entry
					if (member.id === connection.chat.me.userRef.id) {
						ourMember = member;
					}
				}
				// Sort and update stats once after all members are added
				channel.nicklist.sort();
				channel.nicklist.showChstats();

				// Update operator actions display based on our privileges
				if (ourMember) {
					updateOperActionsDisplay(channel, ourMember.level);
				}
			}
		}

		// Display the channel
		uiTabs.switchTab(channame);

		// Append join message with timestamp for chronological ordering with history
		channel.appendMessage(language.messagePatterns.joinOwn, [
			$$.niceTime(data.time),
			he(data.nick),
			he(data.ident),
			he(data.host),
			he(data.channelName)
		], data.time);

		// Set and display topic if available
		if (data.topic !== undefined) {
			channel.setTopic(data.topic);
			if (data.topicSetBy) {
				channel.setTopicSetBy(data.topicSetBy);
			}
			if (data.topicSetDate) {
				channel.setTopicSetDate(data.topicSetDate);
			}

			// Display topic message
			if (data.topic) {
				channel.appendMessage(language.messagePatterns.topic, [
					$$.niceTime(),
					channelName,
					$$.colorize(data.topic)
				]);

				// Display topic metadata if available
				if (data.topicSetBy && data.topicSetDate) {
					channel.appendMessage(language.messagePatterns.topicTime, [
						$$.niceTime(),
						he(data.topicSetBy),
						$$.parseTime(data.topicSetDate)
					]);
				}
			} else {
				// No topic set
				channel.appendMessage(language.messagePatterns.topicNotSet, [
					$$.niceTime(),
					channelName
				]);
			}
		}

		// Automatically request initial history if server supports it
		if (data.historySupported) {
			// Calculate UI-appropriate limit based on screen size (one window height)
			let limit = uiHelpers.calculateHistoryLimit();

			// Respect server's maximum if it has one
			if (data.historyMaxLimit != 0 && data.historyMaxLimit < limit) {
				limit = data.historyMaxLimit;
			}

			console.log('Automatically requesting initial history for', channelName, 'limit:', limit);

			// Request initial history (LATEST)
			commandBus.emit('chat:requestChatHistory', {
				channelName: channelName,
				type: 'LATEST',
				msgid: null,
				timestamp: null,
				limit: limit,
				time: new Date()
			});
		}
	});

	// Listener for NAMES refresh (not initial join)
	commandBus.on('channel:memberListReplace', (data) => {
		const { channelName, members } = data; // members = Complete refreshed member list from chat
		const channame = channelName.toLowerCase();

		const channel = uiTabs.findChannel(channame);
		if (channel && channel.nicklist) {
			// Replace the entire nicklist with refreshed data
			channel.nicklist.replaceAllMembers(members);
		}
	});

	// Netsplit/netjoin buffering: { chanName: { nicks: [], time: Date, timer: id } }
	const netsplitQueue = {};
	const netjoinQueue = {};

	function flushNetsplitQueue(chanName) {
		const q = netsplitQueue[chanName];
		if (!q) return;
		delete netsplitQueue[chanName];
		const chan = uiTabs.findChannel(chanName);
		if (chan && q.nicks.length > 0) {
			chan.appendMessage(language.messagePatterns.netsplit, [$$.niceTime(q.time), q.nicks.join(', ')], q.time);
		}
	}

	function flushNetjoinQueue(chanName) {
		const q = netjoinQueue[chanName];
		if (!q) return;
		delete netjoinQueue[chanName];
		const chan = uiTabs.findChannel(chanName);
		if (chan && q.nicks.length > 0) {
			chan.appendMessage(language.messagePatterns.netjoin, [$$.niceTime(q.time), q.nicks.join(', ')], q.time);
		}
	}

	// Listener for when another user joins a channel
	commandBus.on('channel:userJoined', (data) => {
		const { channelName } = data;
		const channame = channelName.toLowerCase();
		const chan = uiTabs.findChannel(channame);

		// ChatIntegrator only emits this for channels we're in, but check anyway
		if (!chan) {
			console.warn('UI: Received channel:userJoined for channel we have no tab for:', channelName);
			return;
		}

		// The chat layer should have already updated the user object and nicklist.
		// UI layer just needs to re-render the nicklist or append the join message.
		if (data.isNetsplit) {
			if (!netjoinQueue[channame]) {
				netjoinQueue[channame] = { nicks: [], time: data.time, timer: null };
			}
			netjoinQueue[channame].nicks.push(he(data.nick));
			clearTimeout(netjoinQueue[channame].timer);
			netjoinQueue[channame].timer = setTimeout(() => flushNetjoinQueue(channame), 700);
		} else if (!settings.get('showPartQuit')) {
			chan.appendMessage(language.messagePatterns.join, [
				$$.niceTime(data.time),
				he(data.nick),
				he(data.ident),
				he(data.host),
				channelName
			], data.time);
		}
		// Note: Nicklist automatically updates via chat:channelMemberListChanged events
	});

	commandBus.on('server:userJoinedOtherChannel', (data) => {
		// Show JOIN for channels we're not in as a status message
		uiState.statusWindow.appendMessage(language.messagePatterns.join, [
			$$.niceTime(data.time),
			he(data.nick),
			he(data.ident),
			he(data.host),
			data.channelName
		], data.time);
	});

	commandBus.on('channel:topic', (data) => {
		const { channelName } = data;
		const channame = channelName.toLowerCase();
		const channel = uiTabs.findChannel(channame);

		if (!channel) {
			return; // Channel tab not found
		}

		channel.setTopic(data.topic);

		// Display topic using the topic pattern: [time, channelName, topicText]
		if (data.topic) {
			channel.appendMessage(language.messagePatterns.topic, [
				$$.niceTime(),
				channelName,
				$$.colorize(data.topic)
			]);
		} else {
			channel.appendMessage(language.messagePatterns.topicNotSet, [
				$$.niceTime(),
				channelName
			]);
		}
	});

	// Handle topic changes (when someone actively changes the topic)
	commandBus.on('channel:topicChanged', (data) => {
		const { channelName } = data;
		const channame = channelName.toLowerCase();
		const channel = uiTabs.findChannel(channame);

		if (!channel) {
			return; // Channel tab not found
		}

		// Update the channel topic
		channel.setTopic(data.topic);
		channel.setTopicSetBy(data.setBy);
		channel.setTopicSetDate(data.setDate);

		// Display appropriate message based on whether topic was set or removed
		if (data.topic && data.topic.trim()) {
			// Topic was changed
			channel.appendMessage(language.messagePatterns.changeTopic, [
				$$.niceTime(),
				he(data.setBy),
				$$.colorize(data.topic)
			]);
		} else {
			// Topic was removed
			channel.appendMessage(language.messagePatterns.deleteTopic, [
				$$.niceTime(),
				he(data.setBy),
				he(channelName)
			]);
		}
	});

	commandBus.on('channel:topicInfoUpdated', (data) => {
		const { channelName } = data;
		const channame = channelName.toLowerCase();
		const channel = uiTabs.findChannel(channame);

		if (!channel) {
			return; // Channel tab not found
		}

		channel.setTopicSetBy(data.setBy);
		channel.setTopicSetDate(data.setDate);

		// Display topic metadata using topicTime pattern: [time, setBy, setDate]
		if (data.setBy && data.setDate) {
			channel.appendMessage(language.messagePatterns.topicTime, [
				$$.niceTime(),
				he(data.setBy),
				$$.parseTime(data.setDate)
			]);
		}
	});

	commandBus.on('channel:creationTimeUpdated', (data) => {
		const { channelName } = data;
		const channame = channelName.toLowerCase();
		const channel = uiTabs.findChannel(channame);

		if (!channel) {
			return; // Channel tab not found
		}

		channel.setCreationTime(data.creationTime);

		// Display creation time using creationTime pattern: [time, creationDate]
		if (data.creationTime) {
			channel.appendMessage(language.messagePatterns.creationTime, [
				$$.niceTime(),
				$$.parseTime(data.creationTime)
			]);
		}
	});

	commandBus.on('channel:modesUpdated', (data) => {
		const { channelName } = data;
		const channame = channelName.toLowerCase();
		const channel = uiTabs.findChannel(channame);

		if (!channel) {
			return; // Channel tab not found
		}

		// Parse and display channel modes using mode pattern: [time, channelName, modeDescription]
		if (data.modes) {
			const modeDescription = formatChannelModes(data.modes, data.modeParams);
			channel.appendMessage(language.messagePatterns.mode, [
				$$.niceTime(),
				channelName,
				modeDescription
			]);
		}
	});

	commandBus.on('chat:channelModeForUserChanged', ({ channelName, modeChange, byNick }) => {
		const chan = uiTabs.findChannel(channelName);
		if (!chan) return;
		const modeName = getModeInfo(modeChange.mode, 0);
		const action = `${(modeChange.isAdding ? language.gave : language.taken) + modeName
                + (modeChange.isAdding ? language.forUser : '')
		} <span class="modevictim">${  he(modeChange.nick)  }</span>`;
		chan.appendMessage(language.messagePatterns.modeChange, [
			$$.niceTime(),
			he(byNick),
			action,
			he(channelName)
		]);
	});

	commandBus.on('channel:userParted', (data) => {
		const { channelName } = data;
		const channame = channelName.toLowerCase();
		const chan = uiTabs.findChannel(channame);

		if (!chan) {
			return; // Channel not displayed
		}

		// UI decides whether to show part messages based on settings
		if (!settings.get('showPartQuit')) {
			chan.appendMessage(language.messagePatterns.part, [
				$$.niceTime(data.time),
				he(data.nick),
				he(data.ident),
				he(data.host),
				channelName,
				he(data.partMessage || '')
			]);
		}
		// Nicklist will be updated by chat layer events
	});

	commandBus.on('channel:userKicked', (data) => {
		const { channelName } = data;
		const channame = channelName.toLowerCase();
		const chan = uiTabs.findChannel(channame);

		if (!chan) {
			return; // Channel not displayed
		}

		// Check if we were kicked
		if (data.kickedNick === connection.chat.me.userRef.nick) {
			// Display kickOwn message
			chan.appendMessage(language.messagePatterns.kickOwn, [
				$$.niceTime(data.time),
				he(data.kickerNick),
				channelName,
				$$.colorize(data.reason || '')
			]);
			// Close the channel tab
			chan.part();
		} else {
			// Display kick message for other users
			chan.appendMessage(language.messagePatterns.kick, [
				$$.niceTime(data.time),
				he(data.kickerNick),
				he(data.kickedNick),
				channelName,
				$$.colorize(data.reason || '')
			]);
		}
		// Nicklist will be updated by chat layer events
	});

	commandBus.on('user:selfKickedFromChannel', (data) => {
		const channel = uiTabs.findChannel(data.channelName);
		if (channel) {
			$(`#${  channel.id  }-displayOperCss`).remove();
		}
	});

	commandBus.on('channel:errorMessage', (data) => {
		// Display channel-related error messages
		const channelName = data.channelName;
		const reason = data.reason;
		const message = data.message || '';

		// Map reason codes to translations
		let reasonText = '';
		switch (reason) {
			case 'voiceNeeded':
				reasonText = language.needVoice;
				break;
			case 'banned':
				reasonText = language.youreBanned;
				break;
			case 'noColor':
				reasonText = language.colorsForbidden;
				break;
			case 'noExternal':
				reasonText = language.noExternalMsgs;
				break;
			case 'accountNeeded':
				reasonText = language.registeredNickRequired;
				break;
			default:
				reasonText = language.serverMessageIs + he(message);
				break;
		}

		// Display on channel tab if open, otherwise status window
		const chan = uiTabs.findChannel(channelName);
		if (chan) {
			chan.appendMessage(language.messagePatterns.cannotSendToChan, [$$.niceTime(data.time), channelName, reasonText]);
		} else {
			uiState.statusWindow.appendMessage(language.messagePatterns.cannotSendToChan, [$$.niceTime(data.time), channelName, reasonText]);
		}
	});

	commandBus.on('channel:removed', (data) => {
		// Clean up UI when we part/leave a channel
		uiTabs.removeChannel(data.channelName);
	});

	commandBus.on('user:otherQuit', ({ user, quitMessage, time, channels, isNetsplit }) => {
		// User quit from server - show quit messages only on channels where user was present
		if (channels && channels.length > 0) {
			if (isNetsplit) {
				for (const chanName of channels) {
					if (!netsplitQueue[chanName]) {
						netsplitQueue[chanName] = { nicks: [], time: time, timer: null };
					}
					netsplitQueue[chanName].nicks.push(he(user.nick));
					clearTimeout(netsplitQueue[chanName].timer);
					netsplitQueue[chanName].timer = setTimeout(() => flushNetsplitQueue(chanName), 700);
				}
				return;
			}
			if (!settings.get('showPartQuit')) {
				const nickStr = he(user.nick);
				const identStr = he(user.ident);
				const hostStr = he(user.host);
				const quitStr = he(quitMessage || '');
				const timeStr = $$.niceTime(time);

				for (const chanName of channels) {
					const chan = uiTabs.findChannel(chanName);
					if (chan) {
						chan.appendMessage(language.messagePatterns.quit, [
							timeStr,
							nickStr,
							identStr,
							hostStr,
							quitStr
						]);
					}
				}
				// Show quit message in queries with this user
				const query = uiTabs.findQuery(user.nick);
				if (query) {
					query.appendMessage(language.messagePatterns.quit, [
						timeStr,
						nickStr,
						identStr,
						hostStr,
						quitStr
					]);
				}
			}
		}
	});

	commandBus.on('channel:chatHistoryStatsUpdated', (data) => {
		const channel = uiTabs.findChannel(data.channelName);
		if (!channel) return;
		const channelId = channel.id;

		const historyLimit = data.historyLimit || 50;

		const shouldShowLoadOlder = (data.oldestMsgid || data.oldestTimestamp) &&
                (data.isInitialHistory ? data.receivedMessages > 0 : data.receivedMessages >= historyLimit);

		if (shouldShowLoadOlder) {
			const selector = data.oldestMsgid
				? `[data-msgid="${  data.oldestMsgid  }"]`
				: (data.oldestTimestamp ? `[data-time="${  new Date(data.oldestTimestamp).getTime()  }"]` : null);

			let dataAttrs = '';
			if (data.oldestMsgid) {
				dataAttrs += ` data-msgid="${  data.oldestMsgid  }"`;
			}
			if (data.oldestTimestamp) {
				dataAttrs += ` data-timestamp="${  data.oldestTimestamp  }"`;
			}

			const html = `<div class="loadOlderButton"${  dataAttrs  }><a href="javascript:void(0)" onclick="uiDialogs.loadOlderHistory('${  he(data.channelName)  }')">${  language.loadOlderHistory  }</a></div>`;

			if (selector) {
				const oldestMsg = $(`#${  channelId  }-window ${  selector}`);
				if (oldestMsg.length) {
					oldestMsg.before(html);
				} else {
					$(`#${  channelId  }-window`).prepend(html);
				}
			} else {
				$(`#${  channelId  }-window`).prepend(html);
			}
		} else if (data.receivedMessages > 0 && !data.isInitialHistory) {
			const html = `<div class="noOlderHistory">${  language.noOlderHistory  }</div>`;
			$(`#${  channelId  }-window`).prepend(html);
		} else if (data.receivedMessages === 0 && !data.isInitialHistory) {
			$(`#${  channelId  }-window .loadOlderButton`).remove();
			const html = `<div class="noOlderHistory">${  language.noOlderHistory  }</div>`;
			$(`#${  channelId  }-window`).prepend(html);
		}

		channel.restoreScroll();
	});

	// SASL Authentication Listeners (primarily status messages)
	commandBus.on('auth:saslAuthenticating', (data) => {
		uiState.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(data.time), language.SASLLogin + he(data.nickservNick)]);
	});

	commandBus.on('auth:saslLoginAttempt', (data) => {
		uiState.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(data.time), language.SASLLoginAttempt]);
	});

	commandBus.on('auth:loggedIn', (data) => {
		uiState.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(data.time), language.weAreLoggedInAs + he(data.account)]);
	});

	commandBus.on('auth:userIdentifiedViaNickserv', () => {
		uiDialogs.closeDialog('nickserv', 'l');
	});

	commandBus.on('auth:loggedOut', (data) => {
		uiState.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(data.time), he(data.message)]);
	});

	commandBus.on('auth:saslSuccess', (data) => {
		uiState.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(data.time), language.SASLLoginSuccess]);
	});

	commandBus.on('auth:saslFail', (data) => {
		uiState.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(data.time), language.SASLLoginFail]);
	});

	commandBus.on('auth:nickservError', (data) => {
		services.displayNickservError(language.suppliedNickPassword, language.passwordInvalidTryAgain); // This is UI service
		$('#nickserv-l .error').html(`${language.error  }: ${  language.passwordInvalidTryAgain}`);
	});

	commandBus.on('auth:saslAborted', (data) => {
		uiState.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(data.time), language.SASLNotLoggedIn]);
	});

	// Global and Dialog Listeners
	commandBus.on('client:canSetAvatar', () => {
		$('#set-avatar-button').show(); // Pure UI
	});

	// This is emitted by chat:error (type: 'globalBan') which is now caught by client:errorMessage
	// commandBus.on('client:globalBanInfo', function(data) {
	//     uiTabs.displayGlobalBanInfo(data.text); // Pure UI function
	// });

	// Handle all error messages from the chat layer
	commandBus.on('client:errorMessage', (data) => {
		const time = data.time || new Date();

		// Map error types to user-friendly message patterns
		const errorMappings = {
			// User/Server lookup errors
			'noSuchNick': {
				pattern: language.messagePatterns.noSuchNick,
				params: [$$.niceTime(time), he(data.target || data.nick)]
			},
			'noSuchChannel': {
				pattern: language.messagePatterns.noSuchChannel,
				params: [$$.niceTime(time), he(data.target || data.channel)]
			},

			// Channel membership errors
			'notOnChannel': {
				pattern: language.messagePatterns.notOnChannel,
				params: [$$.niceTime(time), he(data.channel || data.channelName)]
			},
			'userOnChannel': {
				pattern: language.messagePatterns.alreadyOnChannel,
				params: [$$.niceTime(time), he(data.nick), he(data.channel || data.channelName)]
			},

			// Channel join errors
			'channelIsFull': {
				pattern: language.messagePatterns.cannotJoin,
				params: [$$.niceTime(time), he(data.channel), language.channelIsFull || 'channel is full']
			},
			'inviteOnlyChan': {
				pattern: language.messagePatterns.cannotJoin,
				params: [$$.niceTime(time), he(data.channel), language.inviteRequiredShort]
			},
			'bannedFromChan': {
				pattern: language.messagePatterns.cannotJoin,
				params: [$$.niceTime(time), he(data.channel), language.youreBanned]
			},
			'badChannelKey': {
				pattern: language.messagePatterns.cannotJoin,
				params: [$$.niceTime(time), he(data.channel), language.passwordRequired]
			},
			'needReggedNick': {
				pattern: language.messagePatterns.cannotJoin,
				params: [$$.niceTime(time), he(data.channel), language.registeredNickRequiredForChan]
			},
			'secureOnlyChan': {
				pattern: language.messagePatterns.cannotJoin,
				params: [$$.niceTime(time), he(data.channel), language.SSLRequired]
			},

			// Message send errors
			'cantSendToUser': {
				pattern: language.messagePatterns.cannotSendToUser,
				params: [$$.niceTime(time), he(data.nick || data.target), data.message || '']
			},

			// Permission errors
			'noPrivileges': {
				pattern: language.messagePatterns.noPerms,
				params: [$$.niceTime(time)]
			},
			'chanOpPrivsNeeded': {
				pattern: language.messagePatterns.noPerms,
				params: [$$.niceTime(time)]
			},
			'chanOwnPrivNeeded': {
				pattern: language.messagePatterns.noPerms,
				params: [$$.niceTime(time)]
			},

			// Mode errors
			'unknownMode': {
				pattern: language.messagePatterns.invalidMode,
				params: [$$.niceTime(time), he(data.mode || '')]
			},

			// Command/parameter errors
			'notEnoughParameters': {
				pattern: language.messagePatterns.notEnoughParameters,
				params: [$$.niceTime(time), he(data.command || '')]
			}
		};

		// Get the appropriate mapping
		const mapping = errorMappings[data.type];

		if (mapping && mapping.pattern) {
			// Display using the mapped message pattern
			uiState.statusWindow.appendMessage(mapping.pattern, mapping.params);
		} else {
			// Fallback for unmapped error types - use generic unimplemented error pattern
			uiState.statusWindow.appendMessage(language.messagePatterns.unimplementedError, [
				$$.niceTime(time),
				data.message || data.type || 'Unknown error'
			]);
		}
	});

	commandBus.on('client:globalBan', (data) => {
		// ERR_YOUREBANNEDCREEP (465) - Show global ban dialog
		const time = data.time || new Date();
		const html = `${language.connectionNotAllowedHtml
		}</ul><br><p>${  language.serverMessageIs  }<br>${  he(data.message)  }</p>`;
		uiDialogs.closeDialog('connect', '1');
		uiDialogs.displayDialog('error', 'noaccess', language.noAccessToNetwork, html);
		// Note: ChatIntegrator layer will handle setting connectStatus to 'banned'
	});

	commandBus.on('client:permissionError', (data) => {
		// ERR_CANNOTDOCOMMAND (972) or ERR_CANNOTCHANGECHANMODE (974)
		const time = data.time || new Date();
		const html = `${language.noAccess
		}<br>${  language.notEnoughPrivileges  }<br>${  he(data.message)}`;
		uiDialogs.displayDialog('error', 'error', language.error, html);

		// Append message to relevant channel tab if present, otherwise to status
		let targetTab = null;
		if (data.target && (data.target.startsWith('#') || data.target.startsWith('&'))) {
			// Target is a channel
			targetTab = uiTabs.findChannel(data.target);
		}
		// Fall back to status window if channel not found
		targetTab = targetTab || uiState.statusWindow;
		if (targetTab) {
			targetTab.appendMessage(language.messagePatterns.noPerms, [$$.niceTime(time), he(data.target || '')]);
		}
	});

	commandBus.on('client:reconnectNeeded', () => {
		uiDialogs.displayReconnect(); // Pure UI function
	});

	commandBus.on('transport:reconnecting', () => {
		uiDialogs.closeDialog('connect', 'reconnect');
		uiDialogs.displayDialog('connect', '1', language.connecting, language.reconnectingWait);
	});

	commandBus.on('client:connected', () => {
		// UI-only logic: close connection dialogs
		uiDialogs.closeDialog('connect', '1');
		uiDialogs.closeDialog('connect', 'reconnect');
	});

	commandBus.on('client:disconnected', (data) => {
		// UI-only logic: respond to disconnection
		// ChatIntegrator layer has already handled cleanup via chat:connectionDisconnected
		console.log('UI: Client disconnected:', data.reason);
	});

	commandBus.on('chat:connected', (data) => {
		$('#input').focus();
		const openChannels = uiState.channels.map(c => c.name);
		const channels = [...new Set([...(data.channels || []), ...openChannels])];
		if (channels.length > 0) {
			commandBus.emit('chat:requestJoinChannels', { channels });
		}
	});

	commandBus.on('client:disconnected', (data) => {
		uiDialogs.updateHistory();
		for (const chan of uiState.channels) {
			chan.part();
			chan.appendMessage(language.messagePatterns.selfDisconnected, [$$.niceTime(), he(data.reason)]);
		}
		for (const query of uiState.queries) {
			query.appendMessage(language.messagePatterns.selfDisconnected, [$$.niceTime(), he(data.reason)]);
		}
		uiState.statusWindow.appendMessage(language.messagePatterns.selfDisconnected, [$$.niceTime(), he(data.reason)]);
	});

	commandBus.on('client:userQuit', (data) => {
		const button = [ {
			text: language.reconnect,
			click: function() {
				commandBus.emit('chat:requestReconnect');
			}
		} ];
		uiDialogs.displayDialog('connect', 'reconnect', language.disconnected, `<p>${  language.disconnectOnRequest  }</p>`, button);
	});

	commandBus.on('client:joinChannels', () => {
		// This is called by client:processOwnChannelList in chat_integrator.js
		// But gateway.joinChannels() is removed from gateway_def.js
		// UI should not trigger this directly
		console.warn('UI should not call client:joinChannels directly');
	});

	// Status window message handlers
	commandBus.on('client:welcome', (data) => {
		// Display RPL_WELCOME (001) message in status window
		uiState.statusWindow.appendMessage(language.messagePatterns.motd, [$$.niceTime(), he(data.message)]);

		// Set initial page title with confirmed nick
		if (data.target) {
			document.title = `${he(data.target)  } @ ${  mainSettings.networkName}`;
		}
	});

	commandBus.on('server:motdLine', (data) => {
		// Display MOTD line in status window
		const message = $$.colorize(data.line);
		uiState.statusWindow.appendMessage(language.messagePatterns.motd, [$$.niceTime(), message]);
	});

	/* DEPRECATED: Now handled by message:received event
commandBus.on('client:notice', function(data) {
            // Handle NOTICE messages - check for NickServ and display appropriately
            var senderNick = data.from;
            var ident = data.ident || '';
            var host = data.host || '';
            var target = data.target;
            var message = data.message;

            // Check if it's from NickServ - ALL NickServ messages should appear in dialogs
            if(senderNick && senderNick.toLowerCase() == 'nickserv'){
                // Construct message object that services.nickservMessage expects
                var msgObj = {
                    sender: { nick: senderNick },
                    text: message
                };
                var handled = services.nickservMessage(msgObj);
                // If not recognized by services, show generic dialog with the message
                if(!handled) {
                    uiDialogs.displayDialog('notice', 'nickserv', 'NickServ', $$.colorize(message));
                }
                return; // All NickServ messages handled via dialogs
            }
            // Check if it's from ChanServ - ALL ChanServ messages should appear in dialogs
            if(senderNick && senderNick.toLowerCase() == 'chanserv'){
                var msgObj = {
                    sender: { nick: senderNick },
                    text: message
                };
                var handled = services.chanservMessage(msgObj);
                // If not recognized by services, show generic dialog with the message
                if(!handled) {
                    uiDialogs.displayDialog('notice', 'chanserv', 'ChanServ', $$.colorize(message));
                }
                return; // All ChanServ messages handled via dialogs
            }

            // Display notice in appropriate window
            // Check if this is a server notice (no user info) or user notice
            var isServerNotice = !ident || !host;

            if(target.indexOf('#') == 0) { // Channel notice
                var chan = uiTabs.findChannel(target);
                if(chan){
                    if(isServerNotice){
                        // Server notice - use motd format (just time and message, no "Disconnected" text)
                        chan.appendMessage(language.messagePatterns.motd, [$$.niceTime(), $$.colorize(message)]);
                    } else {
                        chan.appendMessage(language.messagePatterns.notice, ['', '', $$.niceTime(), he(senderNick), he(ident), he(host), $$.colorize(message)]);
                    }
                } else {
                    uiState.statusWindow.appendMessage(language.messagePatterns.motd, [$$.niceTime(), $$.colorize(message)]);
                }
            } else { // Private notice
                if(isServerNotice){
                    // Server notice - show in status window with motd format
                    uiState.statusWindow.appendMessage(language.messagePatterns.motd, [$$.niceTime(), $$.colorize(message)]);
                } else {
                    var query = uiTabs.findQuery(senderNick);
                    if(query){
                        query.appendMessage(language.messagePatterns.notice, ['', '', $$.niceTime(), he(senderNick), he(ident), he(host), $$.colorize(message)]);
                    } else {
                        uiState.statusWindow.appendMessage(language.messagePatterns.notice, ['', '', $$.niceTime(), he(senderNick), he(ident), he(host), $$.colorize(message)]);
                        uiState.statusWindow.markBold();
                    }
                }
            }
        });
        */

	commandBus.on('client:myNickChanged', (data) => {
		const html = `<p>${  language.yourCurrentNickIs  } <b>${  data.newNick  }</b></p>`;
		uiDialogs.displayDialog('warning', 'warning', language.warning, html);
	});

	commandBus.on('chat:nickInUse', (data) => {
		let html = `<p>${  language.nickname  } <b>${  he(data.nick)  }</b>${  language.isAlreadyUsedBySomeone  }</p>`;
		if (!data.duringRegistration) {
			html += `<p>${  language.yourCurrentNickIs  }<b>${  he(data.currentNick)  }</b>.</p>`;
		}
		uiDialogs.displayDialog('warning', 'warning', language.warning, html);
		uiState.statusWindow.appendMessage(language.messagePatterns.nickInUse, [$$.niceTime(data.time), he(data.nick)]);
	});

	// New listeners for chat user events
	commandBus.on('chat:userUpdated', (data) => {
		// Note: Nicklist updates are handled by chat:channelMemberListChanged
		// and chat:channelMemberUpdated events, which are emitted by the
		// ChannelMemberList when a member's underlying user changes.
		// This event is for other UI updates that might need user changes.

		// When avatar metadata is refreshed, allow it to be shown again
		if (data.updatedField === 'avatar' && data.user) {
			delete uiState.disabledAvatarIds[data.user.id];
		}

		// Update queries if the user has a query window open
		for (const query of uiState.queries) {
			if (query && query.user && query.user.id === data.user.id) {
				// Query UI updates for user changes could go here
			}
		}
	});

	commandBus.on('user:stateCleared', () => {
		$('.setAvatar').hide();
		$('.avatarCapability').hide();
	});

	commandBus.on('chat:clientCanSetAvatar', () => {
		$('.setAvatar').show();
		$('.avatarCapability').show();
	});

	commandBus.on('chat:meAvatarMetadataUpdated', (data) => {
		if (settings.get('avatar')) { // Check setting directly in display layer
			disp.avatarChanged(); // Pure UI function
		}
	});

	commandBus.on('chat:meRegisteredStatusUpdated', (data) => {
		if (data.registered) {
			$('#nickRegister').hide();
			$('.nickRegistered').show();
		} else {
			$('#nickRegister').show();
			$('.nickRegistered').hide();
		}
	});

	// Handle channel member list changes - show/hide operActions for initial join
	commandBus.on('chat:channelMemberListChanged', (data) => {
		// Check if a member was added and it's the current user
		if (data.type === 'add' && data.member && data.member.id === connection.chat.me.userRef.id) {
			const channel = uiTabs.findChannel(data.channelName);
			if (channel) {
				updateOperActionsDisplay(channel, data.member.level);
			}
		}
	});

	// Handle channel member updates - show/hide operActions based on own channel status changes
	commandBus.on('chat:channelMemberUpdated', (data) => {
		// Check if the updated member is the current user
		if (data.memberId === connection.chat.me.userRef.id) {
			const channel = uiTabs.findChannel(data.channelName);
			if (channel) {
				updateOperActionsDisplay(channel, data.newMember.level);
			}
		}
	});

	// Clean up operActions CSS and display message when we leave a channel
	commandBus.on('user:selfPartedChannel', (data) => {
		const channel = uiTabs.findChannel(data.channelName);
		const channelHash = md5(data.channelName);

		if (channel) {
			// Clear nicklist and mark channel as left
			channel.part();

			// Display partOwn message in the channel
			channel.appendMessage(language.messagePatterns.partOwn, [
				$$.niceTime(),
				he(data.channelName),
				channelHash
			]);

			$(`#${  channel.id  }-displayOperCss`).remove();
		}

		// Also display in status window
		uiState.statusWindow.appendMessage(language.messagePatterns.partOwn, [
			$$.niceTime(),
			he(data.channelName),
			channelHash
		]);

		// Set up click handler for rejoin link
		$(`.channelRejoin-${  channelHash}`).click(() => {
			commandBus.emit('chat:joinChannel', { channels: data.channelName });
		});
	});

	commandBus.on('chat:meNickChanged', (data) => {
		$('#usernick').text(he(data.newNick));
		document.title = `${he(data.newNick)  } @ ${  mainSettings.networkName}`;
		if (!data.silent) {
			for (const chan of uiState.channels) {
				chan.appendMessage(language.messagePatterns.nickChangeOwn, [$$.niceTime(), he(data.newNick)]);
			}
		}
		// Also trigger the old client:myNickChanged if it's still used for a dialog
		ircEvents.emit('client:myNickChanged', { oldNick: data.oldNick, newNick: data.newNick });
	});

	commandBus.on('chat:userNickChanged', ({ oldNick, newNick, user, time }) => {
		// user = The updated user object

		// Update query if the nick changed is a query target
		const query = uiTabs.findQuery(oldNick); // Find query by oldNick as tabs might not be updated yet
		if (query) {
			// The Query.changeNick method (in gateway_tabs.js) updates its own UI,
			// and internally calls commandBus.emit('chat:requestSwitchTab') and 'chat:requestRemoveQuery'
			// This means Query.changeNick itself handles the UI-level consequences of a nick change for a query.
			// We pass the updated user object to Query.changeNick
			query.changeNick(newNick, user); // Modified Query.changeNick to accept user object
		}

		// Append nick change message to relevant channels
		// Note: Nicklist updates are handled automatically via chat:channelMemberListChanged events
		for (const channelTab of uiState.channels) {
			// Check if the user is in this channel's nicklist
			if (channelTab && channelTab.nicklist && channelTab.nicklist.uiMembers.has(user.id)) {
				// Only show message if it's not our own nick, and setting allows
				if (user.id !== connection.chat.me.userRef.id && !$('#showNickChanges').is(':checked')) {
					channelTab.appendMessage(language.messagePatterns.nickChange, [$$.niceTime(time), he(oldNick), he(newNick)]);
				}
			}
		}
	});

	// Connection timeout - always show dialog with manual reconnect option
	// (auto-reconnect only applies to websocket/server errors, not connection timeout)
	commandBus.on('chat:connectionTimeoutExpired', (data) => {
		uiDialogs.closeDialog('connect', '1');
		const button = [ {
			text: language.reconnect,
			click: function() {
				commandBus.emit('chat:requestStopAndReconnect', { reason: language.connectingTookTooLong });
			}
		} ];
		uiDialogs.displayDialog('connect', 'reconnect', language.connecting, `<p>${  language.connectingTooLong  }</p>`, button);
	});

	// Handle reconnection logic based on UI settings
	commandBus.on('client:connectionError', (data) => {
		if (settings.get('autoReconnect')) {
			connection.transport.reconnect();
		} else {
			uiDialogs.displayReconnect();
		}
	});

	// NickServ ghost succeeded - nick is no longer in use
	commandBus.on('client:nickGhostComplete', () => {
		uiDialogs.displayDialog('warning', 'warning', language.warning, language.nickNoLongerInUse);
	});

	// ChatIntegrator request to reconnect - actually trigger the reconnection
	commandBus.on('chat:requestReconnect', (data) => {
		connection.transport.reconnect();
	});

	// NickServ RECOVER caused disconnect — prompt user to reconnect manually
	commandBus.on('user:recoveredByNickServ', (data) => {
		const button = [{
			text: language.reconnect,
			click: function() {
				commandBus.emit('chat:requestReconnect');
				$(this).dialog('close');
			}
		}];
		uiDialogs.displayDialog('connect', 'nickserv-recover',
			language.disconnected,
			language.nickservRecoverDisconnected,
			button);
	});

	// User requested to open a query window
	commandBus.on('user:queryRequested', (data) => {
		uiTabs.findOrCreate(data.nick, data.setActive);
	});

	// Incoming typing indicator from a remote user
	commandBus.on('user:typingActivity', (data) => {
		const tab = uiTabs.find(data.dest);
		if (!tab || !tab.typing) return;
		if (data.mode === 'active') {
			tab.typing.start(data.user, 30);
		} else {
			tab.typing.stop(data.user);
		}
	});

	// User setting information (e.g., user modes)
	commandBus.on('user:settingInfo', (data) => {
		const isSelf = (connection.chat.me.userRef && data.nick === connection.chat.me.userRef.nick) || data.nick === connection.chat.me.nick;

		if (isSelf) {
			// Display for current user
			const settingDisplay = data.settingString || language.none;
			uiState.statusWindow.appendMessage(language.messagePatterns.selfUserSettingInfo, [
				$$.niceTime(data.time),
				he(data.nick),
				settingDisplay
			]);
		} else {
			// For other users - not yet implemented
			console.log('UI: Received user:settingInfo for another user:', data.nick, '- not yet implemented');
		}
	});

	// Channel list started loading
	commandBus.on('server:listStart', (data) => {
		// Only clear the list window for unlabeled (full list) requests;
		// labeled requests are sidebar requests and must not disturb the window
		if (!data.label && uiState.listWindow) {
			uiState.listWindow.clearData(); // Show "Loading, please wait..."
		}
	});

	// List window closed - clear reference so future requests create a fresh window
	commandBus.on('listWindow:removed', (data) => {
		uiState.listWindow = null;
	});

	// Another browser tab is already connected - block this instance
	commandBus.on('client:sessionConflict', (data) => {
		let html = `${language.alreadyConnectedAs  }<strong>${  he(data.nick)  }</strong>! ${  language.cantOpenMultipleInstances}`;
		if (data.suggestedChannel && data.suggestedChannel !== '#') {
			html += `<br>${  language.goToTabToJoin  }<strong>${  he(data.suggestedChannel)  }</strong>.`;
		}
		uiDialogs.displayDialog('connect', '0', language.alreadyConnected, html);
	});

	// Connected tab was asked by another tab to join a channel
	commandBus.on('client:tabChannelJoinRequest', (data) => {
		const chan = data.channelName;
		if (uiTabs.findChannel(chan)) return; // already in this channel
		const html = `${language.otherTabWantsToJoin  }<strong>${  he(chan)  }</strong>.`;
		const buttons = [ {
			text: language.cancel,
			click: function() { $(this).dialog('close'); }
		}, {
			text: language.join,
			click: function() {
				commandBus.emit('chat:joinChannel', { channels: chan });
				$(this).dialog('close');
			}
		} ];
		uiDialogs.displayDialog('confirm', 'join', language.confirm, html, buttons);
	});

	// CTCP reply received
	commandBus.on('protocol:ctcpReply', (data) => {
		// Filter out our own CTCP replies (automatic responses, not interesting to display)
		const sender = data.user || { nick: data.fromNick };

		if (connection.chat.me.userRef && (sender.id === connection.chat.me.userRef.id || sender.nick === connection.chat.me.userRef.nick)) {
			console.log('UI: Filtering out own CTCP reply from', sender.nick);
			return; // Don't display our own CTCP replies
		}

		const query = uiTabs.findQuery(data.fromNick);
		const target = query || uiState.statusWindow;

		target.appendMessage(language.messagePatterns.ctcpReply, [
			$$.niceTime(),
			he(data.fromNick),
			$$.colorize(data.fullText)
		]);

		// Special handling for VERSION replies - show in dialog
		if (data.ctcpType.toLowerCase() === 'version' && data.ctcpText) {
			uiDialogs.displayDialog('whois', data.fromNick,
				language.userInformation + he(data.fromNick),
				`${language.userSoftware  }<b>${  he(data.fromNick)  }</b>:<br>${  he(data.ctcpText)}`
			);
		}
	});

	// CTCP VERSION request received
	commandBus.on('ctcp:versionRequest', (data) => {
		uiState.statusWindow.appendMessage(language.messagePatterns.ctcpRequest, [
			$$.niceTime(),
			he(data.sender),
			'VERSION'
		]);
	});

	// CTCP USERINFO request received
	commandBus.on('ctcp:userinfoRequest', (data) => {
		uiState.statusWindow.appendMessage(language.messagePatterns.ctcpRequest, [
			$$.niceTime(),
			he(data.sender),
			'USERINFO'
		]);
	});

	// CTCP REFERER request received
	commandBus.on('ctcp:refererRequest', (data) => {
		uiState.statusWindow.appendMessage(language.messagePatterns.ctcpRequest, [
			$$.niceTime(),
			he(data.sender),
			'REFERER'
		]);
	});

	// Channel list completed - populate either the list window or the sidebar panel
	commandBus.on('list:smallListComplete', (data) => {
		if (data.label) {
			// Labeled response: this is a sidebar (small list) request - populate sidebar
			if ($('#chlist-body').is(':visible')) {
				const sorted = data.smallListData.slice().sort((a, b) => { return b[1] - a[1]; });
				let html = '<p>'
                        + `<span class="chlist_button" onclick="commandBus.emit('chat:listChannels', {})">${  language.fullList  }</span> `
                        + `<span class="chlist_button" onclick="uiTabs.refreshChanList()">${  language.refresh  }</span>`
                        + `</p><p>${  language.largestChannels  }:</p><table>`;
				sorted.forEach((item) => {
					html += `<tr title="${  he(item[2])  }">`
                            + `<td class="chname" data-channel="${  he(item[0])  }">${  he(item[0])  }</td>`
                            + `<td class="chusers">${  he(item[1])  }</td>`
                            + '</tr>';
				});
				html += '</table>';
				$('#chlist-body').html(html);
			}
		} else if (uiState.listWindow) {
			// Unlabeled response with window open: full list - populate window
			data.smallListData.forEach((item) => {
				uiState.listWindow.addEntry(item[0], item[1], item[2]);
			});
			uiState.listWindow.render();
		} else if ($('#chlist-body').is(':visible')) {
			// Unlabeled fallback (no labeled-response cap): populate sidebar
			const sorted = data.smallListData.slice().sort((a, b) => { return b[1] - a[1]; });
			let html = '<p>'
                    + `<span class="chlist_button" onclick="commandBus.emit('chat:listChannels', {})">${  language.fullList  }</span> `
                    + `<span class="chlist_button" onclick="uiTabs.refreshChanList()">${  language.refresh  }</span>`
                    + `</p><p>${  language.largestChannels  }:</p><table>`;
			sorted.forEach((item) => {
				html += `<tr title="${  he(item[2])  }">`
                        + `<td class="chname" data-channel="${  he(item[0])  }">${  he(item[0])  }</td>`
                        + `<td class="chusers">${  he(item[1])  }</td>`
                        + '</tr>';
			});
			html += '</table>';
			$('#chlist-body').html(html);
		}
	});

	// WHOIS information complete - display dialog
	commandBus.on('user:whoisComplete', ({ data, nick }) => {
		console.log('[WHOIS-DEBUG] user:whoisComplete event received:', { data, nick });
		console.log('[WHOIS-DEBUG] data:', data, 'nick:', nick);
		let html = '';

		// Basic user info (nick!ident@host and realname)
		if (data.ident && data.host) {
			html += `<p class='whois'><span class='info'>${  language.fullMask  }:</span><span class='data'> ${
				he(nick)  }!${  he(data.ident)  }@${  he(data.host)  }</span></p>`;
		}
		if (data.realname) {
			html += `<p class='whois'><span class='info'>${  language.realname  }:</span><span class='data'> ${
				he(data.realname)  }</span></p>`;
		}

		// Server info
		if (data.server) {
			html += `<p class='whois'><span class='info'>${  language.server  }:</span><span class='data'>${
				he(data.server)}`;
			if (data.serverInfo) {
				html += ` ${  he(data.serverInfo)}`;
			}
			html += '</span></p>';
		}

		// Operator status
		if (data.operatorInfo) {
			html += '<p class=\'whois\'><span class=\'info\'><br /></span><span class=\'data admin\'>' +
                    `<b class='admin'>${  language.ircop  }</b></span></p>`;
		}

		// Special status (helpop, network service, etc.)
		if (data.specialStatus) {
			html += `<p class='whois'><span class='info'><br /></span><span class='data'>${
				he(data.specialStatus)  }</span></p>`;
		}

		// Account (logged in as)
		if (data.account) {
			html += `<p class='whois'><span class='info'>${  language.accountName  }:</span><span class='data'>${
				he(data.account)  }</span></p>`;
		}

		// Registered nickname
		if (data.isRegistered) {
			html += `<p class='whois'><span class='info'><br /></span><span class='data'>${
				language.nickRegistered  }</span></p>`;
		}

		// Bot status
		if (data.isBot) {
			html += `<p class='whois'><span class='info'><br /></span><span class='data'>${
				language.isBotHtml  }</span></p>`;
		}

		// Channels
		if (data.channels && data.channels.length > 0) {
			const chanHtml = data.channels.map((ch) => {
				return he(ch);
			}).join(' ');
			html += `<p class='whois'><span class='info'>${  language.channels  }:</span><span class='data'> ${
				chanHtml  }</span></p>`;
		}

		// Idle time and signon
		if (data.idleSeconds !== undefined) {
			const sec = data.idleSeconds % 60;
			const min = Math.floor(data.idleSeconds / 60) % 60;
			const hour = Math.floor(data.idleSeconds / 3600);
			html += `<p class='whois'><span class='info'>${  language.idle  }</span><span class='data'>${
				hour > 0 ? `${hour  } ${  language.hoursShort  } ` : ''
			}${min > 0 ? `${min  } ${  language.minutesShort  } ` : ''
			}${sec  } ${  language.secondsShort  }</span></p>`;
		}
		if (data.signOn) {
			html += `<p class='whois'><span class='info'>${  language.signedOn  }:</span><span class='data'>${
				$$.parseTime(data.signOn)  }</span></p>`;
		}

		// Secure connection (TLS)
		if (data.isSecure) {
			html += `<p class='whois'><span class='info'>TLS:</span><span class='data'>${
				language.hasSecureConnection  }</span></p>`;
		}

		// Country
		if (data.country) {
			html += `<p class='whois'><span class='info'>${  language.country  }:</span><span class='data'>${
				he(data.country)  }</span></p>`;
		}

		// Host info (actual host/IP for IRC operators)
		if (data.hostInfo) {
			html += `<p class='whois'><span class='info'><br /></span><span class='data'>${
				he(data.hostInfo)  }</span></p>`;
		}

		// User modes (visible to IRC operators)
		if (data.userModes) {
			html += `<p class='whois'><span class='info'><br /></span><span class='data'>${
				he(data.userModes)  }</span></p>`;
		}

		// Display the dialog
		console.log('[WHOIS-DEBUG] html length:', html.length, 'html:', html.substring(0, 100));
		if (html) {
			// Don't show own WHOIS unless setting enabled
			if (nick.toLowerCase() === connection.chat.me.userRef.nick.toLowerCase() && !uiState.displayOwnWhois) {
				return;
			}
			console.log('[WHOIS-DEBUG] Calling displayDialog with:', 'whois', nick, language.userInformation + he(nick));
			try {
				uiDialogs.displayDialog('whois', nick, language.userInformation + he(nick), html);
				console.log('[WHOIS-DEBUG] displayDialog called successfully');
			} catch (e) {
				console.error('[WHOIS-DEBUG] Error calling displayDialog:', e);
			}
		} else {
			console.log('[WHOIS-DEBUG] No HTML generated for WHOIS dialog - data was empty');
		}
	});

	/**
         * Helper function to display ban/except/invex list dialogs
         * @param {string} mode - 'b', 'e', or 'I'
         * @param {Object} data - Event data with channelName, entries
         */
	function displayListDialog(mode, data) {
		const channel = uiTabs.findChannel(data.channelName);
		if (!channel) return;
		const channelId = channel.id;
		let listName;
		const modeChar = mode;

		// Get list name from language
		switch (mode) {
			case 'b': listName = language.ofBans; break;
			case 'e': listName = language.ofExcepts; break;
			case 'I': listName = language.ofInvites; break;
		}

		const dialogId = `list-${  mode  }-${  data.channelName}`;

		// Check if list is empty
		if (!data.entries || data.entries.length === 0) {
			uiDialogs.displayDialog('list', dialogId,
				language.listOf + listName + language.onChannel + he(data.channelName),
				language.listIsEmpty);
			return;
		}

		// Build table HTML
		let html = '<div class="beIListContents"><table><tr>';
		html += `<th>${  language.mask  }</th>`;
		html += `<th>${  language.setBy  }</th>`;
		html += `<th>${  language.date  }</th>`;

		// Add "Applies To" column only for bans
		if (mode === 'b') {
			html += `<th>${  language.appliesTo  }</th>`;
		}

		html += '</tr>';

		// Add each entry as a table row
		for (const entry of data.entries) {
			html += '<tr>';
			html += `<td>${  he(entry.mask)  }</td>`;
			html += `<td>${  he(entry.setBy || '')  }</td>`;
			html += `<td>${  $$.parseTime(entry.setAt)  }</td>`;

			// Add "Applies To" column for bans
			if (mode === 'b') {
				html += '<td>';
				try {
					const affected = localStorage.getItem(`banmask-${  md5(entry.mask)}`);
					if (affected) {
						html += he(affected);
					}
				} catch (e) {}
				html += '</td>';
			}

			// Add remove button (visible only to channel operators)
			html += `<td class="${  channelId  }-operActions" style="display:none">`;
			html += `<button id="un${  mode  }-${  channelId  }-${  md5(entry.mask)  }">${  language.remove  }</button>`;
			html += '</td>';

			html += '</tr>';
		}

		html += '</table></div>';

		// Display the dialog
		uiDialogs.displayDialog('list', dialogId,
			language.listOf + listName + language.onChannel + he(data.channelName),
			html);

		// Attach click handlers to remove buttons
		for (const entry of data.entries) {
			(function(mask, channelName, mode, dialogId) {
				$(`#un${  mode  }-${  channelId  }-${  md5(mask)}`).click(() => {
					// Request mode change to remove this entry
					commandBus.emit('chat:requestModeChange', {
						target: channelName,
						modeString: `-${  mode  } ${  mask}`
					});
					// Re-request the list to update the dialog
					commandBus.emit('chat:requestModeList', {
						channelName: channelName,
						mode: mode
					});
					// Close the dialog
					uiDialogs.closeDialog('list', dialogId);
				});
			})(entry.mask, data.channelName, mode, dialogId);
		}
	}

	// Ban list complete - display dialog
	commandBus.on('channel:banListComplete', (data) => {
		displayListDialog('b', data);
	});

	// Except list complete - display dialog
	commandBus.on('channel:exceptListComplete', (data) => {
		displayListDialog('e', data);
	});

	// Invite list complete - display dialog
	commandBus.on('channel:inviteListComplete', (data) => {
		displayListDialog('I', data);
	});

}

/**
 * Initializes UI keyboard bindings, input handlers, and window lifecycle.
 * Called once on system:ready after all scripts and translations have loaded.
 */
function initUiBindings() {
	$('#chatbox').click(() => {
		uiHelpers.inputFocus();
	});
	$('#nicklist').click(() => {
		uiHelpers.inputFocus();
	});

	// Mobile UX
	const isMobile = window.matchMedia('(max-width: 767px)').matches;

	if (isMobile) {
		// Hide right-col (status is the initial tab; shown only for channel tabs).
		// Pre-apply the fully-collapsed state so the first switchTab().show() is correct:
		// hide all content, show the toggle button — no reflow visible on first appearance.
		$('#nicklist').hide();
		$('#chstats').hide();
		$('#nickopts').css('display', 'none');
		$('#chlist').css('display', 'none');
		$('#nicklist-closed').show();
		$('#right-col').hide();
		uiState.nickListVisibility = false;

		// Keep body height in sync with the visual viewport (the portion of the screen
		// not covered by the on-screen keyboard or browser chrome). 100dvh is not
		// reliable on older browsers; visualViewport.resize is the authoritative source.
		const syncBodyHeight = () => {
			const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
			document.body.style.height = `${h}px`;
		};
		if (window.visualViewport) {
			window.visualViewport.addEventListener('resize', syncBodyHeight);
		}
		syncBodyHeight();
	}

	// Chat area: swipe left/right to switch tabs; double-tap to toggle nicklist
	let lastChatTap = 0;
	let chatTouchX = 0;
	let chatTouchY = 0;
	document.getElementById('chatbox').addEventListener('touchstart', (e) => {
		chatTouchX = e.touches[0].clientX;
		chatTouchY = e.touches[0].clientY;
	}, { passive: true });
	document.getElementById('chatbox').addEventListener('touchend', (e) => {
		const dx = e.changedTouches[0].clientX - chatTouchX;
		const dy = e.changedTouches[0].clientY - chatTouchY;
		const now = Date.now();
		if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
			// Horizontal swipe — switch tab
			if (dx < 0) {
				uiTabs.nextTab();
			} else {
				uiTabs.prevTab();
			}
		} else if (Math.abs(dx) < 15 && Math.abs(dy) < 15) {
			// Tap with minimal movement — check for double-tap
			if (now - lastChatTap < 300) {
				uiNicklist.nickListToggle();
				e.preventDefault();
				lastChatTap = 0;
			} else {
				lastChatTap = now;
			}
		}
	});

	// Swipe left/right on the tab bar to switch tabs
	let tabSwipeX = 0;
	let tabSwipeY = 0;
	document.getElementById('tab-wrapper').addEventListener('touchstart', (e) => {
		tabSwipeX = e.touches[0].clientX;
		tabSwipeY = e.touches[0].clientY;
	}, { passive: true });
	document.getElementById('tab-wrapper').addEventListener('touchend', (e) => {
		const dx = e.changedTouches[0].clientX - tabSwipeX;
		const dy = e.changedTouches[0].clientY - tabSwipeY;
		// Require at least 40px horizontal movement, more horizontal than vertical
		if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
			if (dx < 0) {
				uiTabs.nextTab();
			} else {
				uiTabs.prevTab();
			}
		}
	}, { passive: true });

	window.addEventListener('resize', () => {
		if (isMobile && !window.visualViewport) {
			// Fallback for browsers without visualViewport: sync from window.innerHeight
			document.body.style.height = `${window.innerHeight}px`;
		}
		const tab = uiTabs.getActive();
		if (tab) {
			tab.restoreScroll();
		} else if (uiState.statusWindow) {
			uiState.statusWindow.restoreScroll();
		}
	});
	$('#input').keydown((e) => {
		if (e.which == 13 || e.which == 38 || e.which == 40 || e.which == 9) {
			e.preventDefault();
		}
	});
	$('#input').keyup((e) => {
		if (e.which == 13) {
			if ($('#input').val() != '') {
				uiInput.enterPressed();
			}
			e.preventDefault();
		} else if (e.which == 38) { //strzalka w gore
			e.preventDefault();
			uiInput.arrowPressed('up');
		} else if (e.which == 40) { // strzalka w dol
			e.preventDefault();
			uiInput.arrowPressed('down');
		} else if (e.which == 9) { // TAB
			uiHelpers.doComplete();
			e.preventDefault();
			return false;
		} else if (!e.altKey) {
			uiInput.inputKeypress();
		}
		if (e.which != 9) { // nie TAB
			uiState.completion.repeat = 0;
			uiState.completion.string = '';
			uiState.completion.array = [];
		}
	});

	// Document-level keyboard shortcuts for tab switching
	document.addEventListener('keydown', (e) => {
		// Only handle Alt key (not AltGr which is Alt+Ctrl)
		if (!e.altKey || e.ctrlKey || e.metaKey) {
			return;
		}

		let handled = false;
		let tabName = null;

		// Alt+1 through Alt+9 → tabs 1-9
		if (e.which >= 49 && e.which <= 57) {
			const tabIndex = e.which - 48;
			tabName = getTabNameByIndex(tabIndex);
			handled = true;
		}
		// Alt+0 → tab 10
		else if (e.which === 48) {
			tabName = getTabNameByIndex(10);
			handled = true;
		}
		// Alt+Q through Alt+O → tabs 11-19
		else if (e.which === 81) { // Q
			tabName = getTabNameByIndex(11);
			handled = true;
		}
		else if (e.which === 87) { // W
			tabName = getTabNameByIndex(12);
			handled = true;
		}
		else if (e.which === 69) { // E
			tabName = getTabNameByIndex(13);
			handled = true;
		}
		else if (e.which === 82) { // R
			tabName = getTabNameByIndex(14);
			handled = true;
		}
		else if (e.which === 84) { // T
			tabName = getTabNameByIndex(15);
			handled = true;
		}
		else if (e.which === 89) { // Y
			tabName = getTabNameByIndex(16);
			handled = true;
		}
		else if (e.which === 85) { // U
			tabName = getTabNameByIndex(17);
			handled = true;
		}
		else if (e.which === 73) { // I
			tabName = getTabNameByIndex(18);
			handled = true;
		}
		else if (e.which === 79) { // O
			tabName = getTabNameByIndex(19);
			handled = true;
		}
		// Alt+Left Arrow → previous tab
		else if (e.which === 37) {
			uiTabs.prevTab();
			handled = true;
		}
		// Alt+Right Arrow → next tab
		else if (e.which === 39) {
			uiTabs.nextTab();
			handled = true;
		}

		// Switch to tab if we found one
		if (handled) {
			e.preventDefault();
			if (tabName) {
				uiTabs.switchTab(tabName);
			}
		}
	});

	try {
		$('#not_connected_wrapper').fadeIn(200);
	} catch (e) {
		browserTooOld();
	}
	dnick = he(connection.chat.me.nick);
	if (connection.chat.me.nick == '1') {
		dnick = '';
		document.title = `${language.unknown  } @ ${  mainSettings.networkName}`;
	}
	window.addEventListener('beforeunload', () => {
		if (getConnectionStatus() != 'disconnected') {
			if (settings.get('autoDisconnect')) {
				commandBus.emit('chat:requestQuit', { message: language.userClosedPage });
				commandBus.emit('chat:setUserQuit', { status: true });
			} else {
				uiDialogs.clickQuit(); // This shows a dialog which handles quit or cancel
				return language.youreStillConnected;
			}
		}
	});
}


// Register UI system:ready handlers — called once all scripts and translations are loaded
ircEvents.on('system:ready', initDisplayListeners);
ircEvents.on('system:ready', initUiBindings);
