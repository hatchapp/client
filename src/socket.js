const { combineLatest, of, merge, throwError, Observable, NEVER } = require('rxjs');
const { delay, first, refCount, retryWhen, publishReplay, switchMap } = require('rxjs/operators');
const socketio = require('socket.io-client');

const { DEFAULT_RECONNECT_DELAY } = require('./constants');
const { fromSocketEvent } = require('./utils');

function createSocketWithToken(socketURL, token, roomId){
	return socketio(socketURL, {
		query: { roomId, token },
		forceNew: true,
		reconnection: false,
	});
}

function createSocketDisconnectStream(socket){
	return (
		['connect_error', 'connect_timeout', 'disconnect']
			.reduce((d$, event) => merge(d$, fromSocketEvent(socket, event)), NEVER)
	)
}

module.exports = ({ url: socketURL, reconnectDelay = DEFAULT_RECONNECT_DELAY } = {}) => {
	//
	function createSocket(token$, roomId){
		// each time the socket disconnects,
		return of(null).pipe(
			// create a socket connection, and listen to its disconnect
			switchMap(() => combineLatest(token$).pipe(first(), switchMap(([token]) => {
				const socket = createSocketWithToken(socketURL, token, roomId);
				const disconnect$ = createSocketDisconnectStream(socket);
				const socket$ = new Observable(s$ => {
					s$.next(socket);

					return function() { socket.close(true); };
				});

				return merge(
					socket$,
					disconnect$.pipe(switchMap((_) => throwError(new Error('disconnected from the socket'))))
				);
			}))),
			// retry with some delay
			retryWhen(errors => errors.pipe(delay(reconnectDelay))),
			// only one socket connection should be active at the same time
			publishReplay(1),
			refCount(),
		);
	}

	return {
		createSocket,
	};
};

