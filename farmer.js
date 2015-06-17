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

var g_PackageInfo = {};
var g_OwnedApps = [];
var g_HasWebSessionID = false;

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
	log("Waiting for license info...");
});

client.on('webSessionID', function(sessionID) {
	g_HasWebSessionID = true;
});

client.on('licenses', function(licenses) {
	log("Got " + licenses.length + " owned licenses. Requesting package info...");
	
	var timeoutSet = false;
	client.picsGetProductInfo([], licenses.map(function(license) { return license.packageId; }), function(response) {
		Object.keys(response.packages).forEach(function(pkg) {
			pkg = response.packages[pkg];
			g_PackageInfo[pkg.packageid] = pkg.data[pkg.packageid];
		});
		
		if(!timeoutSet) {
			setTimeout(checkMinPlaytime, 2000);
			timeoutSet = true;
		}
	});
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

function checkMinPlaytime() {
	if(!g_HasWebSessionID) {
		setTimeout(checkMinPlaytime, 1000);
		return;
	}
	
	log("Checking app playtime...");
	client.webLogOn(function(cookies) {
		cookies.forEach(function(cookie) {
			g_Jar.setCookie(cookie, 'https://steamcommunity.com');
		});
		
		request("https://steamcommunity.com/my/badges/", function(err, response, body) {
			if(err || response.statusCode != 200) {
				log("Couldn't request badge page: " + (err || "HTTP error " + response.statusCode) + ". Retrying in 10 seconds...");
				setTimeout(checkMinPlaytime, 10000);
				return;
			}
			
			var lowHourApps = [];
			
			var $ = Cheerio.load(body);
			$('.badge_row').each(function() {
				var row = $(this);
				var overlay = row.find('.badge_row_overlay');
				if(!overlay) {
					return;
				}
				
				var match = overlay.attr('href').match(/\/gamecards\/(\d+)/);
				if(!match) {
					return;
				}
				
				var appid = parseInt(match[1], 10);
				
				// Check if app is owned
				var owned = false;
				var newlyPurchased = false;
				
				client.licenses.forEach(function(license) {
					var pkg = g_PackageInfo[license.packageId];
					if(pkg.extended && pkg.extended.freeweekend) {
						return;
					}
					
					for(var i in pkg.appids) {
						if(pkg.appids[i] == appid) {
							owned = true;
							
							var timeCreatedAgo = Math.floor(Date.now() / 1000) - license.timeCreated;
							if(timeCreatedAgo < (60 * 60 * 24 * 14) && [Steam.EPaymentMethod.ActivationCode, Steam.EPaymentMethod.GuestPass, Steam.EPaymentMethod.Complimentary].indexOf(license.paymentMethod) == -1) {
								newlyPurchased = true;
							}
						}
					}
				});
				
				var name = row.find('.badge_title');
				name.find('.badge_view_details').remove();
				name = name.text().replace(/\n/g, '').replace(/\r/g, '').replace(/\t/g, '').trim();
				
				if(!owned) {
					log("Skipping app " + appid + " \"" + name + "\", not owned");
					return;
				}
				
				// Find out if we have drops left
				var drops = row.find('.progress_info_bold').text().match(/(\d+) card drops remaining/);
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
						"newlyPurchased": newlyPurchased
					});
				}
				
				if(playtime >= 2.0 || !newlyPurchased) {
					g_OwnedApps.push(appid);
				}
			});
			
			if(lowHourApps.length > 1) {
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
					log("=========================================================");
					log("WARNING: Proceeding will waive your right to a refund on\nthe following apps:\n  - " + newApps.map(function(app) { return app.name; }).join("\n  - ") +
						"\n\nDo you wish to continue?\n" +
						"    y = yes, idle all of these apps and lose my refund\n" +
						"    n = no, don't idle any of these apps and keep my refund\n" +
						"    c = choose which apps to idle");
					
					prompt.start();
					prompt.get({
						"properties": {
							"choice": {
								"required": true,
								"pattern": /^[yncYNC]$/
							}
						}
					}, function(err, result) {
						if(err) {
							log("ERROR: " + err.message);
							return;
						}
						
						switch(result.choice.toLowerCase()) {
							case 'y':
								lowAppsToIdle = lowHourApps.map(function(app) { return app.appid; });
								startErUp();
								break;
							
							case 'n':
								lowAppsToIdle = [];
								startErUp();
								break;
							
							case 'c':
								var properties = {};
								lowHourApps.forEach(function(app) {
									properties[app.appid] = {
										"description": "Idle " + app.name + "? [y/n]",
										"pattern": /^[ynYN]$/,
										"required": true
									};
								});
								
								prompt.get({"properties": properties}, function(err, result) {
									for(var appid in result) {
										if(isNaN(parseInt(appid, 10))) {
											continue;
										}
										
										if(result[appid].toLowerCase() == 'y') {
											lowAppsToIdle.push(parseInt(appid, 10));
										}
									}
									
									startErUp();
								});
						}
					});
				} else {
					lowAppsToIdle = lowHourApps.map(function(app) { return app.appid; });
					startErUp();
				}
				
				function startErUp() {
					if(lowAppsToIdle.length < 1) {
						checkCardApps();
					} else {
						g_OwnedApps = g_OwnedApps.concat(lowAppsToIdle);
						client.gamesPlayed(lowAppsToIdle);
						log("Idling " + lowAppsToIdle.length + " app" + (lowAppsToIdle.length == 1 ? '' : 's') + " up to 2 hours.\nYou likely won't receive any card drops in this time.\nThis will take " + (2.0 - minPlaytime) + " hours.");
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
				
				var href = $(infolines[i]).parent().find('.badge_title_playgame a').attr('href');
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
