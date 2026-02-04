// js/gateway_domain.js
// This file will contain listeners for domain-level events that orchestrate core application logic,
// separating it from protocol handling (gateway_cmd_binds.js) and UI rendering (gateway_display.js).

ircEvents.on('client:processOwnChannelList', function(data) {
    var nick = data.nick;
    var channelNames = data.channelNames;

    // This logic was moved from gateway_cmd_binds.js
    gateway.connectStatus = '001'; // This is a logical update, not UI
    if(nick == guser.nick){
        channelNames.forEach( function(channame){
            var channel = channame.match(/#[^ ]*/);
            if(channel){
                if(gateway.findChannel(channel[0])) {
                    gateway.findChannel(channel[0]).rejoin();
                } else {
                    gateway.findOrCreate(channel[0]);
                }
                ircCommand.channelNames(channel[0]);
                ircCommand.channelTopic(channel[0]);
                ircCommand.who(channel[0]);
            	}
            });
            
            ircEvents.on('channel:requestChatHistory', function(data) {
                    ircCommand.channelHistory(data.channelName, data.limit);
                });
                
                ircEvents.on('channel:requestWho', function(data) {
                    ircCommand.who(data.channelName);
                });``    }
});