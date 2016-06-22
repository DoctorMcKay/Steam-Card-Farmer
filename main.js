// Third-party modules
var SteamUser = require('steam-user');
var SteamCommunity = require('steamcommunity');

Electron = require('electron');
BrowserWindow = Electron.BrowserWindow;
app = Electron.app;

g_CurrentWindow='';

// Set up stuff that needs to be accessed across windows
exports.steamClient = new SteamUser({"promptSteamGuardCode": false});
exports.steamCommunity = new SteamCommunity();

app.on('ready', () => {
	// Electron has initialized
	openWindow("index.html");
});

function openWindow(filename) {
	if (g_CurrentWindow) {
		throw new Error("A window is already open");
	}

	g_CurrentWindow = new BrowserWindow({
		"frame": false,
		"titleBarStyle": "hidden",
		"width": 350,
		"height": 500,
		"resizable": false,
		"position": "center",
		"min_width": 350,
		"min_height": 500,
		"max_width": 350,
		"title": "Steam Card Farmer"
	});

	g_CurrentWindow.setMenu(null);
	g_CurrentWindow.loadURL(`file://${__dirname}/html/${filename}`);
	g_CurrentWindow.on('closed', () => {
		g_CurrentWindow = null;
	});
	//Open Dev Tools
	g_CurrentWindow.webContents.openDevTools({mode:"detach"});
}
