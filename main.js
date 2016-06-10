var Electron = require('electron');
var BrowserWindow = Electron.BrowserWindow;
var app = Electron.app;

var g_CurrentWindow;

app.on('ready', () => {
	// Electron has initialized
	openWindow("Login", 400, "login.html");
});

function openWindow(title, height, filename) {
	if (g_CurrentWindow) {
		throw new Error("A window is already open");
	}

	g_CurrentWindow = new BrowserWindow({
		"width": 832, // 8px of body margin on each side
		"height": height,
		"title": title + " - Steam Card Farmer",
		"resizable": false}
	);

	g_CurrentWindow.setMenu(null);
	g_CurrentWindow.loadURL(`file://${__dirname}/html/${filename}`);
	g_CurrentWindow.on('closed', () => {
		g_CurrentWindow = null;
	});

	g_CurrentWindow.webContents.openDevTools();
}
