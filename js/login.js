var Electron = require('electron');
var Main = Electron.remote.require('./main.js');

var username = document.getElementById('username');
var password = document.getElementById('password');
var authCode = document.getElementById('auth_code');
var twoFactorCode = document.getElementById('two_factor_code');
var button = document.getElementById('submit-btn');
var error = document.getElementById('logon-error');

addInputChangeHook('input', function() {
	// Make sure all fields are filled out
	button.disabled = !username.value || !password.value;
});

document.getElementById('login-form').onsubmit = function() {
	setDisabled(true);
	show(error, false);

	var onError = (err) => {
		setDisabled(false);
		show(error, true);
		error.textContent = "Can't log on: " + err.message;
		clearListeners();
	};

	var onLoggedOn = (result) => {
		// The main script will also handle this
		clearListeners();
	};

	var onSteamGuard = (domain, callback) => {
		setDisabled(false);

		if (domain) {
			show('#auth_code_outer', true);
			show('#two_factor_code_outer', false);
			authCode.focus();
		} else {
			show('#auth_code_outer', false);
			show('#two_factor_code_outer', true);
			twoFactorCode.focus();
		}
	};
	
	Main.steamClient.once('error', onError);
	Main.steamClient.once('onLoggedOn', onLoggedOn);
	Main.steamClient.once('steamGuard', onSteamGuard);
	Main.steamClient.logOn({
		"accountName": username.value,
		"password": password.value,
		"authCode": authCode.value,
		"twoFactorCode": twoFactorCode.value
	});

	function clearListeners() {
		Main.steamClient.removeListener('error', onError);
		Main.steamClient.removeListener('loggedOn', onLoggedOn);
		Main.steamClient.removeListener('steamGuard', onSteamGuard);
	}

	return false;
};

function setDisabled(disabled) {
	username.disabled = disabled;
	password.disabled = disabled;
	authCode.disabled = disabled;
	twoFactorCode.disabled = disabled;
	button.disabled = disabled;
}
