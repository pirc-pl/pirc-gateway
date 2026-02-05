// js/settings.js

var settings = (function() {
    var booleanSettings = [ 'showPartQuit', 'showNickChanges', 'tabsListBottom', 'showUserHostnames', 'autoReconnect', 'displayLinkWarning', 'blackTheme', 'newMsgSound', 'autoDisconnect', 'coloredNicks', 'showMode', 'dispEmoji', 'sendEmoji', 'monoSpaceFont', 'automLogIn', 'enableautomLogIn', 'save_password', 'setUmodeD', 'setUmodeR', 'noAvatars', 'biggerEmoji', 'groupEvents', 'shortModeDisplay', 'sortChannelsByJoinOrder' ];
    // Default values for boolean settings (settings not listed here default to false)
    var booleanDefaults = {
        'showPartQuit': true,
        'showNickChanges': true,
        'showUserHostnames': true,
        'autoReconnect': true,
        'displayLinkWarning': true,
        'newMsgSound': true,
        'coloredNicks': true,
        'showMode': true,
        'dispEmoji': true,
        'sendEmoji': true
    };
    var comboSettings = [ 'noticeDisplay', 'setLanguage' ];
    var numberSettings = [ 'backlogCount' ];
    var numberSettingsMinMax = {
        'backlogCount' : { 'min' : 0, 'max' : 500, 'deflt' : 15 }
    };
    var textSettings = [ 'avatar' ];
    var textSettingsValues = {}; // Cached values for text settings

    function getSettingFromDom(key) {
        if (booleanSettings.includes(key)) {
            return $('#' + key).is(':checked');
        }
        if (comboSettings.includes(key)) {
            return $('#' + key).val();
        }
        if (numberSettings.includes(key)) {
            var value = $('#' + key).val();
            if (value === '' || isNaN(parseFloat(value))) {
                return null;
            }
            return parseInt(value, 10);
        }
        if (textSettings.includes(key)) {
            return $('#' + key).val();
        }
        return null;
    }

    function saveSettingToLocalStorage(key, value) {
        try {
            if (value === null || value === undefined || value === false) {
                localStorage.removeItem(key); // Remove if false, null, or undefined
            } else {
                localStorage.setItem(key, value);
            }
        } catch(e) {
            console.error('Failed to save setting "' + key + '":', e);
        }
    }

    return {
        registerBooleanSetting: function(key) {
            if (!booleanSettings.includes(key)) {
                booleanSettings.push(key);
            }
        },

        registerComboSetting: function(key) {
            if (!comboSettings.includes(key)) {
                comboSettings.push(key);
            }
        },

        registerNumberSetting: function(key, minMaxDeflt) {
            if (!numberSettings.includes(key)) {
                numberSettings.push(key);
                if (minMaxDeflt) {
                    numberSettingsMinMax[key] = minMaxDeflt;
                }
            }
        },

        registerTextSetting: function(key) {
            if (!textSettings.includes(key)) {
                textSettings.push(key);
            }
        },

        get: function(key) {
            var value = localStorage.getItem(key);
            if (value === null) {
                if (booleanSettings.includes(key)) {
                    // Return default value if specified, otherwise false
                    return booleanDefaults[key] !== undefined ? booleanDefaults[key] : false;
                }
                if (numberSettings.includes(key) && numberSettingsMinMax[key]) return numberSettingsMinMax[key]['deflt'];
                return null;
            }
            if (booleanSettings.includes(key)) return value === 'true';
            if (numberSettings.includes(key)) return parseInt(value, 10);
            return value;
        },

        set: function(key, value) {
            // Update DOM element
            if (booleanSettings.includes(key)) {
                $('#' + key).prop('checked', value);
            } else if (comboSettings.includes(key) || numberSettings.includes(key) || textSettings.includes(key)) {
                $('#' + key).val(value);
            }
            // Save to localStorage
            saveSettingToLocalStorage(key, value);
        },

        saveFromDom: function(key) {
            var value = getSettingFromDom(key);
            if (value !== null) {
                if (numberSettings.includes(key) && numberSettingsMinMax[key]) {
                    if (value < numberSettingsMinMax[key]['min'] || value > numberSettingsMinMax[key]['max']) {
                        value = numberSettingsMinMax[key]['deflt'];
                        $('#' + key).val(value);
                    }
                }
                saveSettingToLocalStorage(key, value);
            } else if (textSettings.includes(key) && settings._textSettingsValues[key]) {
                 saveSettingToLocalStorage(key, settings._textSettingsValues[key]);
            }
        },

        saveAllFromDom: function() {
            var allSettingsKeys = [...booleanSettings, ...comboSettings, ...numberSettings, ...textSettings];
            allSettingsKeys.forEach(function(key) {
                this.saveFromDom(key);
            }.bind(this));
        },

        load: function() {
            var allSettingsKeys = [...booleanSettings, ...comboSettings, ...numberSettings, ...textSettings];
            allSettingsKeys.forEach(function(key) {
                var value = this.get(key);
                if (value !== null) {
                    if (booleanSettings.includes(key)) {
                        $('#' + key).prop('checked', value);
                    } else if (comboSettings.includes(key)) {
                        $('#' + key).val(value);
                    } else if (numberSettings.includes(key)) {
                        $('#' + key).val(value);
                    } else if (textSettings.includes(key)) {
                        $('#' + key).val(value);
                        if (key === 'avatar') {
                            settings._textSettingsValues['avatar'] = value;
                        }
                    }
                }
            }.bind(this));

            // Appearance settings (will be event-driven later)
            // For now, these are applied directly on load.
            if (settings.get('blackTheme')) {
                if($('#blackCss').length == 0) {
                    $('head').append('<link rel="stylesheet" type="text/css" href="/styles/gateway_black.css" id="blackCss">');
                }
            } else {
                $('#blackCss').remove();
            }
            if (settings.get('monoSpaceFont')) {
                if($('#monospace_font').length == 0){
                    var style = $('<style id="monospace_font">#chat-wrapper { font-family: DejaVu Sans Mono, Consolas, monospace, Symbola; } </style>');
                    $('html > head').append(style);
                }
            } else {
                $('#monospace_font').remove();
            }
            if (settings.get('noAvatars')) {
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
            if (settings.get('showUserHostnames')) {
                $('#userhost_hidden').remove();
            } else {
                if($('#userhost_hidden').length == 0){
                    var style = $('<style id="userhost_hidden">.userhost { display:none; }</style>');
                    $('html > head').append(style);
                }
            }
            if (settings.get('tabsListBottom')) {
                $('#top_menu').detach().insertAfter('#inputbox');
                if($('#tabsDownCss').length == 0) {
                    $('head').append('<link rel="stylesheet" type="text/css" href="/styles/gateway_tabs_down.css" id="tabsDownCss">');
                }
            } else {
                $('#top_menu').detach().insertAfter('#options-box');
                $('#tabsDownCss').remove();
            }
            if (settings.get('biggerEmoji')) {
                document.documentElement.style.setProperty('--emoji-scale', '3');
            } else {
                document.documentElement.style.setProperty('--emoji-scale', '1.8');
            }
            if (settings.get('automLogIn')) { // Special handling for automLogIn, depends on parent tr visibility
                $('#automLogIn').parent().parent().css('display', '');
            } else {
                $('#automLogIn').parent().parent().css('display', 'none');
            }
        },
        _textSettingsValues: textSettingsValues,
        backlogLength: 15  // Cached value for backlogCount, updated by changeSettings()
    };
})();
