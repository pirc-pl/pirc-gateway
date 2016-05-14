<?php
/**
 * Description of Error
 *
 * @author Tril
 */

 define('ERROR_LOG', dirname(__FILE__).'/../../http_logs/php-error.log');


class Error {
    /** @var resource $file Resource identifier of opened logfile */
    private static $file = false;
    /** @var string $fname Logfile name */
    public static $fname = ERROR_LOG;

    const ESILENT = 0;
    const ENOTE = 1;
    const ESTOP = 2;
    /** @var string $silentlist List of PHP errors classified as silent (Error::ESILENT) */
    private static $silentlist = array(E_DEPRECATED, E_USER_DEPRECATED, E_USER_NOTICE, E_NOTICE, E_STRICT, E_USER_WARNING, E_WARNING);
    /** @var string $notelist List of PHP errors classified as notices (Error::ENOTE) */
    private static $notelist = array();

    /**
     * Trigger error
     *
     * @param string $errstr Error description
     * @param int $ew Error level, could be one of Error::E* constants (optional, Error::ENOTE by default)
     * @param string $file File name where error occured (optional)
     * @param int $line Line where error occured (optional)
     * @return void
     */
    public static function trigger($errstr, $ew = self::ENOTE, $file = 0, $line = 0) {
        if($ew == self::ESILENT) {
            if(!empty($file))
                self::log('('.$file.' on '.$line.') '.$errstr);
            else
                self::log($errstr);
        } else {
            if(!empty($file))
                self::log('('.$file.' on '.$line.') '.$errstr);
            else
                self::log($errstr);
            self::print_e($errstr);
        }
        if($ew == self::ESTOP) die();
    }

    /**
     * Write error string to file
     *
     * @param string $errstr Error string to write in log file
     * @return boolean True when write success
     */
    private static function log($errstr) {
        if(fwrite(self::fhand(), date('r').' ['.$_SERVER['REMOTE_ADDR'].'] '.$errstr."\n")) {
            return true;
        } else {
            return false;
        }
    }

    /**
     * Prints error to standard output
     *
     * @param string $errstr Error string to print
     * @return void
     */
    private static function print_e($errstr) {
        echo "<div style=\"border: 2px red solid; padding: 5px; font-size: 11px; font-family: Verdana, sans-serif;\">$errstr</div>";
    }

    /**
     * Open and return file handler of logfile.
     *
     * @return resource|boolean File handler or false
     */
    private static function fhand() {
        if(!self::$file) {
            self::$file = fopen(self::$fname ,'a');
            return self::$file;
        } else {
            return self::$file;
        }
    }

    /**
     * Catch PHP errors
     *
     * @param string $errno Error level
     * @param string $errstr Error string
     * @param string $errfile File where error occured
     * @param string $errline Line where error occured
     * @param string $errcontext Context
     * @return boolean True when error is not critical
     */
    public static function catch_e($errno, $errstr, $errfile, $errline, $errcontext) {
        if(in_array($errno, self::$silentlist)) {
            self::trigger('PHP silent error: '.$errstr.print_r($errcontext, true), self::ESILENT, $errfile, $errline);
        } elseif(in_array($errno, self::$notelist)) {
            self::trigger('PHP Error: '.$errstr, self::ENOTE, $errfile, $errline);
        } else {
            self::trigger('PHP stop error: '.$errstr, self::ESTOP, $errfile, $errline);
            return false;
        }
        return true;
    }
}
?>
