<?php

if($index != 1){
	header('HTTP/1.1 404 Not Found');
	echo '<h1>Nie znaleziono</h1>Blad nr 2';
	die();
}

class settings {
	public static $modules = array('bajax', 'bramka', 'index'); // pliki php w /modules
	public static $lay = array('def', 'test'); // rodzaje bramek
	public static $gateway = array(
/*		'master_pass' => '117bcwhmsaz2l6U5n5z9qpW8UScNxJUR81',
		'tunpath' => '/home/pirc/bramka_debug/webirc.sock',
		'queuepath' => '/home/pirc/bramka_debug/queues/',*/ // nie są już używane
		'version' => 'testowa k4be',
		'itoken' => 'b61tays' // hasło do ircd
	);
}

?>
