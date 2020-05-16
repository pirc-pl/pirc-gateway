<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">

	<head>
		<title>{$nick} @ PIRC.pl</title>
		<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
		<link rel="stylesheet" href="/styles/jquery-ui.theme.css" />
		<link rel="stylesheet" href="/styles/jquery-ui.structure.css" />
		<link rel="stylesheet" href="/styles/gateway_def.css{$random_string}" />
		{$additionalcss}
		<script type="text/javascript">
			var guser = {
				'nick': '{$nick}',
				'channels': ['{$channel}'],
				'nickservpass': '',
				'nickservnick': ''
			};
			var sessionid = "{$sid}";
			var gatewayVersion = "{$gateway_version}";
			var oldGatewayHtml = "{$old_gateway_html}";
			var token = "{$itoken}";
			var server = "{$server}";
		</script>
		<script type="text/javascript" src="/js/md5.js"></script>
		<script type="text/javascript" src="/js/foreach.js"></script>
		<script type="text/javascript" src="/js/jquery-1.12.3.min.js"></script>
		<script type="text/javascript" src="/js/jquery.sprintf.js"></script>
		<script type="text/javascript" src="/js/jquery.browser.min.js"></script>
		<script type="text/javascript" src="/js/jquery-ui.min.js"></script>
		<script type="text/javascript" src="/js/base64.js"></script>
		<script type="text/javascript" src="/js/language.js{$random_string}"></script>
		<script type="text/javascript" src="/js/gateway_conn.js{$random_string}"></script>
		<script type="text/javascript" src="/js/gateway_functions.js{$random_string}"></script>
		<script type="text/javascript" src="/js/gateway_ignore.js{$random_string}"></script>
		<script type="text/javascript" src="/js/gateway_services.js{$random_string}"></script>
		<script type="text/javascript" src="/js/gateway_cmd_binds.js{$random_string}"></script>
		<script type="text/javascript" src="/js/gateway_user_commands.js{$random_string}"></script>
		<script type="text/javascript" src="/js/gateway_tabs.js{$random_string}"></script>
		<script type="text/javascript" src="/js/geoip.js{$random_string}"></script>
		<script type="text/javascript" src="/js/gateway_cmds.js{$random_string}"></script>
		<script type="text/javascript" src="/js/gateway_def.js{$random_string}"></script>
		<script type="text/javascript" src="/js/gateway_users.js{$random_string}"></script>
		<script type="text/javascript" src="/js/emoji.js"></script>
		<script type="text/javascript" src="/js/g-emoji-element.js"></script>
		{$add_js}
	</head>
