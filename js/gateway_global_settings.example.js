var mainSettings = {
	'networkName': 'PIRC.pl',
	'server': 'wss://wss.pirc.pl:8082/',
	'supportAvatars': true, // requires metadata
	'avatarUploadUrl': 'https://users.pirc.pl/image-upload/image-upload.php', // set to null to disable avatar API
	'avatarDeleteUrl': 'https://users.pirc.pl/image-upload/image-delete.php',
	'extjwtService': false,
	'defaultName': 'Użytkownik bramki PIRC.pl',
	'adminMail': 'abuse'+String.fromCharCode(64)+'pirc.pl',
	'rulesUrl': 'https://pirc.pl/teksty/zasady/',
	'version': 'GIT',
	'oldGatewayHtml': '<a href=\"https://widget01.mibbit.com/?promptPass=true&settings=10db5282f0641bc847a88fc71f2bc200&server=irc.pirc.pl&autoConnect=true&charset=UTF-8\">innej bramki</a> (Mibbit).', // TODO insert nick&channel
	'language': 'en',
	'timedBanMethod': '~t:minutes:', // set either '~t:minutes:' for UnrealIRCd style bans or 'ChanServ' for using /CS BAN
	'modules': [
		'mcolor' // enable only when the server supports metadata, this is not checked!
	]
};

