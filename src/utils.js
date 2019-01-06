const { Observable } = require('rxjs');

function fromSocketEvent(stream, dataEventName) {
	dataEventName || (dataEventName = 'data');

	return new Observable(function (observer) {
		function dataHandler (data) {
			observer.next(data);
		}

		stream.on(dataEventName, dataHandler);

		return function () {
			stream.off(dataEventName, dataHandler);
		};
	});
}

module.exports = {
	fromSocketEvent,
};
