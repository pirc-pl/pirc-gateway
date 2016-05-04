<?


const STATUS_NOT_CONNECTED = 1;
const STATUS_CONNECTING = 2;
const STATUS_CONNECTED = 3;
const STATUS_ERROR = 4;

class Module extends ModuleT {
	public static $name = 'bajax';
	public static $header = false;
	
	private static $master_pass;
	private static $tunpath;
	private static $queuepath;
	private static $socket = false;
    private static $bindings = array();
    private static $resp_arr = array();
	private static $output = '';
	private static $debug = '';


	public static function run() {
		self::$master_pass = settings::$gateway['master_pass'];
		self::$tunpath = settings::$gateway['tunpath'];
		self::$queuepath = settings::$gateway['queuepath'];
		
		self::makeBindings();

		$sock_status = self::connectSock();

		if(empty($_SESSION['gateway_status']) || empty($_SESSION['gateway_socket']) || empty($_SESSION['gateway_password']))
			$_SESSION['gateway_status'] = STATUS_NOT_CONNECTED;

		if($_SESSION['gateway_status'] != STATUS_NOT_CONNECTED){
			$resp = self::readFile();
	        $tosend = self::analyzeOutput($resp);
		}

		if(!$sock_status){
			$_SESSION['gateway_status'] = STATUS_ERROR;
			// TODO obsługa błędu
		} else {
			if($_SESSION['gateway_status'] == STATUS_ERROR) self::clearConn();

			if(!empty(Dispatcher::$args['new']) && ($_SESSION['gateway_status'] == STATUS_NOT_CONNECTED || !empty(Dispatcher::$args['force']))) { // porzuć stare połączenie jeśli jest i zrób nowe
				self::clearConn();
				if(empty($_POST['nick']) || !preg_match('/^[0-9a-z_`\[\]\-]+$/i', $_POST['nick'])) {
					self::newConn();
				} else {
					self::newConn($_POST['nick']);
				}
		        if(!empty($_POST['channel']) && preg_match('/^[#,a-z0-9_\.\-]+$/i', $_POST['channel'])) {
		           $_SESSION['channel'] = $_POST['channel'];
		        }
			} elseif($_SESSION['gateway_status'] != STATUS_NOT_CONNECTED) { // jestem połączony - obsługa
				self::writeSock('SYNC '.$_SESSION['gateway_socket'].' '.$_SESSION['gateway_password']."\n");

		        if(!empty($_POST['send'])) {
					self::writeSock($_POST['send']."\n");
				}

		        if(!empty($tosend)) {
		            self::writeSock($tosend);
		        }
			}
		}

		self::closeSock();

	    self::$resp_arr['status'] = $_SESSION['gateway_status'];
		self::$resp_arr['debug'] = self::$debug;
	    self::$output .= json_encode(self::$resp_arr);
	    self::flushOutput();


	}


	private static function connectSock() {
		if(!empty(self::$socket)) {
		    return true;
		} else {
		    self::$socket = socket_create(AF_UNIX, SOCK_STREAM, 0);
		    if(empty(self::$socket)) {
		        echo socket_strerror(socket_last_error());
		        return false;

		    }
		    if(!@socket_connect(self::$socket, self::$tunpath)) {
		        self::debug(socket_strerror(socket_last_error()));
		        return false;
		    }
		    return true;
		}
	}

    private static function writeSock($data='') {
 /*       if(!self::connectSock()) {
            return false;
        }*/
		if(!self::$socket) return false;

        self::debug("--sent irc data--\n".$data."--end of sent data--\n");
   //    $erp = error_reporting(0);
        $ret = @socket_write(self::$socket, $data);
   //     error_reporting($erp);
        return $ret;
    }

    private static function readFile() {
    	if(empty($_SESSION['gateway_password']) || empty($_SESSION['gateway_socket'])) {
    		return '';
    	} else {
    		$read = '';
    		if(file_exists(self::$queuepath.$_SESSION['gateway_password']."_".$_SESSION['gateway_socket'])) {
	    		$file = fopen(self::$queuepath.$_SESSION['gateway_password']."_".$_SESSION['gateway_socket'], 'r+');
	    		if(flock($file, LOCK_EX)) {
	    			$read = stream_get_contents($file);
	    			ftruncate($file, 0);
	    			flock($file, LOCK_UN);
	    			fclose($file);
	    		}
	    		self::debug("--received irc data (file)--\n".$read."--end of received data--\n");
    		}
    		return $read;
    	}
    }

	private static function debug($a) {
		self::$debug .= $data;
	}

    private static function analyzeOutput($resp) {
        if(!empty($resp)) {
            $lines = explode("\n", $resp);
            $close = false;
            $sendback = '';
            self::$resp_arr['packets'] = array();
            foreach($lines as $line) {
                $line = trim($line);
                if(!empty($line)) {
                    if(preg_match('/^SYNC:[0-9]+:ERROR:/i', $line)) {
                        $close = true;
                        self::debug("sock closed\n");
                    } elseif(preg_match('/^CLOSE:[0-9]+:/i', $line)) {
                        $close = true;
                        self::debug("sock closed $line\n");
                    } elseif(preg_match('/^CREATE:[0-9]+:OK/i', $line)) {
                        self::debug("join channelz\n");
                        $_SESSION['gateway_status'] = STATUS_CONNECTED;
                     /*   if(!empty($_SESSION['gateway_sendq'])) {
                            self::write($_SESSION['gateway_sendq']);
                            unset($_SESSION['gateway_sendq']);
                        }*/
                    } else {
                        $list = explode(" ", $line);
                        $msg = array();
                        $msg['sender'] = array(
                            'server' => false,
                            'user' => false
                            );
                        $msg['command'] = '';
                        $msg['args'] = array();
                        $msg['text'] = '';
                        $textstart = false;
                        foreach($list as $part) {
                            if(empty($msg['sender']['nick']) && strpos($part, ':') === 0 && empty($msg['command'])) {
                                $sender = substr($part, 1);
                                $userhost = array();
                                if(preg_match('/^(\S+)!(\S+)@(\S+)$/', $sender, $userhost)) {
                                    $msg['sender']['user'] = true;
                                    $msg['sender']['nick'] = $userhost[1];
                                    $msg['sender']['ident'] = $userhost[2];
                                    $msg['sender']['host'] = $userhost[3];
                                } else {
                                    $msg['sender']['server'] = true;
                                    $msg['sender']['nick'] = $sender;
                                }
                            } elseif(empty($msg['command']) && !$textstart && strpos($part, ':') !== 0) {
                                $msg['command'] = $part;
                            } elseif(strpos($part, ':') !== 0 && !$textstart) {
                                $msg['args'][] = $part;
                            } elseif(strpos($part, ':') === 0 && !$textstart) {
                                $textstart = true;
                                $msg['text'] = substr($part, 1);
                            } else {
                                $msg['text'] .= ' '.$part;
                            }
                        }
                        //self::debug(var_export($msg, 1)."\n");
                        if(!empty(self::$bindings[$msg['command']])) {
                            self::debug("Omg, omg i found some functions for {$msg['command']}!!\n");
                            foreach (self::$bindings[$msg['command']] as $index => $func) {
                                if(is_callable('self::'.$func)) {
                                    $sendback .= call_user_func('self::'.$func, $msg);
                                } else {
                                    self::debug("wtf, function not callable (self::$func)!\n");
                                }
                            }
                        }
                        self::$resp_arr['packets'][] = $msg;
                    }
                }
            }
            if($close) {
                self::clearConn();
                return '';
            } else {
                return $sendback;
            }
        } else {
            return '';
        }
    }

    /**
     * Create bindings for commands
     */
    private static function makeBindings() {
        self::$bindings = array(
            'PING' => array(),
            'PRIVMSG' => array(),
        );
        /**
         * Ping binds
         */
        self::$bindings['PING'][] = 'bindPing0';
        /**
         * PRIVMSG binds (ctcp)
         */
        self::$bindings['PRIVMSG'][] = 'bindPrivmsg0';
        self::$bindings['CONNECTED'][] = 'bindConnected';
    }

    private static function flushOutput() {
        echo self::$output;
		self::$output = '';
        return true;
    }

    private static function bindPing0($msg) {
        return "PONG :{$msg['text']}\n";
    }
    /**
     * Ctcp responses
     * @param array $msg
     * @return string
     */
    private static function bindPrivmsg0($msg) {
		global $settings;
        if(preg_match("/^\001(.*)\001$/", $msg['text'])) {
            if(strpos($msg['text'], "VERSION") === 1) {
                return 'NOTICE '.$msg['sender']['nick']." :\001VERSION Bramka WWW PIRC.PL, wersja ".settings::$gateway['version'].' na '.$_SERVER['HTTP_USER_AGENT']."\001\n";
            }
            if(strpos($msg['text'], "USERINFO") === 1) {
                return 'NOTICE '.$msg['sender']['nick']." :\001USERINFO Bramka WWW PIRC.PL, wersja ".settings::$gateway['version'].' na '.$_SERVER['HTTP_USER_AGENT']."\001\n";
            }
            if(strpos($msg['text'], "REFERER") === 1) {
				if(empty($_SESSION['no_pirc_ref'])) {
					return "NOTICE {$msg['sender']['nick']} :\001REFERER Nieznany\001\n";
				} else {
					return "NOTICE {$msg['sender']['nick']} :\001REFERER {$_SESSION['no_pirc_ref']}\001\n";
				}	
            }
        }
        return "";
    }

    private static function bindConnected($msg) {
        if($_SESSION['gateway_status'] != STATUS_CONNECTED) {
            $_SESSION['gateway_status'] = STATUS_CONNECTED;
		}
		if(isset($_SESSION['channel'])) {
			return 'JOIN '.$_SESSION['channel']."\n";
		}
		return "";
	}

    private static function clearConn() {
        unset($_SESSION['gateway_socket'], $_SESSION['gateway_password']);
        $_SESSION['gateway_status'] = STATUS_NOT_CONNECTED;
    }

    private static function newConn($nick = "JakisNick") {
        $_SESSION['gateway_password'] = substr(md5(uniqid('.', 1)), 20);
        $hostname = gethostbyaddr($_SERVER['REMOTE_ADDR']);
        if(!in_array($_SERVER['REMOTE_ADDR'], gethostbynamel($hostname)))
            $hostname = $_SERVER['REMOTE_ADDR'];
        $send = "SYNC ".self::$master_pass."\n";
        $send .= "CREATE {$_SESSION['gateway_password']} 127.0.0.1 6667 {$_SESSION['gateway_password']} $hostname $nick {$_SERVER['REMOTE_ADDR']}\n";
        self::writeSock($send);
        usleep(200);
        $ret = self::readSock(true);
        $data = explode(':',$ret);
        $_SESSION['gateway_status'] = STATUS_CONNECTING;
        if(!empty($data[2]) && $data[2] == 'OK') {
             $_SESSION['gateway_socket'] = trim($data[3]);
        } elseif (!empty($data[2])) {
        	 $_SESSION['gateway_status'] = STATUS_NOT_CONNECTED;
        }
        return true;
    }

    private static function closeSock() {
        if(!empty(self::$socket)) {
            @socket_close(self::$socket);
            self::$socket = false;
        }
        return true;
    }

    private static function readSock($blocking = false) {
        if(!self::$socket) {
            return false;
        }
        if(!$blocking) {
        	socket_set_nonblock(self::$socket);
        } else {
        	socket_set_block(self::$socket);
        	$timeout = array('sec'=>3,'usec'=>0);
  			socket_set_option(self::$socket,SOL_SOCKET,SO_RCVTIMEO,$timeout);
        }
        	
        $full = '';
        $read = '';
        do {
            $read = socket_read(self::$socket, 1024);
            $full .= $read;
        } while($read != "");
        socket_set_block(self::$socket);
        self::debug("--received irc data--\n".$full."--end of received data--\n");
        return $full;
    }
}

