const { of, merge, throwError, BehaviorSubject, NEVER } = require('rxjs');
const { first, delay, map, mergeMap, retryWhen, shareReplay, withLatestFrom } = require('rxjs/operators');
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
		const alive$ = new BehaviorSubject(null);
		// each time the socket disconnects,
		const socket$ = alive$.pipe(
			// create a socket connection, and listen to its disconnect
			mergeMap(() => of(null).pipe(withLatestFrom(token$), mergeMap(([_, token]) => {
				const socket = createSocketWithToken(socketURL, token, roomId);
				const disconnect$ = createSocketDisconnectStream(socket);

				return merge(
					of(socket),
					disconnect$.pipe(mergeMap((_) => throwError(new Error('disconnected from the socket'))))
				);
			}))),
			// retry with some delay
			retryWhen(errors => errors.pipe(delay(reconnectDelay))),
			// only one socket connection should be active at the same time
			shareReplay(1)
		);

		async function stop(){
			alive$.complete();
			await socket$.pipe(first()).forEach(socket => socket.close(true));
		}

		return {
			socket$,
			stop,
		};
	}

	return {
		createSocket,
	};
};

