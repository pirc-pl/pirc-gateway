<?php

class Module extends ModuleT {
	private static $nick = '';

	public static function run() {
		$gateway_url = '<a href=\"';
//		$gateway_url = '';
		$gateway_url .= 'https://widget01.mibbit.com/?promptPass=true&settings=10db5282f0641bc847a88fc71f2bc200&server=irc.pirc.pl&autoConnect=true&charset=UTF-8';
		$pass = 'b61tays';
		if(isset(Dispatcher::$args['.0'])){
			$channel = Dispatcher::$args['.0'];
			$gateway_url .= '&channel=%23'.$channel;
		}
		if(isset(Dispatcher::$args['.1'])){
			$nick = Dispatcher::$args['.1'];
			$gateway_url .= '&nick='.$nick;
		}
/*		if(isset(Dispatcher::$args['.2'])){
			$glayout = Dispatcher::$args['.2'];
			$gateway_url .= $glayout . '/';
		}
		if(isset(Dispatcher::$args['.3'])){
			$addcssdec = Dispatcher::$args['.3'];
			$gateway_url .= $addcssdec . '/';
		}*/
		$gateway_url .= '\">innej bramki</a> (Mibbit).';
		
		$add_js_list = array('mcolor', 'icons_rangi');
		$add_js_list_default = array('mcolor');
		$add_js = '';
		$addons = array();
		$disable_addons = array();
		if($_GET['addons']){
			$addons = explode(',', $_GET['addons']);
		}
		if($_GET['disable_addons']){
			$disable_addons = explode(',', $_GET['disable_addons']);
		}
		foreach($addons as $addon){
			if(!in_array($addon, $add_js_list) || in_array($addon, $disable_addons) || in_array($addon, $add_js_list_default)) continue;
			$add_js .= '<script type="text/javascript" src="/js/addon_'.$addon.'.js"></script>'."\n";
		}
		foreach($add_js_list_default as $addon){
			if(in_array($addon, $disable_addons)) continue;
			$add_js .= '<script type="text/javascript" src="/js/addon_'.$addon.'.js"></script>'."\n";
		}

		$nick = htmlspecialchars($nick);
		if(isset($channel)) $channel = '#'.htmlspecialchars($channel); else $channel = '#';

		if(isset($addcssdec)){
			$addcssdec = base64_decode(Dispatcher::$args['.4'], true);
			if($addcssdec) {
				if(strpos($addcssdec, 'http://') === 0 && strpos($addcssdec, '\'') === false && strpos($addcssdec, '"') === false) {
					$additionalcss = '<link rel="stylesheet" href="'.$addcssdec.'" />';
				}
			}
		} else {
			$additionalcss = '';
		}

		set_include_path('.');

		if(!isset($glayout) || !in_array($glayout, settings::$lay)) {
			$glayout = 'def';
		}
		
		Template::assign('channel', $channel);
		if($nick != '0') Template::assign('nick', $nick);
		Template::assign('gateway_version', settings::$gateway['version']);
		Template::assign('sid', session_id());
		Template::assign('old_gateway_html', $gateway_url);
		if(settings::$gateway['version'] != 'testowa k4be'){
			Template::assign('random_string', '?'.rand(100, 5000));
		}
		Template::assign('add_js', $add_js);
		Template::assign('itoken', base64_encode('PASS '.$pass));
		
		Template::display('gateway_ajax_header');
		Template::display('ajax_'.$glayout);
//		Template::assign('gateway_url', $gateway_url);
//		Template::display('ajax_mibbit');
	}
}

?>
