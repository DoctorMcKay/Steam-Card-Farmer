var username = document.getElementById('username');
var password = document.getElementById('password');
var button = document.getElementById('submit-btn');

addInputChangeHook('input', function() {
	// Make sure all fields are filled out
	button.disabled = !username.value || !password.value;
});

document.getElementById('login-form').onsubmit = function() {
	// TODO
	show('#auth_code_outer', true);
	return false;
};
