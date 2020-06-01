# pirc-gateway
## Bramka PIRC / PIRC websocket IRC web interface
**Please note that this software uses Polish language in multiple places. Please notify developers about missing English UI translations. This software also expects specific IRC network configuration for some of its functionalities. Details will be provided later.**

Kompletne rozwiązanie pozwalające na dostęp do IRC za pośrednictwem przeglądarki.
Stworzone na potrzeby sieci [PIRC](https://pirc.pl/) w okolicach roku 2011 (autorzy: Tril, samu).
W późniejszym czasie utrzymywane i ulepszane przez k4be. Do uruchomienia tej dystrybucji wymagany jest serwer www (używamy nginx).
Dla nginx należy użyć konfiguracji:
```
location / {
	try_files $uri $uri/ /index.html;
}
```
Skopiuj plik `/js/gateway_global_settings.example.js` do `/js/gateway_global_settings.js` i zmień ustawienia według swoich potrzeb.

Otwieraj stronę pod adresem `https://example.com/` (puste pola), `https://example.com/kanal/` (nazwa kanału w adresie ma być bez znaku `#`) lub `https://example.com/kanal/nick/`.

A complete solution allowing IRC access with a web browser. Created to fulfill the needs of [PIRC](https://pirc.pl/) (Polish IRC network)
around year 2011 (authors: Tril, samu). Later maintained and upgraded by k4be. This distribution needs a web server (we use nginx).
Use following nginx configuration:
```
location / {
	try_files $uri $uri/ /index.html;
}
```
Rename the `/js/gateway_global_settings.example.js` to `/js/gateway_global_settings.js` and adjust the settings to fit your needs.

Use the URL of `https://example.com/` (empty inputs), `https://example.com/channel/` (channel name in url should not include the `#` character) or `https://example.com/channel/nickname/`.

This software contains components from other open source projects, for example:
- [md5.js](https://github.com/AndreasPizsa/md5-jkmyers)
- [jQuery](https://jquery.org/) (various components)
- [base64.js](https://github.com/bcko/tictactoe-react/tree/master/node_modules/js-base64)
- [foreach.js](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/forEach#Polyfill)
- [Symbola font](https://fontlibrary.org/en/font/symbola) (modified)
- [Tango icons](https://commons.wikimedia.org/wiki/Tango_icons) (modified)
- [famfamfam flags](http://www.famfamfam.com/lab/icons/flags/)
- [g-emoji-element](https://github.com/github/g-emoji-element) (modified)
- [emoji asset](https://github.com/rodrigopolo/emoji-assets/tree/master/Microsoft/40)

Published on [GitHub](https://github.com/k4bek4be/pirc-gateway/) by k4be.

Feel free to use the software in the way that suits your needs, as long as you keep original contents of this file unchanged, and you notify the PIRC team (via #help on irc.pirc.pl) about all public installations of it.
