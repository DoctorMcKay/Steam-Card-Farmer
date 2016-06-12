function addInputChangeHook(selector, callback) {
	var elements = document.querySelectorAll(selector);
	for (var i = 0; i < elements.length; i++) {
		elements[i].onchange = elements[i].onkeyup = callback;
	}
}

function show(element, visible) {
	if (typeof element === 'string') {
		var elements = document.querySelectorAll(element);
		for (var i = 0; i < elements.length; i++) {
			show(elements[i], visible);
		}

		return;
	}

	var classes = element.className.split(' ');
	var idx = classes.indexOf('hidden');
	if (visible && idx != -1) {
		classes.splice(idx, 1);
	} else if (!visible && idx == -1) {
		classes.push('hidden');
	}

	element.className = classes.join(' ');
}
