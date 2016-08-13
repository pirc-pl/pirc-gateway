    <body>
		<div id="background-wrapper"></div>
		<div id="not_connected_wrapper">
			<img src="/styles/img/gbg.png" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" />
			<div id="not_connected_div">
				<div class="not-connected-text">
					<h3>Ładowanie</h3>
					<p>Aby korzystać z bramki należy włączyć obsługę JavaScript.</p>
				</div>
			</div>
		</div>	
		<div id="reconnect_wrapper">
			<div id="reconnect_div">
				<h3>Utracono połączenie</h3>
				Utracono połączenie. <input type="button" onclick="gateway.reconnect()" value="Połącz ponownie" />
			</div>
		</div>
			
		<div id="options_wrapper">
			<img src="/styles/img/gbg.png" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" />
			<div id="options_div">
				<div class="notify-close" onclick="gateway.showOptions()">
					&#215;
				</div>
            	<h3>Ustawienia</h3>
            	<table>
					<tr>
						<td><input type="checkbox" id="showPartQuit" onchange="disp.changeSettings()" /></td>
						<td>&nbsp; Nie pokazuj wiadomości PART/JOIN/QUIT</td>
					</tr>
					<tr>
						<td><input type="checkbox" id="tabsListBottom" onchange="disp.changeSettings()" /></td>
						<td>&nbsp; Listę zakładek pokazuj na dole strony</td>
					</tr>
					<tr title="Pokazuje informację user@host przy dołączaniu i opuszczaniu kanałów przez użytkowników">
						<td><input type="checkbox" id="showUserHostnames" onchange="disp.changeSettings()" /></td>
						<td>&nbsp; Pokazuj nazwy hosta użytkowników</td>
					</tr>
					<tr>
						<td><input type="checkbox" id="autoReconnect" onchange="disp.changeSettings()" checked="checked" /></td>
						<td>&nbsp; Automatycznie łącz ponownie po rozłączeniu</td>
					</tr>
					<tr title="Ustawienie nie wpływa na linki, które są już wyświetlone">
						<td><input type="checkbox" id="displayLinkWarning" onchange="disp.changeSettings()" checked="checked" /></td>
						<td>&nbsp; Pokazuj ostrzeżenia o niebezpiecznych linkach</td>
					</tr>
					<tr>
						<td><input type="checkbox" id="blackTheme" onchange="disp.changeSettings()" /></td>
						<td>&nbsp; Ciemny motyw bramki (eksperymentalny)</td>
					</tr>
					<tr>
						<td><input type="checkbox" id="newMsgSound" onchange="disp.changeSettings()" /></td>
						<td>&nbsp; Informuj dźwiękiem o nowej wiadomości</td>
					</tr>
					<tr>
						<td><input type="checkbox" id="autoDisconnect" onchange="disp.changeSettings()" /></td>
						<td>&nbsp; Automatycznie rozłączaj przy zamykaniu strony</td>
					</tr>
					<tr>
						<td colspan="2">
							Sposób wyświetlania wiadomości NOTICE &nbsp;
							<select id="noticeDisplay" onchange="disp.changeSettings()">
								<option value="0">Wyskakujące okienko</option>
								<option value="1">Rozmowa prywatna</option>
								<option value="2">Zakładka statusu</option>
							</select>
						</td>
					</tr>
            	</table>
			</div>
		</div>
		
		<div id="about_wrapper">
			<img src="/styles/img/gbg.png" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" />
			<div id="about_div">
				<div class="notify-close" onclick="gateway.showAbout()">
					&#215;
				</div>
            	<h3>Bramka WWW PIRC.PL</h3>
				<p>Wersja: <script type="text/javascript">document.write(gatewayVersion);</script></p>
				<p>Pokaż <a href="http://pirc.pl/teksty/bramka_ajax" target="blank">ostatnie zmiany</a></p>
				<p>&copy; 2010-2016 <a href="http://pirc.pl">PIRC.PL</a>. Wszelkie prawa zastrzeżone</p>
			</div>
		</div>

        <div id="top_menu">
            <div id="leftarrow">
            	<input class="top" type="image" src="/styles/img/g_lewo.png" value="" onClick="gateway.prevTab()" />
<!--            	<input class="top" type="button" value="&larr;" onclick="gateway.prevTab()" />-->
            </div>
            <div id="tab-wrapper">
                <ul class="tabs" id="tabs">
                    <li id="--status-tab"><a href="javascript:void(0);" onclick="gateway.switchTab('--status')" class="switchTab">Status</a><a href="#"></a></li>
                </ul>
            </div>
            <div id="rightarrow">
	            <input class="top" type="image" src="/styles/img/g_prawo.png" value="" onClick="gateway.nextTab()" />
            	<!--<input class="top" type="button" value="&rarr;" onclick="gateway.nextTab()" />-->
            </div>
        </div>
        
        <div id="options-box">
	        <a id="button-tsize" href="javascript:void(0);" onclick="disp.showSizes();" title="Zmień rozmiar tekstu"></a>
			<a id="button-options" href="javascript:void(0);" onClick="gateway.showOptions();" title="Ustawienia"></a> 
			<a id="button-about" href="javascript:void(0);" onClick="gateway.showAbout();" title="Informacje o bramce"></a>
			<a id="button-quit" href="javascript:void(0);" onClick="gateway.clickQuit();" title="Rozłącz z IRC"></a> 
        </div>

        <div id="wrapper">
            <div id="info">
                <table style="height: 100%;"><tr><td valign="middle" id="topic">
                            <span id="--status-topic">
                                <h1>Status</h1>
                                <h2>------</h2>
                            </span>

                        </td></tr></table>
            </div>
            <div id="chatbox">
                <div id="chat-wrapper">
                    <div style="width: 98%; margin: 0 auto; margin-top: 1%; margin-bottom: 1%;" id="main-window">
                        <span id="--status-window"></span>
                        <!--
                        <span class="time">12:44</span> &nbsp; <span class="nick"> Witaj na sieci PIRC.PL!</span><br />
                        <span class="time">12:44</span> &nbsp; <span class="nick"> --------------------------------------------- </span><br />
                        <span class="time">12:44</span> &nbsp; <span class="join">&rarr; Dołączyłeś do kanału #main.</span><br />
                        <span class="time">12:44</span> &nbsp; <span class="mode">*** Temat dla kanału <b>#main</b>: <a href="http://ichuj.samaelszafran.pl/cytaty">http://ichuj.samaelszafran.pl/cytaty</a> || Kto ukradł topic i dlaczego to był chommik?</span><br />
                        <span class="time">12:44</span> &nbsp; <span class="mode">*** Temat ustawiony przez: samu <i>[s@127.0.0.1]</i> [Fri Aug  6 10:33:56 2010]</span><br />
                        <span class="time">12:45</span> &nbsp; <span class="nick">&lt;samu&gt;</span> Słyszałem, że śpiochu jest policjantem.<br />
                        <span class="time">12:45</span> &nbsp; <span class="mode">*** samu ustawia tryb [+to chommik] dla kanału #main</span><br />
                        <span class="time">12:46</span> &nbsp; <span class="nick">&lt;Tril&gt;</span> Nie, on jest zjebę.<br />
                        <span class="time">12:46</span> &nbsp; <span class="nick">&lt;spiochu&gt;</span> Nie lubie was, ide oglądać bajki :&lt;<br />
                        <span class="time">12:47</span> &nbsp; <span class="nick">&lt;chommik&gt;</span> DEBIAN DEBIAN FTW!!!111oneoneone.<br />
                        <span class="time">12:47</span> &nbsp; <span class="hilight"><span class="nick">&lt;samu&gt;</span> nieznany123: zmień nicka ;x</span><br />
                        <span class="time">12:47</span> &nbsp; <span class="yournick">&lt;nieznany123&gt;</span> :(<br />
                        <span class="time">12:48</span> &nbsp; <span class="join">&rarr; <b>somenick</b> <i>[~somenick@1.3.3.7]</i> dołączył do #main.</span><br />
                        <span class="time">12:48</span> &nbsp; <span class="part">&larr; <b>somenick</b> <i>[~somenick@1.3.3.7]</i> opuścił #main.</span><br />
                        <span class="time">12:48</span> &nbsp; <span class="kick">*** samu wyrzuca spiochu z #main [Powód: Bo jesteś głupi]</span><br />
                        <span class="time">12:48</span> &nbsp; <span class="kick">*** samu wyrzuca Cię z #main [Powód: no reason]</span><br />
                        -->
                    </div>
                </div>
            </div>

            <div id="nicklist-closed">
                <div id="nicklist-hide-button" class="closed" onclick="gateway.nickListToggle()"></div>
            </div>
            <div id="nicklist">
                <div id="nick-wrapper">
                    <div style="margin: 0 auto; width: 93%; margin-top: 3%; margin-bottom: 3%;" id="nicklist-main">
                        <div id="nicklist-hide-button" onclick="gateway.nickListToggle()"></div>
                        <div id="nicklist-hide-wrap">
                            <span id="--status-nicklist">
                                <!-- <ul class="nicklist">
                                    <li></li>
                                    <li><table><tr><td valign="top"><img alt="owner" src="/styles/img/owner.png" width="16" height="16" /></td><td valign="top">&nbsp;&nbsp;Tril</td></tr></table></li>
                                    <li><table><tr><td valign="top"><img alt="owner" src="/styles/img/owner.png" width="16" height="16" /></td><td valign="top">&nbsp;&nbsp;chommik</td></tr></table></li>
                                    <li><table><tr><td valign="top"><img alt="protect" src="/styles/img/prot.png" width="16" height="16" /></td><td valign="top">&nbsp;&nbsp;mystiq</td></tr></table></li>
                                    <li><table><tr><td valign="top"><img alt="op" src="/styles/img/op.png" width="16" height="16" /></td><td valign="top">&nbsp;&nbsp;futrzak</td></tr></table></li>
                                    <li><table><tr><td valign="top"><img alt="halfop" src="/styles/img/hop.png" width="16" height="16" /></td><td valign="top">&nbsp;&nbsp;luszczyk</td></tr></table></li>
                                    <li><table><tr><td valign="top"><img alt="voice" src="/styles/img/voice.png" width="16" height="16" /></td><td valign="top">&nbsp;&nbsp;kamil</td></tr></table></li>
                                    <li><table><tr><td valign="top"><img alt="no status" src="/styles/img/users.png" width="16" height="16" /></td><td valign="top">&nbsp;&nbsp;spiochu</td></tr></table></li>
                                    <li><table><tr><td valign="top"><img alt="no status" src="/styles/img/users.png" width="16" height="16" /></td><td valign="top">&nbsp;&nbsp;nieznany123</td></tr></table></li>
                                </ul> -->
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div id="inputbox">
            <div id="input-wrapper">
				<table class="nostyle"><tr>
					<!--<td style="width: 150px; text-align: right;"><span id="usernick" class="yournickname">{$nick}</span></td>-->
	                <td style="width: 10px;"><input type="image" src="/styles/img/plus.png" value="" class="completion" onClick="gateway.doComplete();$('#input').focus()" title="Uzupełnij nick lub polecenie [Tab]" /></td>
	                <td style="padding-right: 10px; padding-left: 5px;"> <input id="input" type="text" name="input" class="input" /></td>
	                <td style="width: 10px;"><input type="image" src="/styles/img/smiley_mu.png" class="symbols" onClick="disp.symbolWindowShow()" title="Emotikony i symbole" /></td>
	                <td style="width: 10px;"><input type="image" src="/styles/img/kolorki.png" value="" class="insertColor" onClick="disp.colorWindowShow()" title="Kolory i formatowanie" /></td>
                	<td style="width: 10px;"><input type="submit" value="&bull;" class="submit" OnClick="gateway.parseUserInput($('#input').val())" title="Wyślij [Enter]" /></td>
                </tr></table>
            </div>
         </div>

        <div class="notifywindow">
            <div class="notify-close" onclick="gateway.closeNotify()">
                &#215;
            </div>
            <div class="notify-text">
            </div>
        </div>

		<div class="noticewindow">
            <div class="notice-close" onclick="gateway.closeNotice()">
                &#215;
            </div>
            <div class="notice-text">
            </div>
        </div>

        <div class="statuswindow">
            <div class="status-close" onclick="gateway.closeStatus()">
                &#215;
            </div>
            <div class="status-text">
            </div>
        </div>


        <div class="errorwindow">
            <div class="error-close" onclick="gateway.closeError()">
                &#215;
            </div>
            <div class="error-text">
            </div>
        </div>
        
        <div class="colorwindow">
            <div class="color-close" onclick="$('.colorwindow').fadeOut(200); $('#input').focus();">
                &#215;
            </div>
            <div class="color-text">
            	<h3>Wstaw kod koloru</h3>
            	<table>
            		<tr>
            			<td><button type="button" class="colorButton" value="" style="background-color: white;" onClick="gateway.insertColor(0)" /></td>
            			<td><button type="button" class="colorButton" value="" style="background-color: black;" onClick="gateway.insertColor(1)" /></td>
            			<td><button type="button" class="colorButton" value="" style="background-color: #1B54FF;" onClick="gateway.insertColor(2)" /></td>
            			<td><button type="button" class="colorButton" value="" style="background-color: #4BC128;" onClick="gateway.insertColor(3)" /></td>
            			<td><button type="button" class="colorButton" value="" style="background-color: #F15254;" onClick="gateway.insertColor(4)" /></td>
            			<td><button type="button" class="colorButton" value="" style="background-color: #9B4244;" onClick="gateway.insertColor(5)" /></td>
            			<td><button type="button" class="colorButton" value="" style="background-color: #D749D6;" onClick="gateway.insertColor(6)" /></td>
            			<td><button type="button" class="colorButton" value="" style="background-color: #AEB32F;" onClick="gateway.insertColor(7)" /></td>
            		</tr>
            		<tr>
            			<td><button type="button" class="colorButton" value="" style="background-color: #E7EF3B;" onClick="gateway.insertColor(8)" /></td>
            			<td><button type="button" class="colorButton" value="" style="background-color: #59FF54;" onClick="gateway.insertColor(9)" /></td>
            			<td><button type="button" class="colorButton" value="" style="background-color: #00DFD6;" onClick="gateway.insertColor(10)" /></td>
            			<td><button type="button" class="colorButton" value="" style="background-color: #60FFF8;" onClick="gateway.insertColor(11)" /></td>
            			<td><button type="button" class="colorButton" value="" style="background-color: #5F6BFF;" onClick="gateway.insertColor(12)" /></td>
            			<td><button type="button" class="colorButton" value="" style="background-color: #FF83F2;" onClick="gateway.insertColor(13)" /></td>
            			<td><button type="button" class="colorButton" value="" style="background-color: #B5B5B5;" onClick="gateway.insertColor(14)" /></td>
            			<td><button type="button" class="colorButton" value="" style="background-color: #E0E0E0;" onClick="gateway.insertColor(15)" /></td>
            		</tr>
            	</table>
            	<h3>Wstaw kod specjalny</h3>
    			<button type="button" class="textFormat" onClick="gateway.insertCode(3)">Wyłącz kolor</button>
    			<button type="button" class="textFormat" onClick="gateway.insertCode(2)">Pogrubienie</button>
    			<button type="button" class="textFormat" onClick="gateway.insertCode(22)">Odwróć kolory</button>
    			<button type="button" class="textFormat" onClick="gateway.insertCode(29)">Pochylenie</button>
    			<button type="button" class="textFormat" onClick="gateway.insertCode(31)">Podkreślenie</button>
       			<button type="button" class="textFormat" onClick="gateway.insertCode(15)">Czyść wygląd</button>
            </div>
        </div>
        
        <div class="symbolwindow">
            <div class="symbol-close" onclick="$('.symbolwindow').fadeOut(200); $('#input').focus();">
                &#215;
            </div>
            <div class="symbol-text">
            	<h3>Emotikony</h3>
            	<a onclick="gateway.insert('☺')">☺</a> 
            	<a onclick="gateway.insert('😀')">😀</a> <a onclick="gateway.insert('😁')">😁</a> <a onclick="gateway.insert('😂')">😂</a> <a onclick="gateway.insert('😃')">😃</a> <a onclick="gateway.insert('😄')">😄</a> <a onclick="gateway.insert('😅')">😅</a>
            	<a onclick="gateway.insert('😅')">😅</a> <a onclick="gateway.insert('😇')">😇</a> <a onclick="gateway.insert('😈')">😈</a> <a onclick="gateway.insert('😉')">😉</a> <a onclick="gateway.insert('😊')">😊</a> <a onclick="gateway.insert('😋')">😋</a>
            	<a onclick="gateway.insert('😌')">😌</a> <a onclick="gateway.insert('😍')">😍</a> <a onclick="gateway.insert('😎')">😎</a> <a onclick="gateway.insert('😏')">😏</a> <a onclick="gateway.insert('😐')">😐</a> <a onclick="gateway.insert('😑')">😑</a>
            	<a onclick="gateway.insert('😒')">😒</a> <a onclick="gateway.insert('😓')">😓</a> <a onclick="gateway.insert('😔')">😔</a> <a onclick="gateway.insert('😕')">😕</a> <a onclick="gateway.insert('😖')">😖</a> <a onclick="gateway.insert('😗')">😗</a>
            	<a onclick="gateway.insert('😘')">😘</a> <a onclick="gateway.insert('😙')">😙</a> <a onclick="gateway.insert('😚')">😚</a> <a onclick="gateway.insert('😛')">😛</a> <a onclick="gateway.insert('😜')">😜</a> <a onclick="gateway.insert('😝')">😝</a>
            	<a onclick="gateway.insert('😞')">😞</a> <a onclick="gateway.insert('😟')">😟</a> <a onclick="gateway.insert('😠')">😠</a> <a onclick="gateway.insert('😡')">😡</a> <a onclick="gateway.insert('😢')">😢</a> <a onclick="gateway.insert('😣')">😣</a>
            	<a onclick="gateway.insert('😤')">😤</a> <a onclick="gateway.insert('😥')">😥</a> <a onclick="gateway.insert('😦')">😦</a> <a onclick="gateway.insert('😧')">😧</a> <a onclick="gateway.insert('😨')">😨</a> <a onclick="gateway.insert('😩')">😩</a>
            	<a onclick="gateway.insert('😪')">😪</a> <a onclick="gateway.insert('😫')">😫</a> <a onclick="gateway.insert('😬')">😬</a> <a onclick="gateway.insert('😭')">😭</a> <a onclick="gateway.insert('😮')">😮</a> <a onclick="gateway.insert('😯')">😯</a>
            	<a onclick="gateway.insert('😰')">😰</a> <a onclick="gateway.insert('😱')">😱</a> <a onclick="gateway.insert('😲')">😲</a> <a onclick="gateway.insert('😳 ')">😳 </a> <a onclick="gateway.insert('😴')">😴</a> <a onclick="gateway.insert('😵')">😵</a>
            	<a onclick="gateway.insert('😶')">😶</a> <a onclick="gateway.insert('😷')">😷</a> <a onclick="gateway.insert('😸')">😸</a> <a onclick="gateway.insert('😹')">😹</a> <a onclick="gateway.insert('😽')">😽</a> <a onclick="gateway.insert('😿')">😿</a>
            	<a onclick="gateway.insert('😘')">😘</a> <a onclick="gateway.insert('😙')">😙</a> <a onclick="gateway.insert('😚')">😚</a> <a onclick="gateway.insert('😛')">😛</a> <a onclick="gateway.insert('😜')">😜</a> <a onclick="gateway.insert('😝')">😝</a>
            	<a onclick="gateway.insert('🙁')">🙁</a> <a onclick="gateway.insert('🙂')">🙂</a> <a onclick="gateway.insert('🙃')">🙃</a> <a onclick="gateway.insert('💀')">💀</a>
            	<h3>Symbole inżynierskie</h3>
            	<a onclick="gateway.insert('µ')">µ</a> <a onclick="gateway.insert('Ω')">Ω</a> <a onclick="gateway.insert('φ')">φ</a> <a onclick="gateway.insert('Δ')">Δ</a> <a onclick="gateway.insert('Θ')">Θ</a> <a onclick="gateway.insert('Λ')">Λ</a>
            	<a onclick="gateway.insert('Σ')">Σ</a> <a onclick="gateway.insert('Φ')">Φ</a> <a onclick="gateway.insert('Ψ')">Ψ</a> <a onclick="gateway.insert('α')">α</a>
            	<a onclick="gateway.insert('β')">β</a> <a onclick="gateway.insert('χ')">χ</a> <a onclick="gateway.insert('τ')">τ</a> <a onclick="gateway.insert('δ')">δ</a> <a onclick="gateway.insert('ε')">ε</a> <a onclick="gateway.insert('η')">η</a>
            	<a onclick="gateway.insert('ψ')">ψ</a> <a onclick="gateway.insert('θ')">θ</a> <a onclick="gateway.insert('λ')">λ</a> <a onclick="gateway.insert('ξ')">ξ</a> <a onclick="gateway.insert('ρ')">ρ</a> <a onclick="gateway.insert('σ')">σ</a>
            	<a onclick="gateway.insert('√')">√</a> <a onclick="gateway.insert('∞')">∞</a> <a onclick="gateway.insert('∫')">∫</a> <a onclick="gateway.insert('≈')">≈</a> <a onclick="gateway.insert('≠')">≠</a> <a onclick="gateway.insert('±')">±</a>
            	<a onclick="gateway.insert('ω')">ω</a> <a onclick="gateway.insert('κ')">κ</a> <a onclick="gateway.insert('π')">π</a> <a onclick="gateway.insert('§')">§</a> <a onclick="gateway.insert('Γ')">Γ</a> <a onclick="gateway.insert('∑')">∑</a>
            </div>
        </div>
    </body>
    <div class="tsizewindow">
        <div class="size-close" onclick="$('.tsizewindow').fadeOut(200); $('#input').focus();">
            &#215;
        </div>
        <div class="size-text">
        	<h3>Wybierz wielkość tekstu</h3>
        	<a onclick="javascript:disp.setSize(0.6)" style="font-size:0.6em">A</a>
        	<a onclick="javascript:disp.setSize(0.8)" style="font-size:0.8em">A</a> 
        	<a onclick="javascript:disp.setSize(1.0)" style="font-size:1.0em">A</a>
        	<a onclick="javascript:disp.setSize(1.2)" style="font-size:1.2em">A</a> 
        	<a onclick="javascript:disp.setSize(1.4)" style="font-size:1.4em">A</a> 
        	<a onclick="javascript:disp.setSize(1.6)" style="font-size:1.6em">A</a> 
        	<a onclick="javascript:disp.setSize(1.8)" style="font-size:1.8em">A</a> 
          	<a onclick="javascript:disp.setSize(2.0)" style="font-size:2.0em">A</a> 
        </div>
    </div>
	<script type="text/javascript">
	/*	document.getElementsByClassName('not-connected-text')[0].getElementsByTagName('h3')[0].innerHTML = 'Coś nie tak';
		document.getElementsByClassName('not-connected-text')[0].getElementsByTagName('p')[0].innerHTML = 'Twoja przeglądarka nie potrafi wyświetlić bramki. Chyba jest zbyt stara...';*/
	</script>
	<div id="sound"></div>
</html>
