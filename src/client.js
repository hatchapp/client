const { from, interval, BehaviorSubject, } = require('rxjs');
const { map, mergeMap, shareReplay, switchMap, withLatestFrom } = require('rxjs/operators');

const backendCreator = require('./backend');
const Constants = require('./constants');

module.exports = function({ backend: backendConfig, refreshInterval = Constants.DEFAULT_TOKEN_REFRESH }){
	const backend = backendCreator(backendConfig);

	async function createWithLogin(name, password){
		const { token } = await backend.login(name, password);

		return createGameServerClientStream(token);
	}

	async function createWithToken(token){
		const { token: newToken } = await backend.refresh(token);

		return createGameServerClientStream(newToken);
	}

	async function createAnonymous(){
		const { token } = await backend.init();

		return createGameServerClientStream(token);
	}

	function createGameServerClientStream(token){
		const token$ = new BehaviorSubject(token);

		// for each new token
		const client$ = token$.pipe(
			// create an authenticated client, that uses the new token
			map(newToken => backend.createAuthenticatedClient(newToken, (changedToken) => token$.next(changedToken))),
			// only one client needs to be active at the same time
			shareReplay(1)
		);

		const tokenRefreshSubscribe = token$.pipe(
			switchMap(() => interval(refreshInterval)),
			withLatestFrom(client$),
			// for each interval, send a request to the backend for token refresh
			mergeMap(([_, client]) => from(client.refresh().catch(() => null)))
		).subscribe(() => null);

		async function stop(){
			token$.complete();
			tokenRefreshSubscribe.unsubscribe();
		}

		return {
			client$,
			token$,
			stop,
		};
	}

	return {
		createWithLogin,
		createWithToken,
		createAnonymous,
	};
};
