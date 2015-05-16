#!/usr/bin/env node

var Steam = require('steam');
var SteamStuff = require('steamstuff');
var prompt = require('prompt');
var request = require('request');
var Cheerio = require('cheerio');

var client = new Steam.SteamClient();
SteamStuff(Steam, client);

var g_Jar = request.jar();
request = request.defaults({"jar": g_Jar});

var g_CheckTimer;

function log(message) {
	var date = new Date();
	var time = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()];
	
	for(var i = 1; i < 6; i++) {
		if(time[i] < 10) {
			time[i] = '0' + time[i];
		}
	}
	
	console.log(time[0] + '-' + time[1] + '-' + time[2] + ' ' + time[3] + ':' + time[4] + ':' + time[5] + ' - ' + message);
};

var g_Username;
var g_Password;

var argsStartIdx = 2;
if(process.argv[0] == 'steamcardfarmer') {
	argsStartIdx = 1;
}

if(process.argv.length == argsStartIdx + 2) {
	log("Reading Steam credentials from command line");
	client.logOn({
		"accountName": process.argv[argsStartIdx],
		"password": process.argv[argsStartIdx + 1]
	});
} else {
	prompt.start();
	prompt.get({
		"properties": {
			"username": {
				"required": true,
			},
			"password": {
				"hidden": true,
				"required": true
			}
		}
	}, function(err, result) {
		if(err) {
			log("Error: " + err);
			shutdown(1);
			return;
		}
		
		log("Initializing Steam client...");
		client.logOn({
			"accountName": result.username,
			"password": result.password
		});
	
	g_Username = result.username;
	g_Password = result.password;
	});
}

client.on('loggedOn', function() {
	log("Logged into Steam!");
});

client.on('webSessionID', function(sessionID) {
	checkCardApps();
});

client.on('error', function(e) {
	if(e.eresult == Steam.EResult.AccountLogonDenied || e.eresult == Steam.EResult.AccountLogonDeniedNeedTwoFactorCode) {
		return; // SteamStuff handles it
	}
	
	log("Error: " + e);
	setTimeout(function() {
		client.logOn({
			"accountName": g_Username,
			"password": g_Password
		});
	}, 10000);
});

client._handlers[Steam.EMsg.ClientItemAnnouncements] = function(data) {
	var proto = Steam.Internal.CMsgClientItemAnnouncements.decode(data);
	if(proto.countNewItems === 0) {
		return;
	}
	
	log("Got notification of new inventory items: " + proto.countNewItems + " new item" + (proto.countNewItems == 1 ? '' : 's'));
	checkCardApps();
};

function checkCardApps() {
	if(g_CheckTimer) {
		clearTimeout(g_CheckTimer);
	}
	
	log("Checking card drops...");
	
	client.webLogOn(function(cookies) {
		cookies.forEach(function(cookie) {
			g_Jar.setCookie(cookie, 'https://steamcommunity.com');
		});
		
		request("https://steamcommunity.com/my/badges/", function(err, response, body) {
			if(err || response.statusCode != 200) {
				log("Couldn't request badge page: " + (err || "HTTP error " + response.statusCode));
				checkCardsInSeconds(30);
				return;
			}
			
			var appsWithDrops = 0;
			var totalDropsLeft = 0;
			var appLaunched = false;
			
			var $ = Cheerio.load(body);
			var infolines = $('.progress_info_bold');
			for(var i = 0; i < infolines.length; i++) {
				var match = $(infolines[i]).text().match(/(\d+) card drops? remaining/);
				if(!match || !parseInt(match[1], 10)) {
					continue;
				}
				
				appsWithDrops++;
				totalDropsLeft += parseInt(match[1], 10);
				
				if(!appLaunched) {
					appLaunched = true;
					var urlparts = $(infolines[i]).parent().find('.badge_title_playgame a').attr('href').split('/');
					var appid = urlparts[urlparts.length - 1];
					
					var title = $(infolines[i]).parent().parent().find('.badge_title');
					title.find('.badge_view_details').remove();
					title = title.text().trim();
					
					log("Idling app " + appid + " \"" + title + "\" - " + match[1] + " drop" + (match[1] == 1 ? '' : 's') + " remaining");
					client.gamesPlayed([parseInt(appid, 10)]);
				}
			}
			
			log(totalDropsLeft + " card drop" + (totalDropsLeft == 1 ? '' : 's') + " remaining across " + appsWithDrops + " app" + (appsWithDrops == 1 ? '' : 's'));
			if(totalDropsLeft == 0) {
				shutdown(0);
			} else {
				checkCardsInSeconds(1200); // 20 minutes to be safe, we should automatically check when Steam notifies us that we got a new item anyway
			}
		});
	});
}

function checkCardsInSeconds(seconds) {
	g_CheckTimer = setTimeout(checkCardApps, (1000 * seconds));
}

process.on('SIGINT', function() {
	log("Logging off and shutting down");
	shutdown(0);
});

function shutdown(code) {
	client.gamesPlayed([]);
	client.logOff();
	setTimeout(function() {
		process.exit(code);
	}, 500);
}
