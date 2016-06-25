
var SteamUser = require('steam-user');
var Steam = SteamUser.Steam;
var request = require('request');
var Cheerio = require('cheerio');
var fs = require("fs");

var client = new SteamUser({"enablePicsCache": true,"promptSteamGuardCode":false});

var Electron = require('electron');
var Main = Electron.remote.require('./main.js');

var g_Jar = request.jar();
request = request.defaults({"jar": g_Jar});
var g_Page = 1;
var g_Start;
var g_CheckTimer;
var g_OwnedApps = [];

function log(message) {
	var date = new Date();
	var time = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()];
	
	for(var i = 1; i < 6; i++) {
		if(time[i] < 10) {
			time[i] = '0' + time[i];
		}
	}
	
	console.log(time[0] + '-' + time[1] + '-' + time[2] + ' ' + time[3] + ':' + time[4] + ':' + time[5] + ' - ' + message);
}



function login() {
		$('.Window').fadeOut(250);
		var username = $("#username").val();
		var password = $("#password").val();
		$('#LoadingWindow p').html("Initializing Steam client...");
		$('#LoadingWindow').fadeIn(250);
		//Clear Password Field
		log("Initializing Steam client...");
		//Login to steam client
		client.logOn({
			"accountName": username,
			"password": password
		});
		$("#password").val("");
}

client.on('steamGuard', function(domain, callback, lastcode) {
	if (lastcode===true){
		$('#LoadingWindow .Error').html('<i class="fa fa-exclamation-circle"></i> Invalid Code');
	}else{
		$('#LoadingWindow .Error').html("");;
	}
	
	if (domain != null ){
		auth_msg = "Auth Code\nEmailed to address " + domain + ":";
	} else {
		auth_msg = "Mobile Auth Code:";
	}
	
	$('#LoadingWindow p').html(auth_msg + '<form id="authCodeForm" ><input id="authCode" class="input-lg form-control" /><button type="submit" class="btn btn-block" >Send</button></form>');
	$("#authCode").focus();
	$("#authCodeForm").on("submit",function(e){
		e.preventDefault();e.stopPropagation();
		code = $("#authCode").val();
		$('#LoadingWindow p').html("Initializing Steam client...");
		callback(code);
	});
});

client.on('loggedOn', function() {
	client.setPersona(0);
	$('.Error').html("");
	log("Logged into Steam!");
	$("#AppLogout").fadeIn(250);
	$("#AppClose").attr("onclick","client.logOff();process.exit(0);");
	log("Waiting for license info...");
	$('#LoadingWindow p').html("Waiting for license info...");
	console.log(client);
});

client.once('appOwnershipCached', function() {
	log("Got app ownership info");
	checkMinPlaytime();
});

client.on('error', function(e) {
	$("#password").val("");
	log("Error: " + e);
	if(e == "Error: InvalidPassword"){
		client.logOff();
		$("#LoginWindow .Error").html('<i class="fa fa-exclamation-circle"></i> Wrong username/password');
		$('.Window').fadeOut(250);
		$("#LoginWindow").fadeIn(250);
	} else if (e == "Error: LoggedInElsewhere" || e=="Error: LogonSessionReplaced"){
		client.logOff();
		$("#LoginWindow .Error").html('<i class="fa fa-exclamation-circle"></i> In Game Elsewhere!');
		$('.Window').fadeOut(250);
		$("#LoginWindow").fadeIn(250);
	}else{
		$("#LoginWindow .Error").html('<i class="fa fa-exclamation-circle"></i> '+e);
		$('.Window').fadeOut(250);
		$("#LoginWindow").fadeIn(250);
	}
});

function checkMinPlaytime(){
	log("Checking app playtime...");
	$('#LoadingWindow p').html('Checking app playtime...');
	client.webLogOn();
	client.once('webSession', function(sessionID, cookies) {
		cookies.forEach(function(cookie) {
			g_Jar.setCookie(cookie, 'https://steamcommunity.com');
		});
		request("https://steamcommunity.com/my/badges/?p="+g_Page, function(err, response, body) {
			if(err || response.statusCode != 200) {
				log("Couldn't request badge page: " + (err || "HTTP error " + response.statusCode) + ". Retrying in 10 seconds...");
				setTimeout(checkMinPlaytime, 10000);
				return;
			}
			
			var lowHourApps = [];
			var ownedPackages = client.licenses.map(function(license) {
				var pkg = client.picsCache.packages[license.package_id].packageinfo;
				pkg.time_created = license.time_created;
				pkg.payment_method = license.payment_method;
				return pkg;
			}).filter(function(pkg) {
				return !(pkg.extended && pkg.extended.freeweekend);
			});
			$_ = Cheerio.load(body);
			$_('.badge_row').each(function(i) {
				var row = $_(this);
				var overlay = row.find('.badge_row_overlay');
				if(!overlay) {
					return;
				}
				
				var match = overlay.attr('href').match(/\/gamecards\/(\d+)/);
				if(!match) {
					return;
				}
				
				var appid = parseInt(match[1], 10);

				var name = row.find('.badge_title');
				name.find('.badge_view_details').remove();
				name = name.text().replace(/\n/g, '').replace(/\r/g, '').replace(/\t/g, '').trim();

				// Check if app is owned
				if(!client.picsCache.apps.hasOwnProperty(appid)) {
					log("Skipping app " + appid + " \"" + name + "\", not owned");
					return;
				}

				var newlyPurchased = false;
				// Find the package(s) in which we own this app
				ownedPackages.filter(function(pkg) {
					return pkg.appids && pkg.appids.indexOf(appid) != -1;
				}).forEach(function(pkg) {
					var timeCreatedAgo = Math.floor(Date.now() / 1000) - pkg.time_created;
					if(timeCreatedAgo < (60 * 60 * 24 * 14) && [Steam.EPaymentMethod.ActivationCode, Steam.EPaymentMethod.GuestPass, Steam.EPaymentMethod.Complimentary].indexOf(pkg.payment_method) == -1) {
						newlyPurchased = true;
					}
				});
				
				// Find out if we have drops left
				var drops = row.find('.progress_info_bold').text().match(/(\d+) card drops? remaining/);
				if(!drops) {
					return;
				}
				
				drops = parseInt(drops[1], 10);
				if(isNaN(drops) || drops < 1) {
					return;
				}
				
				// Find out playtime
				var playtime = row.find('.badge_title_stats').html().match(/(\d+\.\d+) hrs on record/);
				if(!playtime) {
					playtime = 0.0;
				} else {
					playtime = parseFloat(playtime[1], 10);
					if(isNaN(playtime)) {
						playtime = 0.0;
					}
				}
				
				if(playtime < 2.0) {
					// It needs hours!
					
					lowHourApps.push({
						"appid": appid,
						"name": name,
						"playtime": playtime,
						"newlyPurchased": newlyPurchased,
						"icon": client.picsCache.apps[appid].appinfo.common.icon
					});
				}
				
				if(playtime >= 2.0 || !newlyPurchased) {
					g_OwnedApps.push(appid);
				}
			});
			
			if(lowHourApps.length > 0) {
				var minPlaytime = 2.0;
				var newApps = [];
				
				lowHourApps.forEach(function(app) {
					if(app.playtime < minPlaytime) {
						minPlaytime = app.playtime;
					}
					
					if(app.newlyPurchased) {
						newApps.push(app);
					}
				});
				
				var lowAppsToIdle = [];
				
				if(newApps.length > 0) {
					function getResponseNewApps(){
						switch(prompt("WARNING: Proceeding will waive your right to a refund on\nthe following apps:\n  - " + newApps.map(function(app) { return app.name; }).join("\n  - ") +
						"\n\nDo you wish to continue?\n" +
						"    y = yes, idle all of these apps and lose my refund\n" +
						"    n = no, don't idle any of these apps and keep my refund\n" +
						"    c = choose which apps to idle").toLowerCase()) {
							case 'y':
								lowAppsToIdle = lowHourApps.map(function(app) { return app.appid; });
								startErUp();
								break;
							
							case 'n':
								lowAppsToIdle = [];
								startErUp();
								break;
							
							case 'c':
								lowAppsToIdle = [];
								lowHourApps.forEach(function(app) {
									switch(prompt("Idle " + app.name + "? [y/n]").toLowerCase()){
										case 'y':
											lowAppsToIdle.push(app);
											break;
										case 'n':
											break;
										default:
											break;
									}
								});
								startErUp();
							default: 
								getResponseNewApps();
						}
					}
					getResponseNewApps();
				} else {
					lowAppsToIdle = lowHourApps.map(function(app) { return app.appid; });
					startErUp();
				}
				
				function startErUp() {
					if(lowAppsToIdle.length < 1) {
						checkCardApps();
					} else {
						g_OwnedApps = g_OwnedApps.concat(lowAppsToIdle);
						new Notification("Steam Card Farmer",{body:"Idling " + lowAppsToIdle.length + " app" + (lowAppsToIdle.length == 1 ? '' : 's') + " up to 2 hours.\nYou likely won't receive any card drops in this time.\nThis will take " + (2.0 - minPlaytime) + " hours.",icon:"logo.png"});
						for(i=0;i<lowAppsToIdle.length;i++){
							$("#MultiAppsWindow ul").append('<li><div class="li-img"><img src="http://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/'+lowHourApps[i].appid+'/'+lowHourApps[i].icon+'.jpg" alt="Image Not Found" /></div><div class="li-text"><h4 class="li-head">'+lowHourApps[i].name+'</h4><p class="li-sub">'+lowHourApps[i].playtime+' hrs on record</p></div></li>');
						}
						$(".Window").hide(250);
						$("#MultiAppsWindow").show(250);
						client.gamesPlayed(lowAppsToIdle);
						setTimeout(function() {
							client.gamesPlayed([]);
							checkCardApps();
						}, (1000 * 60 * 60 * (2.0 - minPlaytime)));
					}
				}
			} else {
				checkCardApps();
			}
		});
	});
}
client.on('newItems', function(count){
	if(g_OwnedApps.length == 0 || count == 0) {
		return;
	}
	$('#NewItems').html(count);
	$('#NewItems').click(function(){
		client.webLogOn();
		client.once('webSession', function(sessionID, cookies) {
			cookies.forEach(function(cookie) {
				g_Jar.setCookie(cookie, 'https://steamcommunity.com');
			});
		
			request("https://steamcommunity.com/my/inventory", function(err, response, body) {
				if(err || response.statusCode != 200) {
					log("Couldn't request badge page: " + (err || "HTTP error " + response.statusCode) + ". Retrying in 10 seconds...");
					setTimeout(checkMinPlaytime, 10000);
					return;
				}
			});
		});
		$('#NewItems').html("");
	});
	log("Got notification of new inventory items: " + count + " new item" + (count == 1 ? '' : 's'));
	checkCardApps();
});

function checkCardApps() {
	$('#LoadingWindow').fadeIn(250);
	if(g_CheckTimer) {
		clearTimeout(g_CheckTimer);
	}
	log("Checking card drops...");
	$('#LoadingWindow p').html("Checking card drops...");
	
	client.webLogOn();
	client.once('webSession', function(sessionID, cookies) {
		cookies.forEach(function(cookie) {
			g_Jar.setCookie(cookie, 'https://steamcommunity.com');
		});
		
		request("https://steamcommunity.com/my/badges/?p="+g_Page, function(err, response, body) {
			if(err || response.statusCode != 200) {
				log("Couldn't request badge page: " + (err || "HTTP error " + response.statusCode));
				checkCardsInSeconds(30);
				return;
			}
			
			var appsWithDrops = 0;
			var totalDropsLeft = 0;
			var appLaunched = false;
			
			var $_ = Cheerio.load(body);
			var infolines = $_('.progress_info_bold');
			
			for(var i = 0; i < infolines.length; i++) {
				var match = $_(infolines[i]).text().match(/(\d+) card drops? remaining/);
				
				var href = $_(infolines[i]).closest('.badge_row').find('.badge_title_playgame a').attr('href');
				if(!href) {
					continue;
				}
				
				var urlparts = href.split('/');
				var appid = parseInt(urlparts[urlparts.length - 1], 10);
				
				if(!match || !parseInt(match[1], 10) || g_OwnedApps.indexOf(appid) == -1) {
					continue;
				}
				
				appsWithDrops++;
				totalDropsLeft += parseInt(match[1], 10);
				
				if(!appLaunched) {
					appLaunched = true;
					
					var title = $_(infolines[i]).closest('.badge_row').find('.badge_title');
					title.find('.badge_view_details').remove();
					title = title.text().trim();
					
					new Notification("Steam Card Farmer",{body:"Idling \"" + title + "\"\n" + match[1] + " drop" + (match[1] == 1 ? '' : 's') + " remaining",icon:"logo.png"});
					client.gamesPlayed(parseInt(appid, 10));
					$('#CurrentAppWindow img').attr("src","http://cdn.akamai.steamstatic.com/steam/apps/" + appid + "/header.jpg");
					$('#CurrentAppWindow h4').html(title);
					$('#CurrentAppWindow p').html(match[1] + " drop" + (match[1] == 1 ? '' : 's') + " remaining");
				}
			}
			//fadeout loading window
			log(totalDropsLeft + " card drop" + (totalDropsLeft == 1 ? '' : 's') + " remaining across " + appsWithDrops + " app" + (appsWithDrops == 1 ? '' : 's') + " (Page " + g_Page + ")");
			if(totalDropsLeft == 0) {
				if ($_('.badge_row').length == 250){
					log("No drops remaining on page "+g_Page);
					g_Page++;
					log("Checking page "+g_Page);
					checkMinPlaytime();
				} else {
					new Notification("Steam Card Farmer",{body:"All card drops recieved!\nShutting Down...",icon:"logo.png"});
					shutdown(0);
				}
			} else {
				$('.Window').fadeOut(250);
				$('#CurrentAppWindow').fadeIn(250);
				checkCardsInSeconds(1200); // 20 minutes to be safe, we should automatically check when Steam notifies us that we got a new item anyway
			}
		});
	});
}

function checkCardsInSeconds(seconds) {
	g_CheckTimer = setTimeout(checkCardApps, (1000 * seconds));
	g_Start = Date.now();
}

process.on('SIGINT', function() {
	log("Logging off and shutting down");
	shutdown(0);
});

function shutdown(code) {
	client.logOff();
	client.once('disconnected', function() {
		process.exit(code);
	});

	setTimeout(function() {
		process.exit(code);
	}, 500);
}
function startTimer(duration) {
	g_Start = Date.now();
       var diff,
        minutes,
        seconds;
    function timer() {
        // get the number of seconds that have elapsed since 
        // startTimer() was called
        diff = duration - (((Date.now() - g_Start) / 1000) | 0);

        // does the same job as parseInt truncates the float
        minutes = (diff / 60) | 0;
        seconds = (diff % 60) | 0;

        minutes = minutes < 10 ? "0" + minutes : minutes;
        seconds = seconds < 10 ? "0" + seconds : seconds;

        $('#RefreshTime').html(minutes + ":" + seconds); 

        if (diff <= 0) {
            // add one second so that the count down starts at the full duration
            // example 05:00 not 04:59
            g_Start = Date.now();
        }
    };
    // we don't want to wait a full second before the timer starts
    timer();
    setInterval(timer, 1000);
}
$(document).ready(function(){
	startTimer(1200);
	$("#LoginForm").on("submit",function(e){
		e.preventDefault();e.stopPropagation();
		login();
	})
});