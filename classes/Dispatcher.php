<?php
/**
 * Class for parsing all "rewrite" data
 *
 * @author Tril
 */

date_default_timezone_set("Europe/Warsaw");
//require_once dirname(__FILE__).'/config.php';
//require_once dirname(__FILE__).'/adodb/adodb.inc.php';
session_name('pircsession');
session_start();
if(!empty($_SERVER['HTTP_REFERER']) && !preg_match('#^[0-9a-z\+]+://([a-z\-0-9]+\.)?pirc\.pl/.*$#i', $_SERVER['HTTP_REFERER'])) {
	$_SESSION['no_pirc_ref'] = preg_replace('#^[0-9a-z\+]+://#i', '', $_SERVER['HTTP_REFERER']);
}


class Dispatcher {
/**
 * @var string Module name
 */
    public static $module = 'index';
    /**
     * @var boolean Is already parsed
     */
    private static $parsed = false;
    /**
     * @var array Assoc array of parsed arguments
     */
    public static $args = array();

    /**
     * Parse input variables
     *
     * @return boolean
     */
    public static function parse() {
        if(!empty($_GET['disp'])) {
            $matches = array();
            $langfound = false;
            if(preg_match('#.*\.([a-z]{2,2})$#i', $_GET['disp'], $matches)) {
                if(in_array(strtolower($matches[1]), Lang::availableLangs())) {
                    self::$args['lang'] = strtolower($matches[1]);
                    $langfound = true;
                }
            }
            $matches = array();
			$disp = iconv('utf-8','us-ascii//TRANSLIT//IGNORE', $_GET['disp']);
            if(preg_match_all('#([\#:\*\.a-z0-9\-_,\^`\[\]\|\{\}\\\\]+)([^\#:\*\.a-z0-9\-_,\^`\[\]\|\{\}\\\\]|$)#i', $disp, $matches)) {
                $ar = $matches[1];
                if($langfound) {
                    $last = array_pop($ar);
                    if(!empty($last)) {
                        $last = substr($last, 0, (strlen(self::$args['lang'])+1)*(-1));
                    }
                    array_push($ar, $last);
                }
                self::$module = array_shift($ar);
                for($i = 0; $i<count($ar); $i++) {
					if(isset($ar[$i+1]))
						self::$args[$ar[$i]] = strval($ar[$i+1]);
					else
						self::$args[$ar[$i]] = '';
                }
            } elseif(preg_match('#^([a-z]+)$#i', $_GET['disp'], $matches)) {
                self::$module = $matches[1];
            } else {
                self::$module = '$$$';
            }
            if(isset(self::$args)) {
                $tmp = array();
                $i = 0;
                $j = -1;
                foreach(self::$args as $key => $value) {
                	$j++;
                	if($j%2) continue;
                    if($key != 'lang') {
                        $tmp['.'.$i] = $key;
                        $i++;
                        if(isset($value)) {
                            $tmp['.'.$i] = $value;
                            $i++;
                        }
                    }
                }
                self::$args = array_merge(self::$args, $tmp);
            }
        }
        self::$parsed = true;
        return true;
    }
    
    public static function getLink() {
        if(!self::$parsed) {
            self::load();
        }
        $link = '/'.self::$module;
        if(!empty(self::$args)) {
            foreach(self::$args as $var => $val) if($var != 'lang') {
                    $link .= "/$var/$val";
                }
        }
        return $link;
    }
    public static function getModule() {
        if(!self::$parsed) {
            self::load();
        }
        return self::$module;
    }
}
?>
