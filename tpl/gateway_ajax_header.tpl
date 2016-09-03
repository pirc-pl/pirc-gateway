<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">

    <head>
        <title>{$nick} @ PIRC.pl</title>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
        <link rel="stylesheet" href="/styles/gateway_def.css" />
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
			var oldGatewayUrl = "{$gateway_url}";
        </script>
        <script type="text/javascript" src="/js/md5.js"></script>
        <script type="text/javascript" src="/js/foreach.js"></script>
        <script type="text/javascript" src="/js/jquery-1.12.3.min.js"></script>
        <!--<script type="text/javascript" src="/js/jquery-1.12.3.js"></script>-->
        <script type="text/javascript" src="/js/jquery.sprintf.js"></script>
        <script type="text/javascript" src="/js/jquery.browser.min.js"></script>
        <script type="text/javascript" src="/js/jqueryui.js"></script>
        <script type="text/javascript" src="/js/base64.js"></script>
		<script type="text/javascript" src="/js/gateway_def.js"></script>
    </head>
