const { from, merge, interval, BehaviorSubject } = require('rxjs');
const { map, delay, first, takeUntil, publishReplay, refCount, retryWhen, startWith, skip, mergeMap, switchMap } = require('rxjs/operators');

const backendCreator = require('./backend');
const Constants = require('./constants');

/**
 * creates an authenticated client, that keeps of the latest token according to the calls made
 * however make sure you don't call more than one of the methods of this client at the same time
 * because that may cause the token to go out of sync with the authenticatedClient it self.
 * @param backend
 * @param initialToken
 * @returns {{tokenChange$: Observable<string>, client: {register: *, refresh: *, change: *}}}
 */
function createAuthenticatedClient(backend, initialToken){
	const tokenChange$ = new BehaviorSubject(initialToken);

	function handleTokenChange(body){
		if(body && body.token) tokenChange$.next(body.token);

		return body;
	}

	function wrapFunction(func){
		return (...args) => func(tokenChange$.getValue(), ...args).then(handleTokenChange);
	}

	const client = {
		register: wrapFunction(backend.register),
		refresh: wrapFunction(backend.refresh),
		change: wrapFunction(backend.change),
	};

	return { tokenChange$: tokenChange$.pipe(skip(1), publishReplay(1), refCount()), client };
}

function getTokenFromResponse(resp) {
	if (!resp.token) throw new Error('no token in response');
	return resp.token;
}

function createRefreshedTokenStream(backend, initialToken, refreshInterval, refreshRetry) {
	const refreshToken = async (token) => getTokenFromResponse(await backend.refresh(token));

	return interval(refreshInterval).pipe(
		first(),
		// for each interval, send a request to the backend for token refresh
		mergeMap(() => from(refreshToken(initialToken))),
		// retry if there is an error when getting the token
		retryWhen(errors => errors.pipe(delay(refreshRetry))),
	);
}

module.exports = function({
	backend: backendConfig,
	refresh: { interval = Constants.DEFAULT_TOKEN_REFRESH, retry = Constants.DEFAULT_TOKEN_REFRESH_RETRY  } = {}
}){
	const backend = backendCreator(backendConfig);

	const createWithLogin = (name, password) => (
		from(backend.login(name, password)).pipe(
			mergeMap(({ token }) => createGameServerClientStream(token)),
			publishReplay(1),
			refCount()
		)
	);

	const createWithToken = token => (
		from(backend.refresh(token)).pipe(
			mergeMap(({ token: newToken }) => createGameServerClientStream(newToken)),
			publishReplay(1),
			refCount()
		)
	);

	const createAnonymous = () => (
		from(backend.init()).pipe(
			mergeMap(({ token }) => createGameServerClientStream(token)),
			publishReplay(1),
			refCount()
		)
	);

	function createGameServerClientStream(token){
		const { tokenChange$, client } = createAuthenticatedClient(backend, token);
		// each time a new token is emitted, start the refresh process for it
		const refreshedToken$ = tokenChange$.pipe(
			startWith(token),
			switchMap(newToken => createRefreshedTokenStream(backend, newToken, interval, retry)),
			publishReplay(1),
			refCount()
		);

		// if the token is changed on the client side, we can just emit the new token and the old client
		const result$ = tokenChange$.pipe(
			map(newToken => [newToken, client]),
			takeUntil(refreshedToken$),
			startWith([token, client])
		);

		// if we got a refreshed token, create a new client stream with the refreshed token
		const refreshedResult$ = refreshedToken$.pipe(
			first(),
			switchMap((refreshedToken) => createGameServerClientStream(refreshedToken))
		);

		return merge(result$, refreshedResult$).pipe(publishReplay(1), refCount());
	}

	return {
		createWithLogin,
		createWithToken,
		createAnonymous,
	};
};
